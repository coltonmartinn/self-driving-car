// Scores a saved brain on fresh test trips that were used neither for
// training nor for picking the checkpoint, for an unbiased number.
//
//   node scripts/evaluate.js data/pretrained-brain.json --trips 10 --seed 1000
//
// Options:
//   --trips N   test trips per bundled city (default 10)
//   --seed N    random seed for picking trips and traffic (default 1000;
//               the trainer's own evaluation trips come from seeds 1-99)

const fs = require("node:fs");
const path = require("node:path");
const { loadApp } = require("../tests/helpers/loadApp");

const args = { brain: null, trips: 10, seed: 1000 };
const argv = process.argv.slice(2);
for (let i = 0; i < argv.length; i++) {
   if (argv[i] == "--trips") args.trips = Number(argv[++i]);
   else if (argv[i] == "--seed") args.seed = Number(argv[++i]);
   else args.brain = argv[i];
}
if (!args.brain) {
   console.error("usage: node scripts/evaluate.js <brain.json> [--trips N] [--seed N]");
   process.exit(1);
}

const { World, Simulation } = loadApp({ seed: args.seed });
const brain = JSON.parse(fs.readFileSync(args.brain, "utf8"));
const citiesDir = path.join(__dirname, "..", "data", "cities");
const index = JSON.parse(fs.readFileSync(path.join(citiesDir, "index.json"), "utf8"));

let arrivals = 0;
let completion = 0;
let total = 0;
for (const c of index) {
   const world = World.load(JSON.parse(fs.readFileSync(path.join(citiesDir, c.file), "utf8")));
   const sim = new Simulation(world, { populationSize: 1 });
   let cityArrivals = 0;
   for (let k = 0; k < args.trips; k++) {
      const dest = sim.randomDestination();
      if (!dest || !sim.setTrip(dest)) continue;
      sim.startGeneration([JSON.parse(JSON.stringify(brain))]);
      while (!sim.isOver()) {
         sim.step();
      }
      const car = sim.cars[0];
      if (car.arrived) cityArrivals++;
      completion += sim.score(car);
      total++;
   }
   arrivals += cityArrivals;
   console.log(c.label.padEnd(14) + " " + cityArrivals + "/" + args.trips + " arrived");
}
console.log(
   "\n" + path.basename(args.brain) + ": " + ((arrivals / total) * 100).toFixed(0) + "% of " + total +
   " test trips completed, " + (completion / total).toFixed(0) + "% of route on average"
);
