// The drills (stopping on a mark, keeping a gap), the practice highway
// (merging, lane changes, the exit) and posted speed limits, judged by the coach
const test = require("node:test");
const assert = require("node:assert/strict");
const { loadApp } = require("./helpers/loadApp");

const {
   Point, Segment, Graph, World, Car, Route, DrivingCoach, Drills, HighwayCourse, Simulation, normalize, subtract, angle,
} = loadApp({ seed: 6 });

// A straight two-way road going north from (0, 0)
function straightRoad() {
   const a = new Point(0, 0);
   const b = new Point(0, -6000);
   return new World(new Graph([a, b], [new Segment(a, b)]));
}

// Moves a car along `path` (points), at speed(at, total) per frame, coaching
// every frame. each(at, car, frame) can set signals and looks.
function drive(world, path, { speed = () => 2, each = () => {}, traffic = [], coachOptions = {} } = {}) {
   const car = new Car(path[0].x, path[0].y, 30, 50, "PLAYER", 0, 6);
   car.controls.lookCount = 0;
   const coach = new DrivingCoach(world, car, { speedLimit: 30, ...coachOptions });
   const route = new Route(path);
   let at = 0;
   for (let frame = 0; frame < 20000 && at < route.length; frame++) {
      const v = speed(at, route.length);
      at += v;
      const p = route.pointAt(at);
      const dir = normalize(subtract(route.pointAt(at + 5), route.pointAt(at - 5)));
      car.x = p.x;
      car.y = p.y;
      car.angle = -angle(dir) - Math.PI / 2;
      car.speed = v;
      each(at, car, frame);
      for (const t of traffic) if (t.move) t.move(frame);
      coach.update(traffic);
   }
   return coach;
}

const rules = (coach) => coach.events.map((e) => e.rule).join();

test("the stopping drill: the coach measures where the bumper stopped", () => {
   const world = straightRoad();
   const mark = { at: 1500, center: new Point(35, -1500), dir: new Point(0, -1), width: 64 };
   const lane = [new Point(35, -100), new Point(35, -3000)];
   // drive up at 25 mph, stop with the front of the car `short` units before the line, wait, go on
   const stopAt = (short, fast = 1.86) => {
      let waited = 0;
      return drive(world, lane, {
         coachOptions: { marks: [mark] },
         speed: (at) => {
            // (the car starts at y = -100, the line is at -1500, and the bumper is 25 ahead of the middle)
            const left = 1500 - 100 - 25 - short - at;
            if (left > 0) return Math.min(fast, Math.max(0.2, left / 30), left);
            if (waited++ < 40) return 0;
            return 2;
         },
      });
   };
   assert.equal(rules(stopAt(0)), "stop_on_mark");
   assert.equal(rules(stopAt(-40)), "overshot_mark");
   assert.equal(rules(stopAt(60)), "short_of_mark");
   assert.equal(rules(stopAt(0, 0.9)), "slow_approach,stop_on_mark");
   assert.equal(rules(drive(world, lane, { coachOptions: { marks: [mark] } })), "missed_mark");
   assert.ok(Math.abs(stopAt(0).markResults[0]) < 15);
});

test("the following drill: how much of the time the gap was 2-4 seconds", () => {
   const world = straightRoad();
   const lane = [new Point(35, -100), new Point(35, -5000)];
   const run = (seconds) => {
      const lead = { x: 35, y: 0, speed: 2, angle: 0, height: 50 };
      const coach = drive(world, lane, {
         coachOptions: { lead, followSeconds: 2 },
         each: (at, car) => {
            lead.y = car.y - (car.height + seconds * 60 * 2);
            car.arrived = at > 4800;
         },
      });
      return coach.events.find((e) => e.rule == "kept_gap" || e.rule == "uneven_gap");
   };
   assert.equal(run(3).rule, "kept_gap");
   assert.equal(run(1.2).rule, "uneven_gap");
});

