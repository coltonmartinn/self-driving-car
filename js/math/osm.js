// Converts Overpass API JSON (OpenStreetMap) into world data
const Osm = {
   // Roads cars can drive on (footpaths, service alleys, etc. are left out)
   DRIVABLE: new Set([
      "motorway", "trunk", "primary", "secondary", "tertiary",
      "unclassified", "residential", "living_street", "road",
      "motorway_link", "trunk_link", "primary_link", "secondary_link", "tertiary_link",
   ]),

   UNITS_PER_METER: 10, // 10 world units = 1 m (roads are 140 units = 14 m wide)

   // Flat-earth projection around (lat0, lon0); fine for a few kilometers
   projection(lat0, lon0) {
      const k = Osm.UNITS_PER_METER;
      const metersPerLon = 111320 * Math.cos(degToRad(lat0));
      const metersPerLat = 110540;
      const round = (v) => Math.round(v * 10) / 10;
      return (lat, lon) =>
         new Point(
            round((lon - lon0) * metersPerLon * k),
            round(-(lat - lat0) * metersPerLat * k)
         );
   },

   // options: lat0/lon0 = map center (defaults to the data's center),
   // radius = meters; road segments entirely outside it are dropped,
   // allHighways = keep every highway type (for hand-pasted data)
   parse(data, { lat0 = undefined, lon0 = undefined, radius = Infinity, allHighways = false } = {}) {
      const nodes = new Map();
      for (const el of data.elements) {
         if (el.type == "node") {
            nodes.set(el.id, el);
         }
      }

      if (lat0 === undefined) {
         let minLat = Infinity, maxLat = -Infinity, minLon = Infinity, maxLon = -Infinity;
         for (const n of nodes.values()) {
            minLat = Math.min(minLat, n.lat);
            maxLat = Math.max(maxLat, n.lat);
            minLon = Math.min(minLon, n.lon);
            maxLon = Math.max(maxLon, n.lon);
         }
         lat0 = (minLat + maxLat) / 2;
         lon0 = (minLon + maxLon) / 2;
      }
      const project = Osm.projection(lat0, lon0);
      const maxDist = radius * Osm.UNITS_PER_METER;
      const origin = new Point(0, 0);

      const ways = data.elements.filter((e) => e.type == "way");

      // ---- roads ----
      const pointById = new Map();
      const getPoint = (id) => {
         if (!pointById.has(id)) {
            const n = nodes.get(id);
            if (!n) {
               return null;
            }
            const p = project(n.lat, n.lon);
            p.id = id;
            pointById.set(id, p);
         }
         return pointById.get(id);
      };

      const segments = [];
      const seen = new Set();
      for (const way of ways) {
         const tags = way.tags || {};
         if (!tags.highway || tags.area == "yes") continue;
         if (!allHighways && !Osm.DRIVABLE.has(tags.highway)) continue;

         const oneWay =
            ["yes", "1", "true", "-1"].includes(tags.oneway) ||
            tags.junction == "roundabout" ||
            tags.highway == "motorway";
         const reversed = tags.oneway == "-1";

         for (let i = 1; i < way.nodes.length; i++) {
            let a = getPoint(way.nodes[i - 1]);
            let b = getPoint(way.nodes[i]);
            if (!a || !b || a.equals(b)) continue;
            if (distance(a, origin) > maxDist && distance(b, origin) > maxDist) continue;
            if (reversed) {
               [a, b] = [b, a];
            }
            const key = a.id < b.id ? a.id + "-" + b.id : b.id + "-" + a.id;
            if (seen.has(key)) continue;
            seen.add(key);
            segments.push(new Segment(a, b, oneWay));
         }
      }

      const used = new Set();
      for (const s of segments) {
         used.add(s.p1);
         used.add(s.p2);
      }
      const points = [...used];

      // ---- buildings ----
      const buildings = [];
      for (const way of ways) {
         const tags = way.tags || {};
         if (!tags.building) continue;
         const ids = way.nodes.slice();
         if (ids.length > 1 && ids[0] == ids[ids.length - 1]) {
            ids.pop(); // closed ways repeat the first node
         }
         if (ids.length < 3) continue;
         const pts = [];
         for (const id of ids) {
            const n = nodes.get(id);
            if (n) pts.push(project(n.lat, n.lon));
         }
         if (pts.length < 3) continue;
         const center = pts.reduce((c, p) => add(c, scale(p, 1 / pts.length)), origin);
         if (distance(center, origin) > maxDist * 1.1) continue;

         let meters = parseFloat(tags.height);
         if (isNaN(meters)) {
            const levels = parseFloat(tags["building:levels"]);
            meters = isNaN(levels) ? 9 : levels * 3.2;
         }
         const height = Math.max(70, Math.min(450, meters * Osm.UNITS_PER_METER));
         buildings.push(new Building(new Polygon(pts), height, "flat"));
      }

      // ---- signals and signs that sit on road nodes ----
      const features = { signals: [], stops: [], yields: [], crossings: [] };
      for (const [id, p] of pointById) {
         if (!used.has(p)) continue;
         const tags = nodes.get(id).tags || {};
         switch (tags.highway) {
            case "traffic_signals":
               features.signals.push(p);
               break;
            case "stop":
               features.stops.push(p);
               break;
            case "give_way":
               features.yields.push(p);
               break;
            case "crossing":
               features.crossings.push(p);
               break;
         }
      }

      return { points, segments, buildings, features };
   },

   // Kept for the editor's "paste data" option
   parseRoads(data) {
      const { points, segments } = Osm.parse(data, { allHighways: true });
      return { points, segments };
   },

   // Turns real-world signals/signs into markings in a generated world
   createMarkings(world, features) {
      const rw = world.roadWidth;
      const markings = [];
      const neighbors = WorldGenerator.getNeighbors(world.graph);
      const intersections = world.graph.points.filter(
         (p) => (neighbors.get(p) || []).length >= 3
      );

      // Signals are often mapped a few meters before the junction,
      // so snap each one to the nearest intersection
      const signalized = new Set();
      for (const s of features.signals) {
         const p = getNearestPoint(s, intersections, 400);
         if (p) signalized.add(p);
      }
      for (const p of signalized) {
         for (const { point: q, seg } of neighbors.get(p)) {
            const m = WorldGenerator.approachMarking(world, p, q, seg, "light");
            if (m) markings.push(m);
         }
      }

      // A stop/yield node lies on one approach road: find which one
      const signOnApproach = (node, kind) => {
         const p = getNearestPoint(node, intersections, 400);
         if (!p || signalized.has(p)) return;
         let best = null;
         let bestDist = Infinity;
         for (const n of neighbors.get(p)) {
            const d = n.seg.distanceToPoint(node);
            if (d < bestDist) {
               bestDist = d;
               best = n;
            }
         }
         if (best) {
            const m = WorldGenerator.approachMarking(world, p, best.point, best.seg, kind);
            if (m) markings.push(m);
         }
      };
      const handled = new Set();
      for (const s of features.stops) {
         if (!handled.has(s)) {
            handled.add(s);
            signOnApproach(s, "stop");
         }
      }
      for (const s of features.yields) {
         signOnApproach(s, "yield");
      }

      // Crosswalks, unless they'd sit inside an intersection
      for (const c of features.crossings) {
         const nearestJunction = getNearestPoint(c, intersections);
         if (nearestJunction && distance(c, nearestJunction) < rw * 0.9) continue;
         const n = (neighbors.get(c) || [])[0];
         if (!n) continue;
         markings.push(new Crossing(c, n.seg.directionVector(), rw, rw / 2));
      }

      return markings;
   },
};
