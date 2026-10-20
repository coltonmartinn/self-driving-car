class World {
   // asphalt, a yellow center line on two-way roads, white edge lines
   static STYLE = { road: "#575d66", centerLine: "#f2c230", edgeLine: "#f4f4f2", island: "#6fa055", curb: "#d9d6cc",
      label: "#ffffff", labelHalo: "rgba(40, 44, 50, 0.85)" };

   constructor(
      graph,
      roadWidth = 140, // 14 m: roomy enough for the learning cars
      roadRoundness = 10,
      buildingWidth = 150,
      buildingMinLength = 150,
      spacing = 50,
      treeSize = 160
   ) {
      this.graph = graph;
      this.roadWidth = roadWidth;
      this.roadRoundness = roadRoundness;
      this.buildingWidth = buildingWidth;
      this.buildingMinLength = buildingMinLength;
      this.spacing = spacing;
      this.treeSize = treeSize;

      // "generated": buildings are placed along the roads automatically
      // "osm": real building footprints imported from OpenStreetMap
      this.source = "generated";
      this.place = null; // { name, lat, lon, radius } for real places
      this.roundabouts = []; // [{ center, radius, ring, approaches }] (see Roundabouts)

      this.envelopes = [];
      this.roadBorders = [];
      this.buildings = [];
      this.trees = [];
      this.laneGuides = null; // computed on demand, see getLaneGuides()
      this.streetLabels = null; // computed on demand, see getStreetLabels()
      this.mapEdges = new Set(); // road ends where the map was cut off (see #findMapEdges)
      this.edgePoints = null; // points a world says run off the map (e.g. the practice highway)
      this.laneLines = []; // dashed lines between lanes going the same way (the practice highway)
      this.highway = null; // the practice highway's layout (see HighwayCourse)

      this.markings = [];

      // runtime-only state (not saved)
      this.cars = [];
      this.bestCar = null;
      this.traffic = [];
      this.parked = []; // vehicles parked for good (see Simulation.addParked)
      this.crowd = null; // pedestrians (a Crowd), if any
      this.route = null; // GPS route (a Route) and its destination marker
      this.destination = null;
      this.frameCount = 0;
      this.intersections = [];
      this.lightTiming = { green: 4, yellow: 1 }; // seconds

      this.zoom = 1;
      this.offset = null;
      this.roadWidthChanged = false; // set by load() for saves from older versions

      this.generate();
   }

   static load(info) {
      const world = new World(new Graph());
      world.graph = Graph.load(info.graph);
      for (const key of [
         "roadRoundness",
         "buildingWidth",
         "buildingMinLength",
         "spacing",
         "treeSize",
         "source",
         "place",
         "roundabouts",
      ]) {
         if (info[key] !== undefined) {
            world[key] = info[key];
         }
      }
      world.markings = (info.markings || []).map((m) => Marking.load(m));
      world.zoom = info.zoom || 1;
      world.offset = info.offset ? new Point(info.offset.x, info.offset.y) : null;

      if (info.envelopes && info.roadBorders) {
         // finished road shapes handed over by the background worker
         const loadPoint = (p) => new Point(p.x, p.y);
         world.envelopes = info.envelopes.map((e) => Envelope.load(e));
         world.roadBorders = info.roadBorders.map(
            (s) => new Segment(loadPoint(s.p1), loadPoint(s.p2), s.oneWay)
         );
         world.culDeSacs = (info.culDeSacs || []).map(loadPoint);
         world.#findMapEdges();
         World.fillSpeedLimits(world.graph);
         world.laneGuides = null;
         world.lightGroups = null;
         world.#computeIntersections();
      } else {
         // saves don't include road shapes; they're quick to rebuild
         world.generateRoads();
      }
      if (info.buildings) {
         world.buildings = info.buildings.map((b) => Building.load(b));
         world.trees = (info.trees || []).map((t) => Tree.load(t));
      }
      // saved with a different road width (older version): refit buildings/trees
      world.roadWidthChanged =
         info.roadWidth !== undefined && info.roadWidth != world.roadWidth;
      if (!info.buildings || world.roadWidthChanged) {
         world.generateItems();
      }
      return world;
   }

   toJSON() {
      return {
         source: this.source,
         place: this.place,
         roundabouts: this.roundabouts,
         graph: this.graph,
         roadWidth: this.roadWidth,
         roadRoundness: this.roadRoundness,
         buildingWidth: this.buildingWidth,
         buildingMinLength: this.buildingMinLength,
         spacing: this.spacing,
         treeSize: this.treeSize,
         buildings: this.buildings,
         trees: this.trees,
         markings: this.markings,
         zoom: this.zoom,
         offset: this.offset,
      };
   }

   // Everything, including the computed road shapes (used to hand a
   // finished world from the background worker to the page)
   toFullJSON() {
      return {
         ...this.toJSON(),
         envelopes: this.envelopes,
         roadBorders: this.roadBorders,
         culDeSacs: this.culDeSacs,
      };
   }

   generate() {
      this.generateRoads();
      this.generateItems();
   }

   generateRoads() {
      this.envelopes = this.graph.segments.map(
         (seg) => new Envelope(seg, this.roadWidth, this.roadRoundness)
      );
      this.#findMapEdges();
      World.fillSpeedLimits(this.graph);
      this.culDeSacs = this.#findCulDeSacs();
      for (const center of this.culDeSacs) {
         this.envelopes.push(Envelope.circle(center, this.getCulDeSacRadius()));
      }
      this.roadBorders = Polygon.union(this.envelopes.map((e) => e.poly));
      this.laneGuides = null;
      this.streetLabels = null;
      this.lightGroups = null;
      this.#computeIntersections();
   }

   getCulDeSacRadius() {
      return this.roadWidth * 1.25;
   }

   // Maps often post a street's limit on only some of its pieces: the others
   // get it from the connected pieces of the same street (by name)
   static fillSpeedLimits(graph) {
      const byPoint = new Map();
      for (const seg of graph.segments) {
         if (!seg.name) continue;
         for (const p of [seg.p1, seg.p2]) {
            if (!byPoint.has(p)) byPoint.set(p, []);
            byPoint.get(p).push(seg);
         }
      }
      const queue = graph.segments.filter((s) => s.name && s.speedLimit);
      while (queue.length > 0) {
         const seg = queue.shift();
         for (const p of [seg.p1, seg.p2]) {
            for (const next of byPoint.get(p) || []) {
               if (!next.speedLimit && next.name == seg.name) {
                  next.speedLimit = seg.speedLimit;
                  queue.push(next);
               }
            }
         }
      }
   }

   // Real places are downloaded as a circle, so roads crossing its edge are
   // cut off there. Those ends aren't dead ends: the road runs on off the map.
   // (A world can also list such points itself, in edgePoints.)
   #findMapEdges() {
      this.mapEdges = new Set();
      if (this.edgePoints) {
         const ends = new Set(this.edgePoints);
         for (const p of this.graph.points) {
            if (ends.has(p)) this.mapEdges.add(p);
         }
      }
      const place = this.place;
      if (this.source != "osm" || !place || !place.radius) {
         return;
      }
      const edge = (place.loadRadius || place.radius) * Osm.UNITS_PER_METER - 1;
      const degree = new Map();
      for (const seg of this.graph.segments) {
         degree.set(seg.p1, (degree.get(seg.p1) || 0) + 1);
         degree.set(seg.p2, (degree.get(seg.p2) || 0) + 1);
      }
      for (const p of this.graph.points) {
         // (a road piece is only kept if one end is inside the circle)
         if (degree.get(p) == 1 && Math.hypot(p.x, p.y) > edge) {
            this.mapEdges.add(p);
         }
      }
   }

   // How far from the middle drives should stay (the area that was picked,
   // inside the extra margin downloaded around it), or Infinity
   getAreaRadius() {
      return this.source == "osm" && this.place && this.place.radius
         ? this.place.radius * Osm.UNITS_PER_METER
         : Infinity;
   }

   // Dead ends get a round turnaround bulb, unless they're a tiny stub right
   // next to an intersection (the bulb would just swallow the junction), or
   // where the map was cut off
   #findCulDeSacs() {
      const degree = new Map();
      for (const seg of this.graph.segments) {
         degree.set(seg.p1, (degree.get(seg.p1) || 0) + 1);
         degree.set(seg.p2, (degree.get(seg.p2) || 0) + 1);
      }
      const junctions = this.graph.points.filter((p) => degree.get(p) >= 3);
      const minDistance = this.getCulDeSacRadius() * 1.6;
      return this.graph.points.filter(
         (p) =>
            degree.get(p) == 1 &&
            !this.mapEdges.has(p) &&
            !getNearestPoint(p, junctions, minDistance)
      );
   }

   generateItems() {
      if (this.source == "osm") {
         this.buildings = this.#removeBuildingsOnRoads(this.buildings);
      } else {
         this.buildings = this.#generateBuildings();
      }
      this.trees = this.#generateTrees();
   }

   // Where to write street names: each named street is followed through its
   // pieces, and gets a label every so often along it, away from other
   // labels. [{ x, y, dir, name, room }], room = how long the label may be
   getStreetLabels() {
      if (this.streetLabels) {
         return this.streetLabels;
      }
      const labels = [];
      const byName = new Map();
      for (const seg of this.graph.segments) {
         if (!seg.name) continue;
         if (!byName.has(seg.name)) byName.set(seg.name, []);
         byName.get(seg.name).push(seg);
      }
      const spacing = 1000; // a label about every 100 m
      for (const [name, segs] of byName) {
         // the street as runs of connected pieces
         const ends = new Map();
         for (const seg of segs) {
            for (const p of [seg.p1, seg.p2]) {
               if (!ends.has(p)) ends.set(p, []);
               ends.get(p).push(seg);
            }
         }
         const used = new Set();
         const starts = [...ends.keys()].sort((a, b) => Number(ends.get(a).length == 2) - Number(ends.get(b).length == 2)); // ends of the street first
         for (const start of starts) {
            for (const first of ends.get(start)) {
               if (used.has(first)) continue;
               const run = [start];
               let seg = first;
               while (seg && !used.has(seg)) {
                  used.add(seg);
                  const next = seg.p1 == run[run.length - 1] ? seg.p2 : seg.p1;
                  run.push(next);
                  const onward = ends.get(next);
                  seg = onward.length == 2 ? onward.find((s) => s != seg) : null;
               }
               labels.push(...this.#labelsAlong(run, name, spacing, labels));
            }
         }
      }
      this.streetLabels = labels;
      return labels;
   }

   #labelsAlong(points, name, spacing, placed) {
      const cumulative = [0];
      for (let i = 1; i < points.length; i++) {
         cumulative.push(cumulative[i - 1] + distance(points[i - 1], points[i]));
      }
      const length = cumulative[cumulative.length - 1];
      const pointAt = (at) => {
         let i = 0;
         while (i < points.length - 2 && cumulative[i + 1] < at) i++;
         const t = (at - cumulative[i]) / (cumulative[i + 1] - cumulative[i] || 1);
         return lerp2D(points[i], points[i + 1], Math.max(0, Math.min(1, t)));
      };
      const room = Math.min(length - 40, 700);
      if (room < 160) return [];
      const count = Math.max(1, Math.floor(length / spacing));
      const out = [];
      for (let k = 0; k < count; k++) {
         const at = (length * (k + 0.5)) / count;
         const p = pointAt(at);
         if ([...placed, ...out].some((l) => distance(l, p) < (l.name == name ? spacing / 2 : 260))) continue;
         const dir = normalize(subtract(pointAt(at + 60), pointAt(at - 60)));
         if (!dir.x && !dir.y) continue;
         // (width: measured when first drawn, at that text size)
         out.push({ x: p.x, y: p.y, dir, name, room: Math.min(room, Math.min(at, length - at) * 2 + 40), width: null, size: null });
      }
      return out;
   }

   // Street names written along the roads, always the right way up on the
   // screen (the view can turn with the car), and skipped when they'd be too
   // small to read or don't fit along the road
   #drawStreetNames(ctx, inView) {
      const labels = this.getStreetLabels();
      if (labels.length == 0) return;
      const m = ctx.getTransform();
      const zoom = Math.hypot(m.a, m.b) / (typeof devicePixelRatio == "number" ? devicePixelRatio : 1);
      if (zoom < 0.18) return;
      const size = Math.max(26, 11 / zoom); // world units: at least ~11 px on screen
      ctx.save();
      ctx.font = "700 " + size + "px 'Plus Jakarta Sans', system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.lineJoin = "round";
      for (const label of labels) {
         if (!inView({ left: label.x - 1, right: label.x + 1, top: label.y - 1, bottom: label.y + 1 })) continue;
         if (label.width == null || label.size != size) {
            label.width = ctx.measureText(label.name).width;
            label.size = size;
         }
         if (label.width > label.room) continue;
         // which way the road points on screen: flip text that would be upside down
         const screenX = m.a * label.dir.x + m.c * label.dir.y;
         const flip = screenX < 0 ? Math.PI : 0;
         ctx.setTransform(m);
         ctx.translate(label.x, label.y);
         ctx.rotate(Math.atan2(label.dir.y, label.dir.x) + flip);
         ctx.lineWidth = size * 0.28;
         ctx.strokeStyle = World.STYLE.labelHalo;
         ctx.strokeText(label.name, 0, 0);
         ctx.fillStyle = World.STYLE.label;
         ctx.fillText(label.name, 0, 0);
      }
      ctx.restore();
   }

   // The name of the street nearest to p (within `reach`), or null
   streetNameAt(p, reach = this.roadWidth) {
      let best = null;
      for (const seg of this.graph.segments) {
         if (!seg.name) continue;
         if (Math.abs(seg.p1.x - p.x) > 2000 && Math.abs(seg.p2.x - p.x) > 2000) continue;
         const d = seg.distanceToPoint(p);
         if (d < reach && (!best || d < best.d)) best = { d, name: seg.name };
      }
      return best ? best.name : null;
   }

   // Lines running down the middle of each lane; markings snap to these
   getLaneGuides() {
      if (!this.laneGuides) {
         const tmpEnvelopes = this.graph.segments.map(
            (seg) => new Envelope(seg, this.roadWidth / 2, this.roadRoundness)
         );
         this.laneGuides = Polygon.union(tmpEnvelopes.map((e) => e.poly));
      }
      return this.laneGuides;
   }

   #indexEnvelopes() {
      const grid = new SpatialGrid(250);
      for (const env of this.envelopes) {
         grid.insert(env, env.poly.getBounds());
      }
      return grid;
   }

   // Our roads are a fixed 14 m wide, so some real buildings on narrow
   // streets would stick into the road. Drop those.
   // A small overlap (up to `tolerance`, 3 m) is allowed: real streets are
   // often narrower than ours, and dropping every building that touches the
   // road would empty out dense cities like Paris.
   #removeBuildingsOnRoads(buildings, tolerance = 30) {
      const grid = this.#indexEnvelopes();
      return buildings.filter((b) => {
         const base = b.base;
         const centroid = scale(
            base.points.reduce((sum, p) => add(sum, p), new Point(0, 0)),
            1 / base.points.length
         );
         for (const env of grid.query(base.getBounds())) {
            const { p1, p2 } = env.skeleton;
            // the road runs through the building
            if (base.containsPoint(p1) || base.containsPoint(p2)) {
               return false;
            }
            for (const edge of base.segments) {
               if (getIntersection(edge.p1, edge.p2, p1, p2)) {
                  return false;
               }
            }
            // the building sits in the road, or reaches deep into it
            if (env.poly.containsPoint(centroid)) {
               return false;
            }
            for (const v of base.points) {
               if (env.poly.containsPoint(v) && env.poly.distanceToPoint(v) > tolerance) {
                  return false;
               }
            }
         }
         return true;
      });
   }

   #generateBuildings() {
      // A wider envelope around each road; its outline is where buildings line up
      const tmpEnvelopes = [];
      for (const seg of this.graph.segments) {
         tmpEnvelopes.push(
            new Envelope(
               seg,
               this.roadWidth + this.buildingWidth + this.spacing * 2,
               this.roadRoundness
            )
         );
      }
      // wrap houses around the cul-de-sac bulbs too
      for (const center of this.culDeSacs) {
         tmpEnvelopes.push(
            Envelope.circle(
               center,
               this.getCulDeSacRadius() + this.buildingWidth / 2 + this.spacing
            )
         );
      }

      const guides = Polygon.union(tmpEnvelopes.map((e) => e.poly)).filter(
         (seg) => seg.length() >= this.buildingMinLength
      );

      const supports = [];
      for (const seg of guides) {
         const len = seg.length() + this.spacing;
         const buildingCount = Math.floor(
            len / (this.buildingMinLength + this.spacing)
         );
         const buildingLength = len / buildingCount - this.spacing;

         const dir = seg.directionVector();

         let q1 = seg.p1;
         let q2 = add(q1, scale(dir, buildingLength));
         supports.push(new Segment(q1, q2));

         for (let i = 2; i <= buildingCount; i++) {
            q1 = add(q2, scale(dir, this.spacing));
            q2 = add(q1, scale(dir, buildingLength));
            supports.push(new Segment(q1, q2));
         }
      }

      const bases = [];
      for (const seg of supports) {
         bases.push(new Envelope(seg, this.buildingWidth).poly);
      }

      // Drop buildings that overlap or crowd each other (e.g. at corners)
      const eps = 0.001;
      for (let i = 0; i < bases.length - 1; i++) {
         for (let j = i + 1; j < bases.length; j++) {
            if (
               bases[i].boundsOverlap(bases[j], this.spacing) &&
               (bases[i].intersectsPoly(bases[j]) ||
                  bases[i].distanceToPoly(bases[j]) < this.spacing - eps)
            ) {
               bases.splice(j, 1);
               j--;
            }
         }
      }

      return bases.map((b) => new Building(b));
   }

   #generateTrees(maxTrees = 400) {
      if (this.graph.segments.length == 0) {
         return [];
      }

      const points = [
         ...this.roadBorders.map((s) => [s.p1, s.p2]).flat(),
         ...this.buildings.map((b) => b.base.points).flat(),
      ];
      // reduce instead of Math.min(...) so huge city maps don't overflow the stack
      const left = points.reduce((m, p) => Math.min(m, p.x), Infinity);
      const right = points.reduce((m, p) => Math.max(m, p.x), -Infinity);
      const top = points.reduce((m, p) => Math.min(m, p.y), Infinity);
      const bottom = points.reduce((m, p) => Math.max(m, p.y), -Infinity);

      const illegalPolys = new SpatialGrid(250);
      for (const b of this.buildings) {
         illegalPolys.insert(b.base, b.base.getBounds());
      }
      for (const e of this.envelopes) {
         illegalPolys.insert(e.poly, e.poly.getBounds());
      }

      const trees = [];
      let tryCount = 0;
      while (tryCount < 100 && trees.length < maxTrees) {
         const p = new Point(
            lerp(left, right, Math.random()),
            lerp(bottom, top, Math.random())
         );

         const nearbyPolys = illegalPolys.query(
            SpatialGrid.boundsAround(p, this.treeSize * 2)
         );

         // not on a road or building
         let keep = true;
         for (const poly of nearbyPolys) {
            if (
               poly.containsPoint(p) ||
               poly.distanceToPoint(p) < this.treeSize / 2
            ) {
               keep = false;
               break;
            }
         }

         // not overlapping another tree
         if (keep) {
            for (const tree of trees) {
               if (distance(tree.center, p) < this.treeSize) {
                  keep = false;
                  break;
               }
            }
         }

         // not out in the middle of nowhere
         if (keep) {
            let closeToSomething = false;
            for (const poly of nearbyPolys) {
               if (poly.distanceToPoint(p) < this.treeSize * 2) {
                  closeToSomething = true;
                  break;
               }
            }
            keep = closeToSomething;
         }

         if (keep) {
            trees.push(new Tree(p, this.treeSize));
            tryCount = 0;
         }
         tryCount++;
      }
      return trees;
   }

   // Points where 3+ roads meet; traffic lights are grouped around these
   #computeIntersections() {
      const degree = new Map();
      for (const seg of this.graph.segments) {
         degree.set(seg.p1, (degree.get(seg.p1) || 0) + 1);
         degree.set(seg.p2, (degree.get(seg.p2) || 0) + 1);
      }
      this.intersections = this.graph.points.filter((p) => degree.get(p) > 2);
      if (this.intersections.length == 0) {
         this.intersections = this.graph.points;
      }
   }

   // Lights at the same intersection take turns: one green/yellow, rest red
   #updateLights() {
      const lights = this.markings.filter((m) => m instanceof Light);
      if (lights.length == 0) {
         return;
      }

      if (!this.lightGroups || this.lightGroupsFor != lights.length) {
         const groups = new Map();
         for (const light of lights) {
            const point = getNearestPoint(light.center, this.intersections);
            if (!point) {
               continue;
            }
            if (!groups.has(point)) {
               groups.set(point, []);
            }
            groups.get(point).push(light);
         }
         this.lightGroups = [...groups.values()];
         this.lightGroupsFor = lights.length;
      }

      const greenDuration = this.lightTiming.green;
      const yellowDuration = this.lightTiming.yellow;
      const cycle = greenDuration + yellowDuration;
      const tick = Math.floor(this.frameCount / 60);
      for (const group of this.lightGroups) {
         const cTick = tick % (group.length * cycle);
         const greenYellowIndex = Math.floor(cTick / cycle);
         const greenYellowState = cTick % cycle < greenDuration ? "green" : "yellow";
         for (let i = 0; i < group.length; i++) {
            group[i].state = i == greenYellowIndex ? greenYellowState : "red";
         }
      }
   }

   update() {
      this.#updateLights();
      this.frameCount++;
   }

   draw(ctx, viewPoint, showStartMarkings = true, renderRadius = Infinity) {
      const view = SpatialGrid.boundsAround(viewPoint, renderRadius);
      const inView = (b) =>
         b.left <= view.right && b.right >= view.left &&
         b.top <= view.bottom && b.bottom >= view.top;
      const segInView = (s) =>
         inView(SpatialGrid.boundsOfSegment(s.p1, s.p2));

      for (const env of this.envelopes) {
         if (inView(env.poly.getBounds())) {
            env.draw(ctx, { fill: World.STYLE.road, stroke: World.STYLE.road, lineWidth: 15 });
         }
      }
      // a grassy island with a curb in the middle of each roundabout
      for (const rb of this.roundabouts) {
         if (distance(rb.center, viewPoint) > renderRadius + rb.radius) continue;
         ctx.beginPath();
         ctx.arc(rb.center.x, rb.center.y, rb.radius - this.roadWidth / 2 - 8, 0, Math.PI * 2);
         ctx.fillStyle = World.STYLE.island;
         ctx.fill();
         ctx.lineWidth = 8;
         ctx.strokeStyle = World.STYLE.curb;
         ctx.stroke();
      }
      for (const marking of this.markings) {
         if (
            (!(marking instanceof Start) || showStartMarkings) &&
            distance(marking.center, viewPoint) < renderRadius
         ) {
            marking.draw(ctx);
         }
      }
      for (const seg of this.graph.segments) {
         if (!seg.oneWay && segInView(seg)) {
            seg.draw(ctx, { color: World.STYLE.centerLine, width: 4, dash: [18, 14] });
         }
      }
      for (const seg of this.roadBorders) {
         if (segInView(seg)) {
            seg.draw(ctx, { color: World.STYLE.edgeLine, width: 4 });
         }
      }
      for (const line of this.laneLines) {
         line.draw(ctx, { color: World.STYLE.edgeLine, width: 4, dash: [30, 40] });
      }

      if (this.route) {
         this.route.draw(ctx);
      }
      if (this.destination) {
         this.destination.draw(ctx);
      }
      this.#drawStreetNames(ctx, inView);

      if (this.crowd) {
         this.crowd.draw(ctx);
      }
      for (const car of this.parked) {
         car.draw(ctx);
      }
      for (const car of this.traffic) {
         car.draw(ctx);
      }
      ctx.globalAlpha = 0.2;
      for (const car of this.cars) {
         if (car != this.bestCar) {
            car.draw(ctx);
         }
      }
      ctx.globalAlpha = 1;
      if (this.bestCar) {
         this.bestCar.draw(ctx, true);
      }

      // Painter's algorithm: draw far items first so near ones cover them
      const items = [...this.buildings, ...this.trees].filter((i) =>
         inView(i.base.getBounds())
      );
      const dist = new Map(items.map((i) => [i, i.base.distanceToPoint(viewPoint)]));
      items.sort((a, b) => dist.get(b) - dist.get(a));
      for (const item of items) {
         item.draw(ctx, viewPoint);
      }
   }
}
