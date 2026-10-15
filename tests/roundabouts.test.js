// Roundabouts: junctions turned into one-lane, counterclockwise rings with a
// YIELD on every street in, and the coach judging how a student drives them
const test = require("node:test");
const assert = require("node:assert/strict");
const { loadApp } = require("./helpers/loadApp");

const {
   Point, Segment, Graph, World, Car, Yield, Stop, Light, Roundabouts, DrivingSchool, DrivingCoach, Pathfinder, Route,
   TrafficCar, TrafficNetwork, distance, normalize, subtract, angle,
} = loadApp({ seed: 4 });

// A crossroads at (0, 0), with streets 1500 long to the south, east, north and west
function plusWorld() {
   const c = new Point(0, 0);
   const ends = [new Point(0, 1500), new Point(1500, 0), new Point(0, -1500), new Point(-1500, 0)];
   const base = new World(new Graph([c, ...ends], ends.map((e) => new Segment(c, e))));
   const info = JSON.parse(JSON.stringify(base.toJSON()));
   const made = Roundabouts.build(info);
   const world = World.load(info);
   DrivingSchool.addTrafficControls(world);
   const end = (x, y) => world.graph.points.find((p) => p.x == x && p.y == y);
   return { world, made, rb: world.roundabouts[0], south: end(0, 1500), east: end(1500, 0), north: end(0, -1500), west: end(-1500, 0) };
}

test("a junction becomes a one-way ring going counterclockwise, with a YIELD on every street in", () => {
   const { world, made, rb } = plusWorld();
   assert.equal(made, 1);
   assert.deepEqual([rb.center.x, rb.center.y], [0, 0]);
   assert.ok(!world.graph.points.some((p) => distance(p, rb.center) < rb.radius - 1), "the old junction is gone");
   const ring = world.graph.segments.filter((s) => Roundabouts.isRingPoint(world, s.p1) && Roundabouts.isRingPoint(world, s.p2));
   assert.ok(ring.length >= 12, "round enough");
   for (const s of ring) {
      assert.ok(s.oneWay);
      assert.ok(Roundabouts.flow(rb, s.p1, normalize(subtract(s.p2, s.p1))) > 0.9, "counterclockwise");
   }
   const streets = world.graph.segments.filter((s) => !ring.includes(s));
   assert.equal(streets.length, 4);
   assert.ok(streets.every((s) => !s.oneWay), "the streets stay two-way");
   assert.equal(world.markings.filter((m) => m instanceof Yield).length, 4);
   assert.equal(world.markings.filter((m) => m instanceof Stop || m instanceof Light).length, 0);
   const clear = rb.radius + world.roadWidth / 2;
   assert.ok(world.buildings.every((b) => b.base.distanceToPoint(rb.center) > clear), "no buildings on the ring");
   assert.ok(world.trees.some((t) => distance(t.center, rb.center) < 1), "a tree on the island");
   // saved and loaded again, it's still there
   assert.equal(World.load(JSON.parse(JSON.stringify(world.toJSON()))).roundabouts.length, 1);
});

test("junctions too close to other roads stay as they are", () => {
   // two T junctions 300 apart: no room for a ring
   const a = new Point(-1500, 0);
   const j1 = new Point(0, 0);
   const j2 = new Point(300, 0);
   const b = new Point(1500, 0);
   const graph = new Graph([a, j1, j2, b, new Point(0, -1500), new Point(300, 1500)], []);
   graph.segments.push(new Segment(a, j1), new Segment(j1, j2), new Segment(j2, b), new Segment(j1, graph.points[4]), new Segment(j2, graph.points[5]));
   const info = JSON.parse(JSON.stringify(new World(graph).toJSON()));
   assert.equal(Roundabouts.build(info), 0);
   assert.equal(info.graph.segments.length, 5);
});

