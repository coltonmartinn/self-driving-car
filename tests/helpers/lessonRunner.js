// Runs a whole Driving School lesson in Node, the way drive.html does,
// with the demo driver (Autopilot) at the wheel
const fs = require("node:fs");
const path = require("node:path");
const { loadApp } = require("./loadApp");

function runLesson(lessonId, { city = "beverly-hills", seed = 1, maxFrames = 60 * 60 * 4 } = {}) {
   const app = loadApp({ seed });
   const { World, Simulation, DrivingSchool, DrivingCoach, LESSONS, Autopilot, Hazards } = app;
   const file = path.join(__dirname, "..", "..", "data", "cities", city + ".json");
   const world = World.load(JSON.parse(fs.readFileSync(file, "utf8")));
   DrivingSchool.addTrafficControls(world);
   DrivingSchool.addCrosswalks(world);
   world.lightTiming = { green: 8, yellow: 3 };
   const lesson = LESSONS.find((l) => l.id == lessonId);
   const controls = {
      forward: false, reverse: false, left: false, right: false, signal: null, looked: null, lookCount: 0,
      cancelSignal() { this.signal = null; },
      lookOver(side) { this.looked = side; this.lookCount++; },
   };
   const limit = lesson.speedLimit / DrivingCoach.MPH_PER_UNIT;
   const pace = lesson.id == "following" ? [0.6, 0.75] : [0.8, 1];
   const sim = new Simulation(world, {
      playerControls: controls, trafficCount: lesson.traffic, pedestrians: !!lesson.pedestrians,
      autoArrive: !lesson.pullover, trafficSpeed: [limit * pace[0], limit * pace[1]],
   });
   sim.manual = true;
   if (!DrivingSchool.pickTrip(sim, lesson.route, 15)) throw new Error("no trip");
   sim.startGeneration();
   const car = DrivingSchool.setUpStudentCar(sim.cars[0], lesson);
   const extras = DrivingSchool.setUpLesson(sim, lesson);
   const coach = new DrivingCoach(world, car, {
      speedLimit: lesson.speedLimit, rules: lesson.rules, followSeconds: lesson.followSeconds || 2, zones: extras.zones,
   });
   let nextAmbulance = lesson.emergency ? 600 : Infinity;
   let ambulances = 0;
   const spot = lesson.pullover ? DrivingSchool.parkingSpotOn(sim.trip.route, world) : null;
   const pilot = new Autopilot({ sim, car, coach, controls, lesson, parkingSpot: spot });
   const hazards = lesson.hazards ? new Hazards(sim) : null;
   const turns = DrivingSchool.turnsOf(sim.trip.route, DrivingSchool.junctionsOf(world));
   const said = [];
   let still = 0;
   let frame = 0;
   for (; frame < maxFrames && !car.damaged && !car.arrived; frame++) {
      if (coach.frame >= nextAmbulance) {
         if (DrivingSchool.spawnAmbulance(sim, car)) {
            ambulances++;
            nextAmbulance = ambulances < 2 ? coach.frame + 1500 : Infinity;
         } else {
            nextAmbulance = coach.frame + 60;
         }
      }
      const line = pilot.update(turns);
      if (line) said.push(line.title);
      sim.step();
      coach.update(sim.others);
      if (hazards) {
         const h = hazards.update(car);
         if (h && h.type == "done" && h.handled) coach.report("hazard_avoided");
      }
      if (spot) {
         still = app.distance(car, spot.center) < 160 && Math.abs(car.speed) < 0.02 ? still + 1 : 0;
         if (still == 60) {
            coach.judgePullOver(spot);
            car.arrived = true;
         }
      }
   }
   return { app, sim, car, coach, said, frame, hazards, extras, ambulances };
}

module.exports = { runLesson };
