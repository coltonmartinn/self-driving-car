const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { loadApp } = require("./helpers/loadApp");

const {
   Point, Segment, Graph, World, Car, Light, Stop, Route, Simulation,
   WorldGenerator, DrivingSchool, DrivingCoach, LESSONS, distance,
} = loadApp({ seed: 3 });

// A road going north from (0, 0), with a road to the east at y = -1500
function tJunction() {
   const a = new Point(0, 0);
   const j = new Point(0, -1500);
   const b = new Point(0, -3000);
   const c = new Point(1500, -1500);
   const graph = new Graph([a, j, b, c], [new Segment(a, j), new Segment(j, b), new Segment(j, c)]);
   const world = new World(graph);
   return { world, a, j, b, c, approach: graph.segments[0] };
}

// A student car in the right-hand lane, facing north
function studentCar(world, y = -200, x = world.roadWidth / 4) {
   const car = new Car(x, y, 30, 50, "PLAYER", 0, 1.8); // ~24 mph
   car.controls.forward = false;
   return car;
}

// Drive until `until` is true (or the frame limit), coaching every frame
function drive(car, coach, until, frames = 2000, traffic = []) {
   for (let i = 0; i < frames && !until(); i++) {
      car.update([], []);
      coach.update(traffic);
   }
}

function withSign(kind) {
   const t = tJunction();
   const sign = WorldGenerator.approachMarking(t.world, t.j, t.a, t.approach, kind);
   t.world.markings.push(sign);
   return { ...t, sign };
}

test("coming to a full stop at a stop sign earns praise, not a penalty", () => {
   const { world, sign } = withSign("stop");
   const car = studentCar(world);
   const coach = new DrivingCoach(world, car);
   car.controls.forward = true;
   drive(car, coach, () => coach.lineDistance(sign) < 60);
   car.controls.forward = false;
   car.controls.reverse = true;
   drive(car, coach, () => car.speed == 0);
   car.controls.reverse = false;
   drive(car, coach, () => false, 30); // wait a moment
   car.controls.forward = true;
   drive(car, coach, () => coach.lineDistance(sign) < -20);

   assert.equal(coach.events.map((e) => e.rule).join(), ["full_stop"].join());
   assert.equal(coach.score, 100);
   assert.equal(coach.passed, true);
});

test("slowing down without stopping is a rolling stop", () => {
   const { world, sign } = withSign("stop");
   const car = studentCar(world);
   const coach = new DrivingCoach(world, car);
   car.controls.forward = true;
   drive(car, coach, () => coach.lineDistance(sign) < 100);
   car.controls.forward = false;
   car.controls.reverse = true;
   drive(car, coach, () => car.speed < 0.7);
   car.controls.reverse = false;
   car.controls.forward = true;
   drive(car, coach, () => coach.lineDistance(sign) < -20);

   assert.equal(coach.mistakes.map((e) => e.rule).join(), ["rolling_stop"].join());
   assert.equal(coach.score, 100 - DrivingCoach.PENALTY.major);
});

test("driving straight through a stop sign fails the drive", () => {
   const { world, sign } = withSign("stop");
   const car = studentCar(world);
   const coach = new DrivingCoach(world, car);
   car.controls.forward = true;
   drive(car, coach, () => coach.lineDistance(sign) < -20);

   assert.equal(coach.mistakes.map((e) => e.rule).join(), ["ran_stop"].join());
   assert.equal(coach.failed, true);
   assert.equal(coach.grade, "F");
});

test("crossing the line on red is caught; waiting for green is praised", () => {
   const { world, sign: light } = withSign("light");
   light.state = "red";
   const car = studentCar(world);
   const coach = new DrivingCoach(world, car);
   car.controls.forward = true;
   drive(car, coach, () => coach.lineDistance(light) < -20);
   assert.equal(coach.mistakes.map((e) => e.rule).join(), ["red_light"].join());

   const patient = studentCar(world);
   const coach2 = new DrivingCoach(world, patient);
   patient.controls.forward = true;
   drive(patient, coach2, () => coach2.lineDistance(light) < 60);
   patient.controls.forward = false;
   patient.controls.reverse = true;
   drive(patient, coach2, () => patient.speed == 0);
   patient.controls.reverse = false;
   light.state = "green";
   patient.controls.forward = true;
   drive(patient, coach2, () => coach2.lineDistance(light) < -20);
   assert.equal(coach2.events.map((e) => e.rule).join(), ["waited_green"].join());
});