test("the practice highway: two lanes each way, ramps, and one trip from the on-ramp to the exit", () => {
   const world = HighwayCourse.build();
   assert.equal(world.culDeSacs.length, 0, "the ends run off the map");
   assert.equal(world.laneLines.length, 2);
   assert.equal(world.buildings.length, 0);
   const sim = new Simulation(world, { trafficOn: false });
   assert.ok(sim.setTrip(world.highway.end));
   const route = sim.trip.route;
   assert.ok(route.points.includes(world.highway.merge) && route.points.includes(world.highway.exit));
   assert.equal(HighwayCourse.laneAt(world, new Point(10000, 220)).lane, "right");
   assert.equal(HighwayCourse.laneAt(world, new Point(10000, 155)).lane, "left");
   assert.equal(HighwayCourse.laneAt(world, new Point(10000, -150)), null, "the other side");
});

test("the highway: merge at speed with a signal and a look, signal lane changes, and the exit", () => {
   const world = HighwayCourse.build();
   const hw = world.highway;
   const H = HighwayCourse;
   // the ramp, the right lane, over to the left lane and back, then the exit
   const path = [...hw.onRamp, new Point(9000, 220), new Point(9500, 150), new Point(12000, 150), new Point(12500, 220), ...hw.offRamp];
   const look = (car, side) => {
      car.controls.looked = side;
      car.controls.lookCount++;
   };
   const careful = (at, car) => {
      const x = car.x;
      car.controls.signal = x > H.MERGE_X - 1500 && x < H.MERGE_X ? "left"
         : x > 8700 && x < 9300 ? "left" : x > 11800 && x < 12600 ? "right" : x > H.EXIT_X - 1500 && x < H.EXIT_X + 300 ? "right" : null;
      if ([H.MERGE_X - 700, 8800, 11900].some((m) => Math.abs(x - m) < 3)) look(car, x > 11000 ? "right" : "left");
   };
   const fast = () => 3.9; // 52 mph
   const good = drive(world, path, { speed: fast, each: careful, coachOptions: { speedLimit: 55 } });
   assert.equal(rules(good), "merged_well,clean_lane_change,clean_lane_change");

   // no signals or looks, and too slow onto the highway
   const sloppy = drive(world, path, { speed: (at) => (at < 3600 ? 2 : 3.9), coachOptions: { speedLimit: 55 } });
   for (const r of ["merge_slow", "merge_signal", "no_blind_spot_check", "lane_change_signal", "exit_signal"]) {
      assert.ok(sloppy.events.some((e) => e.rule == r), r);
   }
   // a car right beside us in the left lane when we move over
   const beside = { x: 0, y: 150, speed: 3.9, angle: Math.PI / 2 * -1, height: 50, move() {} };
   const crowded = drive(world, path, {
      speed: fast, coachOptions: { speedLimit: 55 }, traffic: [beside],
      each: (at, car) => {
         careful(at, car);
         beside.x = car.x + 10;
      },
   });
   assert.ok(crowded.events.some((e) => e.rule == "unsafe_lane_change"));
});

test("posted speed limits from the map count, where they make sense for a lesson", () => {
   const a = new Point(0, 0);
   const b = new Point(0, -3000);
   const c = new Point(0, -6000);
   const slow = new Segment(a, b);
   slow.speedLimit = 20;
   const odd = new Segment(b, c);
   odd.speedLimit = 5; // (a parking-lot limit: not for a lesson)
   const world = new World(new Graph([a, b, c], [slow, odd]));
   const car = new Car(35, -1000, 30, 50, "PLAYER", 0, 6);
   const coach = new DrivingCoach(world, car, { speedLimit: 30 });
   assert.equal(coach.currentLimit, 20);
   assert.equal(coach.limitAt(new Point(35, -4500)), 30);
   // saved and loaded, the limit is still there
   const again = World.load(JSON.parse(JSON.stringify(world.toJSON())));
   assert.equal(again.graph.segments[0].speedLimit, 20);
});
