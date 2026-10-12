// Loads the browser scripts into a sandbox, the same way <script> tags would,
// and hands back the classes/functions so tests can use them.
const vm = require("node:vm");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.join(__dirname, "..", "..");

const FILES = [
   "js/math/utils.js",
   "js/math/spatialGrid.js",
   "js/math/graph.js",
   "js/math/osm.js",
   "js/math/worldGenerator.js",
   "js/primitives/point.js",
   "js/primitives/segment.js",
   "js/primitives/polygon.js",
   "js/primitives/envelope.js",
   "js/items/building.js",
   "js/items/tree.js",
   "js/markings/marking.js",
   "js/markings/stop.js",
   "js/markings/yield.js",
   "js/markings/crossing.js",
   "js/markings/parking.js",
   "js/markings/light.js",
   "js/markings/start.js",
   "js/markings/target.js",
   "js/world.js",
   "js/car/controls.js",
   "js/car/sensor.js",
   "js/car/network.js",
   "js/car/car.js",
   "js/car/trafficCar.js",
];

const EXPORTS = [
   "Point", "Segment", "Polygon", "Envelope", "Graph", "SpatialGrid", "Osm",
   "WorldGenerator", "World", "Building", "Tree", "Marking", "Stop", "Yield",
   "Crossing", "Parking", "Light", "Start", "Target", "Car", "Sensor",
   "NeuralNetwork", "Level", "TrafficCar", "TrafficNetwork",
   "getIntersection", "distance", "average", "add", "subtract", "scale",
   "normalize", "angle", "lerp", "polysIntersect", "getNearestPoint",
];

function loadApp() {
   const context = vm.createContext({ console });
   for (const file of FILES) {
      const code = fs.readFileSync(path.join(ROOT, file), "utf8");
      vm.runInContext(code, context, { filename: file });
   }
   return vm.runInContext("({" + EXPORTS.join(",") + "})", context);
}

module.exports = { loadApp };