test("the coach only judges the rules a lesson asks for", () => {
   const { world, sign } = withSign("stop");
   const car = studentCar(world);
   const coach = new DrivingCoach(world, car, { rules: ["crash"] });
   car.controls.forward = true;
   drive(car, coach, () => coach.lineDistance(sign) < -20);
   assert.equal(coach.events.length, 0);
});

test("driving in the oncoming lane is flagged", () => {
   const { world } = tJunction();
   const car = studentCar(world, -200, -world.roadWidth / 4); // left lane
   car.maxSpeed = 1.5;
   const coach = new DrivingCoach(world, car);
   car.controls.forward = true;
   drive(car, coach, () => false, 200);
   assert.equal(coach.mistakes.map((e) => e.rule).join(), ["wrong_side"].join());
});

test("speeding is flagged after a moment over the limit", () => {
   const { world } = tJunction();
   const car = studentCar(world);
   car.maxSpeed = 2.4; // ~32 mph
   const coach = new DrivingCoach(world, car, { speedLimit: 25 });
   car.controls.forward = true;
   drive(car, coach, () => false, 150);
   assert.equal(coach.mistakes.map((e) => e.rule).join(), ["speeding"].join());
   assert.ok(DrivingCoach.mph(car.speed) > 28);
});

test("following too closely breaks the 2-second rule", () => {
   const { world } = tJunction();
   const car = studentCar(world, -200);
   const lead = new Car(world.roadWidth / 4, -300, 30, 50, "DUMMY", 0, 2);
   car.maxSpeed = 2;
   const coach = new DrivingCoach(world, car);
   car.controls.forward = true;
   for (let i = 0; i < 200; i++) {
      lead.update([], []);
      car.update([], []);
      coach.update([lead]);
   }
   assert.equal(coach.mistakes.map((e) => e.rule).join(), ["tailgating"].join());
});

// Move a car along a path (north to the junction, then east), as if driven
function turnRight(world, car, coach, signal) {
   const lane = world.roadWidth / 4;
   const path = new Route([new Point(lane, -1100), new Point(lane, -1500 + lane), new Point(400, -1500 + lane)]);
   car.speed = 1.2;
   car.controls.signal = signal;
   for (let d = 0; d < path.length; d += car.speed) {
      const p = path.pointAt(d);
      const ahead = path.pointAt(d + 30);
      car.x = p.x;
      car.y = p.y;
      car.angle = -Math.atan2(ahead.y - p.y, ahead.x - p.x) - Math.PI / 2;
      coach.update();
   }
}

test("turning without a signal is a mistake; with the right one it's praised", () => {
   const { world } = tJunction();
   const quiet = studentCar(world, -1100);
   const coach = new DrivingCoach(world, quiet);
   turnRight(world, quiet, coach, null);
   assert.equal(coach.mistakes.map((e) => e.rule).join(), ["no_signal"].join());

   const careful = studentCar(world, -1100);
   const coach2 = new DrivingCoach(world, careful);
   turnRight(world, careful, coach2, "right");
   assert.equal(coach2.events.map((e) => e.rule).join(), ["signaled"].join());
   assert.equal(careful.controls.signal, null, "the signal turns off after the turn");

   const confused = studentCar(world, -1100);
   const coach3 = new DrivingCoach(world, confused);
   turnRight(world, confused, coach3, "left");
   assert.equal(coach3.mistakes.map((e) => e.rule).join(), ["wrong_signal"].join());
});

