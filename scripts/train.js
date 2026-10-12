// Headless trainer: evolves brains on random GPS trips through the bundled
// real cities, much faster than real time (nothing is drawn).
//
//   node scripts/train.js --generations 150 --out data/pretrained-brain.json
//
// Options:
//   --generations N   how many generations to train (default 100)
//   --population N    cars per generation (default 100)
//   --strategy S      "crossover" (default) or "mutation"
//   --mutation X      mutation amount (default 0.1)
//   --no-gps          cars get no GPS hints (for experiments)
//   --seed N          random seed, for repeatable runs (default 1)
//   --eval-every N    evaluate the champion every N generations (default 10)
//   --out FILE        where to save the best brain (optional)
//   --log FILE        CSV of per-generation results (optional)

const fs = require("node:fs");
const path = require("node:path");
const { loadApp } = require("../tests/helpers/loadApp");

function parseArgs(argv) {
   const args = {
      generations: 100, population: 100, strategy: "crossover", mutation: 0.1,
      gps: true, seed: 1, evalEvery: 10, out: null, log: null,
   };
   for (let i = 0; i < argv.length; i++) {
      const key = argv[i];
      const next = () => argv[++i];
      if (key == "--generations") args.generations = Number(next());
      else if (key == "--population") args.population = Number(next());
      else if (key == "--strategy") args.strategy = next();
      else if (key == "--mutation") args.mutation = Number(next());
      else if (key == "--no-gps") args.gps = false;
      else if (key == "--seed") args.seed = Number(next());
      else if (key == "--eval-every") args.evalEvery = Number(next());
      else if (key == "--out") args.out = next();
      else if (key == "--log") args.log = next();
      else throw new Error("unknown option " + key);
   }
   return args;
}

const args = parseArgs(process.argv.slice(2));
const app = loadApp({ seed: args.seed });
const { World, Simulation } = app;

const citiesDir = path.join(__dirname, "..", "data", "cities");
const index = JSON.parse(fs.readFileSync(path.join(citiesDir, "index.json"), "utf8"));
const cities = index.map((c) => {
   const world = World.load(JSON.parse(fs.readFileSync(path.join(citiesDir, c.file), "utf8")));
   const sim = new Simulation(world, {
      populationSize: args.population,
      strategy: args.strategy,
      mutation: args.mutation,
      gps: args.gps,
   });
   return { label: c.label, sim };
});

// Fixed evaluation trips (3 per city), chosen once and never trained on directly
const evalTrips = [];
for (const city of cities) {
   for (let k = 0; k < 3; k++) {
      const dest = city.sim.randomDestination();
      if (dest) evalTrips.push({ city, dest });
   }
}

function runGeneration(sim, brains) {
   sim.startGeneration(brains);
   while (!sim.isOver()) {
      sim.step();
   }
}

// Champion drives each evaluation trip alone (with traffic): did it arrive,
// and how much of the route did it complete?
function evaluate(brain) {
   let arrivals = 0;
   let completion = 0;
   for (const { city, dest } of evalTrips) {
      const sim = city.sim;
      const size = sim.options.populationSize;
      sim.options.populationSize = 1;
      sim.setTrip(dest);
      runGeneration(sim, [JSON.parse(JSON.stringify(brain))]);
      const car = sim.cars[0];
      if (car.arrived) arrivals++;
      completion += sim.score(car);
      sim.options.populationSize = size;
   }
   return { arrivalRate: (arrivals / evalTrips.length) * 100, completion: completion / evalTrips.length };
}

const rows = [["generation", "city", "trip_m", "best_pct", "average_pct", "arrived", "eval_arrival_pct", "eval_completion_pct"]];
let brains = null;
let bestEval = null;
let bestBrain = null;
const started = Date.now();

for (let gen = 1; gen <= args.generations; gen++) {
   const city = cities[(gen - 1) % cities.length];
   const sim = city.sim;
   sim.setTrip(sim.randomDestination());
   runGeneration(sim, brains);

   const scores = sim.cars.map((c) => sim.score(c));
   const best = Math.max(...scores);
   const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
   brains = sim.breed();

   let evalResult = null;
   if (gen % args.evalEvery == 0 || gen == args.generations) {
      evalResult = evaluate(brains[0]);
      const better =
         !bestEval ||
         evalResult.arrivalRate > bestEval.arrivalRate ||
         (evalResult.arrivalRate == bestEval.arrivalRate && evalResult.completion > bestEval.completion);
      if (better) {
         bestEval = evalResult;
         bestBrain = JSON.parse(JSON.stringify(brains[0]));
         if (args.out) fs.writeFileSync(args.out, JSON.stringify(bestBrain));
      }
   }

   rows.push([
      gen, city.label, Math.round(sim.trip.route.length / 10), best.toFixed(1), avg.toFixed(1), sim.arrived,
      evalResult ? evalResult.arrivalRate.toFixed(1) : "", evalResult ? evalResult.completion.toFixed(1) : "",
   ]);
   const secs = ((Date.now() - started) / 1000).toFixed(0);
   console.log(
      "gen " + String(gen).padStart(4) + "  " + city.label.padEnd(14) +
      " best " + best.toFixed(0).padStart(3) + "%  avg " + avg.toFixed(0).padStart(3) + "%  arrived " + String(sim.arrived).padStart(3) +
      (evalResult ? "  | eval: " + evalResult.arrivalRate.toFixed(0) + "% arrive, " + evalResult.completion.toFixed(0) + "% of route" : "") +
      "  (" + secs + " s)"
   );
   if (args.log) fs.writeFileSync(args.log, rows.map((r) => r.join(",")).join("\n") + "\n");
}

console.log("\nbest evaluation: " + bestEval.arrivalRate.toFixed(0) + "% of " + evalTrips.length +
   " held-out trips completed, " + bestEval.completion.toFixed(0) + "% of route on average");
