class World {
   // asphalt, a yellow center line on two-way roads, white edge lines
   static STYLE = { road: "#575d66", centerLine: "#f2c230", edgeLine: "#f4f4f2" };

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

      this.envelopes = [];
      this.roadBorders = [];
      this.buildings = [];
      this.trees = [];
      this.laneGuides = null; // computed on demand, see getLaneGuides()

      this.markings = [];

      // runtime-only state (not saved)
      this.cars = [];
      this.bestCar = null;
      this.traffic = [];
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
      this.culDeSacs = this.#findCulDeSacs();
      for (const center of this.culDeSacs) {
         this.envelopes.push(Envelope.circle(center, this.getCulDeSacRadius()));
      }
      this.roadBorders = Polygon.union(this.envelopes.map((e) => e.poly));
      this.laneGuides = null;
      this.lightGroups = null;
      this.#computeIntersections();
   }

   getCulDeSacRadius() {
      return this.roadWidth * 1.25;
   }

   // Dead ends get a round turnaround bulb, unless they're a tiny stub right
   // next to an intersection (the bulb would just swallow the junction)
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

      if (this.route) {
         this.route.draw(ctx);
      }
      if (this.destination) {
         this.destination.draw(ctx);
      }

      if (this.crowd) {
         this.crowd.draw(ctx);
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
