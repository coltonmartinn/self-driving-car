// Loads the browser scripts into a sandbox, the same way <script> tags would,
// and hands back the classes/functions so tests can use them.
const vm = require("node:vm");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.join(__dirname, "..", "..");

const FILES = [
   "js/math/utils.js",
   "js/math/spatialGrid.js",
   "js/math/pathfinding.js",
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
   "js/roundabouts.js",
   "js/car/controls.js",
   "js/car/sensor.js",
   "js/car/network.js",
   "js/car/car.js",
   "js/car/trafficCar.js",
   "js/car/genetics.js",
   "js/pedestrians.js",
   "js/simulation.js",
   "js/places.js",
   "js/school/drivingSchool.js",
   "js/school/coach.js",
   "js/school/lessons.js",
   "js/school/progress.js",
   "js/school/quiz.js",
   "js/school/stateQuiz.js",
   "js/school/hazards.js",
   "js/school/practiceLog.js",
   "js/school/badges.js",
   "js/school/replay.js",
   "js/school/autopilot.js",
   "js/school/phone.js",
   "js/i18n.js",
   "js/i18n/es-ui.js",
   "js/i18n/es-lessons.js",
   "js/i18n/es-pages.js",
   "js/i18n/es-quiz.js",
   "js/i18n/es-states.js",
];

const EXPORTS = [
   "Point", "Segment", "Polygon", "Envelope", "Graph", "SpatialGrid", "Osm",
   "WorldGenerator", "World", "Roundabouts", "Building", "Tree", "Marking", "Stop", "Yield",
   "Crossing", "Parking", "Light", "Start", "Target", "Car", "Sensor",
   "NeuralNetwork", "Level", "TrafficCar", "TrafficNetwork", "EmergencyVehicle", "Pathfinder", "Route", "MinHeap", "Genetics", "Simulation", "Places",
   "DrivingSchool", "DrivingCoach", "LESSONS", "Pedestrian", "Crowd", "Progress", "Quiz", "QUIZ_BANK", "SIGNS", "STATE_LAWS", "StateQuiz", "Hazards", "PracticeLog", "Badges", "BADGES", "DriveRecorder", "Autopilot", "PhoneBuzz", "I18N",
   "getIntersection", "distance", "average", "add", "subtract", "scale",
   "normalize", "angle", "lerp", "polysIntersect", "getNearestPoint", "perpendicular", "dot",
];

// seed: makes Math.random (inside the app only) repeatable, for experiments
// globals: extra things the scripts can see (e.g. a fake fetch for tests)
function loadApp({ seed = null, globals = {} } = {}) {
   const context = vm.createContext({ console, ...globals });
   if (seed != null) {
      // mulberry32: a small, fast, well-distributed seeded generator
      vm.runInContext(
         "(() => { let a = " + (seed >>> 0) + "; Math.random = () => {" +
            "a |= 0; a = (a + 0x6D2B79F5) | 0;" +
            "let t = Math.imul(a ^ (a >>> 15), 1 | a);" +
            "t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;" +
            "return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; })()",
         context
      );
   }
   for (const file of FILES) {
      const code = fs.readFileSync(path.join(ROOT, file), "utf8");
      vm.runInContext(code, context, { filename: file });
   }
   return vm.runInContext("({" + EXPORTS.join(",") + "})", context);
}

module.exports = { loadApp };