test("routes go round the right way, and directions count the exits", () => {
   const { world, south, east, north, west } = plusWorld();
   const exits = [[east, 1], [north, 2], [west, 3]].map(([to, n]) => {
      const route = new Route(Pathfinder.shortestPath(world.graph, south, to));
      const [round] = DrivingSchool.roundaboutsOn(route, world);
      const step = DrivingSchool.nextInstruction(route, 0, DrivingSchool.directionsOf(route, world));
      assert.equal(step.kind, "roundabout");
      assert.equal(DrivingSchool.turnsOf(route, DrivingSchool.junctionsOf(world)).length, 0, "going round isn't a turn");
      return round.exit + "=" + n + "/" + step.exit;
   });
   assert.deepEqual(exits, ["1=1/1", "2=2/2", "3=3/3"]);
});

// A student's car moved along `path` (points) at `speed`, coached every
// step. signal(progress, total): the turn signal to show at that point.
function drivePath(world, path, { speed = 1.1, signal = () => null, traffic = [] } = {}) {
   const car = new Car(path[0].x, path[0].y, 30, 50, "PLAYER", 0, 3);
   const coach = new DrivingCoach(world, car, { speedLimit: 25 });
   const route = new Route(path);
   for (let at = 0; at < route.length; at += speed) {
      const p = route.pointAt(at);
      const dir = normalize(subtract(route.pointAt(at + 5), route.pointAt(at - 5)));
      car.x = p.x;
      car.y = p.y;
      car.angle = -angle(dir) - Math.PI / 2;
      car.speed = speed;
      car.controls.signal = signal(at, route.length);
      coach.update(traffic);
   }
   return coach;
}

// In from the south, then round the ring from `from` to `to` degrees, and out
function roundPath(rb, from, to, out) {
   const path = [new Point(35, 900), new Point(35, 290)];
   const step = to > from ? 5 : -5;
   for (let a = from; step > 0 ? a <= to : a >= to; a += step) {
      const r = (a * Math.PI) / 180;
      path.push(new Point(Math.cos(r) * rb.radius, Math.sin(r) * rb.radius));
   }
   path.push(...out);
   return path;
}

test("the coach: yield on the way in, go round the right way, signal on the way out", () => {
   const { world, rb } = plusWorld();
   // south to north (the 2nd exit), the right way round: screen angles go 90 → 0 → -90
   const northbound = roundPath(rb, 90, -90, [new Point(35, -290), new Point(35, -900)]);
   const exitSignal = (at, total) => (at > total - 900 && at < total - 500 ? "right" : null);
   const rules = (coach) => coach.events.map((e) => e.rule).join();

   assert.equal(rules(drivePath(world, northbound, { signal: exitSignal })), "roundabout_good");
   assert.equal(rules(drivePath(world, northbound)), "roundabout_exit_signal");

   // a car coming round from the left, close by
   const r = (130 * Math.PI) / 180;
   const coming = { x: Math.cos(r) * rb.radius, y: Math.sin(r) * rb.radius, speed: 1.5, angle: 0 };
   assert.equal(rules(drivePath(world, northbound, { signal: exitSignal, traffic: [coming] })), "roundabout_no_yield");

   // clockwise: the wrong way
   const wrong = drivePath(world, roundPath(rb, 90, 180, [new Point(-290, -35), new Point(-900, -35)]), { signal: exitSignal });
   assert.ok(wrong.events.some((e) => e.rule == "roundabout_wrong_way"));
   assert.ok(wrong.failed);
});

test("traffic waits at the YIELD line for cars coming round, then goes in", () => {
   const { world, rb, south } = plusWorld();
   const network = new TrafficNetwork(world);
   const edge = network.edges.find((e) => e.from == south);
   const run = (others, frames) => {
      const car = new TrafficCar(network, edge, 0.3);
      let closest = Infinity;
      for (let i = 0; i < frames; i++) {
         car.update([car, ...others]);
         closest = Math.min(closest, distance(car, rb.center));
      }
      return closest;
   };
   const r = (150 * Math.PI) / 180;
   const coming = { x: Math.cos(r) * rb.radius, y: Math.sin(r) * rb.radius, speed: 1.5, angle: 0 };
   assert.ok(run([coming], 550) > rb.radius + world.roadWidth / 2, "waits outside the ring");
   assert.ok(run([], 550) < rb.radius + 10, "goes in when it's clear");
});
