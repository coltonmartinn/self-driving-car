// A practice highway for the highway lesson: two lanes each way with a grass
// median, an on-ramp that merges into the right lane, and an off-ramp near
// the far end. Each lane is its own one-way road, so traffic keeps to its
// lane and a student changes lanes by driving across. No page access
// (tested in Node).
const HighwayCourse = {
   LENGTH: 40000, // 4 km
   LANE: 70, // 7 m lanes
   MERGE_X: 5000, // where the on-ramp joins the right lane
   EXIT_X: 34000, // where the off-ramp leaves it

   // lane centers (y) going east (screen y points down, so the right lane
   // has the bigger y), and going west
   EAST: { right: 220, left: 150 },
   WEST: { right: -220, left: -150 },

   build() {
      const H = HighwayCourse;
      const points = [];
      const segments = [];
      const at = new Map();
      const point = (x, y) => {
         const key = x + "," + y;
         if (!at.has(key)) {
            const p = new Point(x, y);
            at.set(key, p);
            points.push(p);
         }
         return at.get(key);
      };
      const lane = (y, east) => {
         const xs = [];
         for (let x = 0; x <= H.LENGTH; x += 500) xs.push(x);
         const pts = xs.map((x) => point(x, y));
         if (!east) pts.reverse();
         for (let i = 1; i < pts.length; i++) segments.push(new Segment(pts[i - 1], pts[i], true, "Highway 1"));
         return pts;
      };
      lane(H.EAST.right, true);
      lane(H.EAST.left, true);
      lane(H.WEST.right, false);
      lane(H.WEST.left, false);

      // ramps: a gentle curve in, and one out
      // (no traffic starts out on them: the student's ramp is clear)
      const chain = (coords, name) => {
         const pts = coords.map(([x, y]) => point(x, y));
         for (let i = 1; i < pts.length; i++) {
            const seg = new Segment(pts[i - 1], pts[i], true, name);
            /** @type {any} */ (seg).noTraffic = true;
            segments.push(seg);
         }
         return pts;
      };
      const m = H.MERGE_X;
      const onRamp = chain([[m - 3600, 1000], [m - 2600, 900], [m - 1700, 700], [m - 1000, 480], [m - 500, 320], [m, H.EAST.right]], "On-ramp");
      const e = H.EXIT_X;
      const offRamp = chain([[e, H.EAST.right], [e + 500, 320], [e + 1000, 480], [e + 1700, 700], [e + 2600, 900], [e + 3400, 1000]], "Exit 12");

      const world = new World(new Graph());
      world.graph = new Graph(points, segments);
      // the ends of the lanes and ramps run on off the map: no turnarounds
      world.edgePoints = [...points.filter((p) => p.x == 0 || p.x == H.LENGTH), onRamp[0], offRamp[offRamp.length - 1]];
      world.generateRoads();
      world.generateItems();
      world.buildings = []; // open country
      // dashed lines between the two lanes of each side
      world.laneLines = [H.EAST, H.WEST].map((side) => {
         const y = (side.right + side.left) / 2;
         return new Segment(new Point(0, y), new Point(H.LENGTH, y));
      });
      const ramp = onRamp[0];
      const dir = normalize(subtract(onRamp[1], ramp));
      world.markings.push(new Start(add(ramp, scale(dir, 120)), dir, world.roadWidth / 2, world.roadWidth / 2));
      world.highway = {
         east: H.EAST, merge: onRamp[onRamp.length - 1], exit: offRamp[0], end: offRamp[offRamp.length - 1],
         onRamp, offRamp,
      };
      return world;
   },

   // Which eastbound lane p is in ("right", "left"), and how far from that
   // lane's middle (+ = towards the right). null when not on the highway.
   laneAt(world, p) {
      const hw = world.highway;
      if (!hw || p.x < HighwayCourse.MERGE_X - 200 || p.x > HighwayCourse.EXIT_X + 200) return null;
      const { right, left } = hw.east;
      if (p.y < left - HighwayCourse.LANE * 0.9 || p.y > right + HighwayCourse.LANE * 0.9) return null;
      const lane = Math.abs(p.y - right) <= Math.abs(p.y - left) ? "right" : "left";
      return { lane, offset: p.y - hw.east[lane] };
   },

   // Slow trucks in the right lane, to pass. Returns them (already in traffic).
   addSlowTrucks(sim, speed) {
      const H = HighwayCourse;
      const trucks = [];
      for (const x of [7500, 17000]) { // (far enough ahead to catch up with by mid-highway)
         const edge = sim.network.edges.find((e) => e.from.y == H.EAST.right && e.to.y == H.EAST.right && e.from.x <= x && e.to.x > x);
         if (!edge) continue;
         const truck = new TrafficCar(sim.network, edge, (x - edge.from.x) / (edge.to.x - edge.from.x));
         truck.width = 34;
         truck.height = 92;
         truck.color = "#ece6d8";
         truck.cruiseSpeed = speed;
         truck.maxSpeed = speed + 0.3;
         truck.speed = speed;
         truck.isTruck = true;
         truck.keep = true; // (far ahead at first: don't recycle it)
         // straight on down the highway, not off at the exit
         truck.plan = sim.world.graph.points.filter((p) => p.y == H.EAST.right && p.x > edge.to.x).sort((a, b) => a.x - b.x);
         truck.place(truck.x, truck.y, truck.angle);
         sim.traffic.push(truck);
         trucks.push(truck);
      }
      sim.world.traffic = sim.traffic;
      return trucks;
   },
};
