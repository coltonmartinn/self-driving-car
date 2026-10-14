const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { loadApp } = require("./helpers/loadApp");

const {
   Point, Segment, Graph, World, Car, Light, Stop, Route, Simulation, Crossing,
   WorldGenerator, DrivingSchool, DrivingCoach, LESSONS, distance, Pedestrian, Crowd, TrafficCar, TrafficNetwork, Hazards, Parking, perpendicular, add, scale, normalize, subtract,
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
   car.speed = 1.5; // drove into it
   car.damaged = true;
   coach.update([other]);
   assert.equal(coach.finished, true);
   assert.equal(coach.summary().passed, false);
   assert.equal(coach.mistakes.map((e) => e.rule).join(), "crash");

   // stopped, and another car ran into us: not the student's fault
   const waiting = studentCar(world);
   const coach3 = new DrivingCoach(world, waiting);
   const hitter = new Car(waiting.x, waiting.y - 30, 30, 50, "DUMMY");
   hitter.speed = 0.15; // it braked, but too late
   waiting.damaged = true;
   coach3.update([hitter]);
   assert.equal(coach3.events.map((e) => e.rule).join(), "hit_by_traffic");
   assert.equal(coach3.mistakes.length, 0);

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
   // and stop lines sit before crosswalks, not on them
   const crossings = world.markings.filter((m) => m instanceof Crossing);
   for (const m of controls) {
      assert.ok(crossings.every((x) => distance(m.center, x.center) >= (x.height + m.height) / 2));
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

// ---------- pedestrians ----------

// A crosswalk across the north road, 800 units up
function withCrosswalk() {
   const t = tJunction();
   const crossing = new Crossing(new Point(0, -800), new Point(0, -1), t.world.roadWidth, t.world.roadWidth / 2);
   t.world.markings.push(crossing);
   return { ...t, crossing };
}

// Someone already halfway across
function walkerOn(crossing) {
   const person = new Pedestrian(crossing, 1, () => 0.5);
   person.state = "crossing";
   person.t = 0.4;
   person.update([]);
   return person;
}

test("pedestrians wait for a gap, then walk all the way across", () => {
   const { crossing } = withCrosswalk();
   const person = new Pedestrian(crossing, 1, () => 0.5);
   const speeding = new Car(0, -900, 30, 50, "DUMMY");
   speeding.speed = 2;
   for (let i = 0; i < 400; i++) person.update([speeding]);
   assert.equal(person.state, "waiting", "won't step in front of a fast car right there");
   for (let i = 0; i < 2000 && person.state != "done"; i++) person.update([]);
   assert.equal(person.state, "done");

   // a car waiting before the crosswalk is letting them go
   const other = new Pedestrian(crossing, 1, () => 0.5);
   const polite = new Car(35, -800 + 90, 30, 50, "DUMMY");
   polite.speed = 0;
   for (let i = 0; i < 400 && other.state == "waiting"; i++) other.update([polite]);
   assert.equal(other.state, "crossing");
});

test("driving through a crosswalk while someone is crossing fails; waiting is praised", () => {
   const { world, crossing } = withCrosswalk();
   const rude = studentCar(world, -400);
   const coach = new DrivingCoach(world, rude);
   const person = walkerOn(crossing);
   rude.controls.forward = true;
   for (let i = 0; i < 600 && coach.crosswalkDistance(crossing) > -20; i++) {
      rude.update([], []);
      coach.update([person]);
   }
   assert.equal(coach.mistakes.map((e) => e.rule).join(), "pedestrian_yield");

   const polite = studentCar(world, -400);
   const coach2 = new DrivingCoach(world, polite);
   const walker = walkerOn(crossing);
   polite.controls.forward = true;
   drive(polite, coach2, () => coach2.crosswalkDistance(crossing) < 50, 2000, [walker]);
   polite.controls.forward = false;
   polite.controls.reverse = true;
   drive(polite, coach2, () => polite.speed == 0, 2000, [walker]);
   polite.controls.reverse = false;
   for (let i = 0; i < 2000 && walker.state != "done"; i++) {
      walker.update([]);
      coach2.update([walker]);
   }
   polite.controls.forward = true;
   drive(polite, coach2, () => coach2.crosswalkDistance(crossing) < -20, 2000, [walker]);
   assert.equal(coach2.events.map((e) => e.rule).join(), "yielded_pedestrian");
});

test("hitting a pedestrian is always reported, whatever the lesson", () => {
   const { world } = tJunction();
   const car = studentCar(world);
   const coach = new DrivingCoach(world, car, { rules: ["speeding"] });
   const person = { isPedestrian: true, x: car.x, y: car.y - 20, polygon: [
      { x: car.x - 9, y: car.y - 29 }, { x: car.x + 9, y: car.y - 29 }, { x: car.x + 9, y: car.y - 11 }, { x: car.x - 9, y: car.y - 11 },
   ] };
   car.damaged = true;
   coach.update([person]);
   assert.equal(coach.mistakes.map((e) => e.rule).join(), "hit_pedestrian");
});

test("traffic stops for someone in the crosswalk", () => {
   const { world, crossing } = withCrosswalk();
   const network = new TrafficNetwork(world);
   const edge = network.edges.find((e) => e.from.y == 0 && e.to.y == -1500);
   const car = new TrafficCar(network, edge, 0.3); // heading north towards the crosswalk
   const person = walkerOn(crossing);
   person.t = 0.6; // in the car's lane
   person.update([]);
   for (let i = 0; i < 600; i++) car.update([person]);
   assert.ok(car.speed < 0.1, "stopped");
   assert.ok(car.y > crossing.center.y + 30, "before the crosswalk");
});

test("streets without crosswalks get some mid-block, and the crosswalk lesson finds them", () => {
   const file = path.join(__dirname, "..", "data", "cities", "beverly-hills.json");
   const world = World.load(JSON.parse(fs.readFileSync(file, "utf8")));
   assert.equal(world.markings.filter((m) => m instanceof Crossing).length, 0);
   assert.ok(DrivingSchool.addCrosswalks(world) > 0);
   const sim = new Simulation(world, { trafficOn: false });
   assert.ok(DrivingSchool.pickTrip(sim, "crossings", 20));
   assert.ok(DrivingSchool.features(sim.trip.route, world).crossings >= 1);
});

// ---------- hazards ----------

// A student driving north on the long road, with a trip to the far end
function hazardSim({ pedestrians = false } = {}) {
   const { world, b } = tJunction();
   const controls = { forward: false, reverse: false, left: false, right: false, signal: null };
   const sim = new Simulation(world, { trafficOn: false, pedestrians, playerControls: controls });
   sim.setTrip(b);
   sim.manual = true;
   sim.startGeneration();
   const car = sim.cars[0];
   car.maxSpeed = 2;
   car.controls.forward = true;
   return { world, sim, car };
}

test("the car ahead brakes hard; reaction time is measured until you brake", () => {
   const { world, sim, car } = hazardSim();
   const network = new TrafficNetwork(world);
   for (let i = 0; i < 60; i++) sim.step(); // get moving
   // the lead car goes 250 units ahead, on whichever road piece that is
   const leadY = car.y - 250;
   const edge = network.edges.find((e) => e.from.x == 0 && e.to.x == 0 && e.from.y > leadY && e.to.y <= leadY);
   const lead = new TrafficCar(network, edge, (edge.from.y - leadY) / (edge.from.y - edge.to.y));
   lead.speed = 2;
   sim.traffic = [lead];
   const hazards = new Hazards(sim, { first: 0, random: () => 0.5 });

   let started = null;
   for (let i = 0; i < 5 && !started; i++) {
      sim.step();
      started = hazards.update(car);
   }
   assert.equal(started && started.kind, "brake");
   assert.ok(lead.hazardBrake > 0);
   for (let i = 0; i < 30; i++) {
      sim.step();
      hazards.update(car);
   }
   // braking hard, but like a real car (about 0.025 units/frame each frame)
   assert.ok(lead.speed < 1.5 && lead.speed > 1, "lead speed " + lead.speed);
   car.controls.forward = false;
   car.controls.reverse = true; // the student reacts after half a second
   let done = null;
   for (let i = 0; i < 400 && !done; i++) {
      sim.step();
      if (car.speed <= 0) car.controls.reverse = false;
      done = hazards.update(car);
   }
   assert.equal(done.type, "done");
   assert.equal(done.handled, true);
   assert.ok(Math.abs(done.reaction - 31 / 60) < 0.05, "reaction " + done.reaction);
});

test("someone runs into the road ahead, out of any crosswalk", () => {
   const { sim, car } = hazardSim({ pedestrians: true });
   for (let i = 0; i < 60; i++) sim.step();
   const hazards = new Hazards(sim, { first: 0, random: () => 0.9 });
   const started = hazards.update(car);
   assert.equal(started.kind, "person");
   const runner = sim.crowd.people.find((p) => p.jaywalking);
   assert.ok(runner && runner.state == "crossing");
   const ahead = -(runner.y - car.y);
   assert.ok(ahead > 150 && ahead < 400, "about 2 seconds ahead: " + ahead);
   assert.ok(!sim.world.markings.includes(runner.crossing), "no crosswalk there");
});

test("night and rain lessons ask for a longer following distance", () => {
   const { world } = tJunction();
   const car = studentCar(world, -200);
   const lead = new Car(world.roadWidth / 4, -480, 30, 50, "DUMMY", 0, 1.5);
   car.maxSpeed = 1.5; // same speed, about 2.5 s apart: fine at 2 s, too close at 3 s
   const night = LESSONS.find((l) => l.id == "night");
   const coach = new DrivingCoach(world, car, { followSeconds: night.followSeconds });
   const dry = new DrivingCoach(world, car);
   car.controls.forward = true;
   for (let i = 0; i < 200; i++) {
      lead.update([], []);
      car.update([], []);
      coach.update([lead]);
      dry.update([lead]);
   }
   assert.equal(coach.mistakes.map((e) => e.rule).join(), "tailgating");
   assert.equal(dry.mistakes.length, 0);
});

// ---------- pulling over ----------

test("pulling over is judged on signaling, position and angle", () => {
   const { world } = tJunction();
   const dir = new Point(0, -1);
   const spot = new Parking(add(new Point(0, -700), scale(perpendicular(dir), world.roadWidth / 2 - 24)), dir, 44, 90);
   const park = (dx, dy, angle, signal) => {
      const car = studentCar(world, spot.center.y + dy, spot.center.x + dx);
      car.angle = angle;
      const coach = new DrivingCoach(world, car);
      if (signal) {
         car.controls.signal = "right";
         coach.update();
         car.controls.signal = null;
      }
      return coach.judgePullOver(spot).map((e) => e.rule).join();
   };
   assert.equal(park(0, 0, 0, true), "parked_well");
   assert.equal(park(0, 0, 0, false), "pullover_signal,parked_well");
   assert.equal(park(0, 0, 0.4, true), "crooked_park");
   assert.equal(park(0, 200, 0, true), "missed_spot", "stopped short");
   assert.equal(park(-60, 0, 0, true), "missed_spot", "too far from the curb");
});

test("people never walk into the side of a car blocking the crosswalk; they wait, then go on", () => {
   const { crossing } = withCrosswalk();
   const person = walkerOn(crossing);
   const [a, b] = person.ends;
   const ahead = add(person, scale(normalize(subtract(b, a)), 30));
   const blocker = new Car(ahead.x, ahead.y, 30, 50, "DUMMY", 0, 0);
   blocker.controls.forward = false;
   blocker.update([], []);
   const t = person.t;
   for (let i = 0; i < 200; i++) person.update([blocker]);
   assert.equal(person.t, t, "waited");
   assert.equal(person.blockedBy, blocker);
   blocker.place(ahead.x, ahead.y - 400, 0); // it drives on
   for (let i = 0; i < 1000 && person.state != "done"; i++) person.update([blocker]);
   assert.equal(person.state, "done");
});

test("two quick turns the same way are judged as turns that way, not as one turn back", () => {
   const { world } = tJunction();
   const car = studentCar(world, -1500 + 60, 0);
   car.controls.signal = "right";
   const coach = new DrivingCoach(world, car);
   coach.update([]);
   // inside the junction, the car swings right by almost 180 degrees in all
   for (let i = 0; i < 40; i++) {
      car.angle -= 3.1 / 40;
      car.speed = 1;
      coach.update([]);
   }
   car.x = world.roadWidth * 3; // and drives out of the junction
   coach.update([]);
   assert.equal(coach.events.map((e) => e.rule).join(), "signaled");
});
