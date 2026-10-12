const test = require("node:test");
const assert = require("node:assert/strict");
const { loadApp } = require("./helpers/loadApp");

const { NeuralNetwork, Genetics, Simulation, World, Graph, WorldGenerator } = loadApp();

const flatten = (brain) =>
   brain.levels.flatMap((l) => [...l.biases, ...l.weights.flat()]);

test("crossover takes every value from one of the two parents", () => {
   const a = new NeuralNetwork([8, 8, 4]);
   const b = new NeuralNetwork([8, 8, 4]);
   const child = flatten(Genetics.crossover(a, b));
   const [fa, fb] = [flatten(a), flatten(b)];
   let fromA = 0;
   child.forEach((v, i) => {
      assert.ok(v === fa[i] || v === fb[i]);
      if (v === fa[i]) fromA++;
   });
   // roughly half from each parent
   assert.ok(fromA > child.length * 0.3 && fromA < child.length * 0.7, "from A: " + fromA);
});

test("the next generation keeps the champion unchanged and has the right size", () => {
   const ranked = [0, 1, 2, 3, 4].map(() => new NeuralNetwork([8, 8, 4]));
   for (const strategy of ["crossover", "mutation"]) {
      const next = Genetics.nextGeneration(ranked, 50, { strategy, mutation: 0.1 });
      assert.equal(next.length, 50);
      assert.equal(JSON.stringify(next[0]), JSON.stringify(ranked[0]));
      assert.notEqual(next[0], ranked[0]); // a copy, not the same object
      assert.notEqual(JSON.stringify(next[1]), JSON.stringify(ranked[0]));
   }
});

function smallWorld() {
   const { points, segments } = WorldGenerator.generateGraph({ minSize: 3, maxSize: 3 });
   return new World(new Graph(points, segments));
}

test("a headless generation runs to the end and scores every car", () => {
   const sim = new Simulation(smallWorld(), { populationSize: 20, trafficCount: 5, generationFrames: 600 });
   sim.startGeneration();
   let frames = 0;
   while (!sim.isOver() && frames < 1000) {
      sim.step();
      frames++;
   }
   assert.ok(sim.isOver());
   assert.ok(sim.cars.every((c) => c.fitness >= 0));
   assert.equal(sim.bestCar.fitness, Math.max(...sim.cars.map((c) => c.fitness)));
   assert.equal(sim.breed().length, 20);
});

test("a trip sets a route, starts cars on it, and scores in percent", () => {
   const sim = new Simulation(smallWorld(), { populationSize: 10, trafficOn: false });
   const dest = sim.randomDestination();
   assert.ok(dest);
   assert.equal(sim.setTrip(dest), true);
   sim.startGeneration();
   assert.equal(sim.scoreUnit, "%");
   // the cars start on the route
   const loc = sim.trip.route.locate(sim.cars[0], 0);
   assert.ok(loc.distance < sim.world.roadWidth, "start is " + loc.distance + " from the route");
   for (let i = 0; i < 200; i++) sim.step();
   for (const car of sim.cars) {
      const s = sim.score(car);
      assert.ok(s >= 0 && s <= 100);
   }
   sim.clearTrip();
   assert.equal(sim.scoreUnit, "m");
});