test("a crash fails the drive and ends the coaching", () => {
   const { world } = tJunction();
   const car = studentCar(world);
   const coach = new DrivingCoach(world, car);
   const other = new Car(car.x, car.y - 30, 30, 50, "DUMMY");
   car.damaged = true;
   coach.update([other]);
   assert.equal(coach.finished, true);
   assert.equal(coach.summary().passed, false);
   assert.equal(coach.mistakes.map((e) => e.rule).join(), "crash");

   const alone = studentCar(world);
   const coach2 = new DrivingCoach(world, alone);
   alone.damaged = true;
   coach2.update([]);
   assert.equal(coach2.mistakes.map((e) => e.rule).join(), "curb", "no car hit: it was the curb");
});

test("missing a turn plans a new route from where the car is", () => {
   const { world, b, c } = tJunction();
   const sim = new Simulation(world, { trafficOn: false });
   sim.setTrip(c); // north, then right at the junction
   const car = studentCar(world, -1700); // drove past the turn, still heading north
   assert.ok(sim.reroute(car));
   const route = sim.trip.route;
   assert.equal(route.points[route.points.length - 1], c);
   assert.equal(route.points[1], b, "keeps going the way it faces, then comes back");
});

test("unmarked intersections get signs, the same ones every time", () => {
   const { points, segments } = WorldGenerator.generateGraph();
   const make = () => {
      const world = new World(new Graph(points, segments));
      world.markings = [];
      DrivingSchool.addTrafficControls(world);
      return world.markings.map((m) => m.type + Math.round(m.center.x)).sort().join();
   };
   const first = make();
   assert.ok(first.length > 0);
   assert.equal(make(), first);

   // a real city: never two signs for the same approach
   const file = path.join(__dirname, "..", "data", "cities", "san-francisco.json");
   const world = World.load(JSON.parse(fs.readFileSync(file, "utf8")));
   DrivingSchool.addTrafficControls(world);
   const controls = world.markings.filter((m) => m instanceof Light || m instanceof Stop);
   for (const m of controls) {
      const twins = controls.filter((o) =>
         o != m && distance(o.center, m.center) < world.roadWidth * 1.5 &&
         o.directionVector.x * m.directionVector.x + o.directionVector.y * m.directionVector.y > 0.7);
      assert.equal(twins.length, 0);
   }
});

test("routes know their turns, and directions name the next one", () => {
   const route = new Route([new Point(0, 0), new Point(0, -500), new Point(500, -500), new Point(500, -1000)]);
   const turns = DrivingSchool.turnsOf(route);
   assert.equal(turns.map((t) => (t.turn > 0 ? "left" : "right")).join(), "right,left");
   assert.equal(JSON.stringify(DrivingSchool.nextInstruction(route, 100)), JSON.stringify({ kind: "right", distance: 400 }));
   assert.equal(DrivingSchool.nextInstruction(route, 600).kind, "left");
   assert.equal(DrivingSchool.nextInstruction(route, 1200).kind, "arrive");

   // a bend with no side road isn't a turn to announce
   const { world, a, j, c } = tJunction();
   const bend = new Point(0, -700);
   const curvy = new Route([a, bend, j, c]);
   const junctions = DrivingSchool.junctionsOf(world);
   assert.equal(DrivingSchool.turnsOf(curvy, junctions).map((t) => t.point == j).join(), "true");
});

test("lesson trips in a real city include what the lesson is about", () => {
   const file = path.join(__dirname, "..", "data", "cities", "beverly-hills.json");
   const world = World.load(JSON.parse(fs.readFileSync(file, "utf8")));
   DrivingSchool.addTrafficControls(world);
   const sim = new Simulation(world, { trafficOn: false });
   assert.ok(DrivingSchool.pickTrip(sim, "stops", 15));
   const features = DrivingSchool.features(sim.trip.route, world);
   assert.ok(features.stops >= 1, JSON.stringify(features));
});

test("every lesson has instructions and judges real rules", () => {
   for (const lesson of LESSONS) {
      assert.ok(lesson.learn.length > 0, lesson.id);
      for (const rule of lesson.rules || []) {
         assert.ok(DrivingCoach.RULES[rule], lesson.id + ": " + rule);
      }
   }
});
