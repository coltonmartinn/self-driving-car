const test = require("node:test");
const assert = require("node:assert/strict");
const { loadApp } = require("./helpers/loadApp");

const {
   Point, Segment, Graph, World, Car, NeuralNetwork, TrafficCar, TrafficNetwork, Light,
   normalize, subtract, distance,
} = loadApp();

test("the neural network outputs one on/off value per control", () => {
   const brain = new NeuralNetwork([5, 6, 4]);
   const outputs = NeuralNetwork.feedForward([0, 0.5, 1, 0.2, 0], brain);
   assert.equal(outputs.length, 4);
   for (const o of outputs) {
      assert.ok(o === 0 || o === 1);
   }
});

test("mutate(0) keeps a brain, mutate(1) replaces it", () => {
   const brain = new NeuralNetwork([5, 6, 4]);
   const copy = JSON.parse(JSON.stringify(brain));
   NeuralNetwork.mutate(copy, 0);
   assert.deepEqual(copy, JSON.parse(JSON.stringify(brain)));
   NeuralNetwork.mutate(copy, 1);
   assert.notDeepEqual(copy.levels[0].weights, brain.levels[0].weights);
});

test("a car driving into a wall gets damaged, and its sensors saw it coming", () => {
   const car = new Car(0, 0, 30, 50, "DUMMY"); // DUMMY always drives forward (up)
   const wall = [new Point(-100, -120), new Point(100, -120)];
   const seeing = new Car(0, 0, 30, 50, "AI"); // has sensors
   seeing.update([wall], []);
   assert.ok(seeing.sensor.readings[2], "middle ray should hit the wall");
   assert.ok(Math.abs(seeing.sensor.readings[2].y + 120) < 1e-9);

   for (let i = 0; i < 200 && !car.damaged; i++) {
      car.update([wall], []);
   }
   assert.equal(car.damaged, true);
   assert.ok(car.y < -80);
});

// A straight east-west road with a dead end at x = 2000
function straightWorld() {
   const a = new Point(0, 0);
   const b = new Point(1000, 0);
   const c = new Point(2000, 0);
   return new World(new Graph([a, b, c], [new Segment(a, b), new Segment(b, c)]));
}

test("traffic U-turns in a cul-de-sac and comes back on the other lane", () => {
   const world = straightWorld();
   const network = new TrafficNetwork(world);
   const eastbound = network.edges.find((e) => e.to.x == 2000);
   const car = new TrafficCar(network, eastbound, 0.5);
   let turned = false;
   for (let i = 0; i < 2000; i++) {
      car.update([car]);
      if (car.edge.to.x < car.edge.from.x && car.x < 1500) {
         turned = true;
         break;
      }
   }
   assert.ok(turned, "car never came back west");
   assert.equal(car.lost, false);
   // driving on the right: westbound lane is on the north side (negative y)
   assert.ok(car.y < 0, "y " + car.y);
});

test("traffic stops at a red light and goes on green", () => {
   const world = straightWorld();
   const dir = normalize(subtract(new Point(1000, 0), new Point(0, 0)));
   const light = new Light(new Point(700, world.roadWidth / 4), dir, 70, 70);
   world.markings.push(light);
   const network = new TrafficNetwork(world);
   const eastbound = network.edges.find((e) => e.from.x == 0 && e.to.x == 1000);
   const car = new TrafficCar(network, eastbound, 0.2);

   light.state = "red";
   for (let i = 0; i < 600; i++) {
      car.update([car]);
   }
   assert.ok(car.speed < 0.1, "still moving at " + car.speed);
   assert.ok(car.x < 700, "ran the red light: x " + car.x);
   assert.ok(distance(car, light.center) < 120, "stopped too early: x " + car.x);

   light.state = "green";
   for (let i = 0; i < 200; i++) {
      car.update([car]);
   }
   assert.ok(car.x > 760, "didn't go on green: x " + car.x);
});
