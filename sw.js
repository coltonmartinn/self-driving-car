// Service worker: makes the app installable and lets it work offline.
// Everything the pages need is saved on install; after that, pages load
// from the saved copy at once and quietly refresh it in the background
// (tests/pwa.test.js checks that this list covers every page's files).
const CACHE = "self-driving-city-v3";

const APP_FILES = [
   "./",
   "index.html",
   "drive.html",
   "lab.html",
   "editor.html",
   "quiz.html",
   "class.html",
   "styles.css",
   "manifest.webmanifest",
   "icons/icon-192.png",
   "icons/icon-512.png",
   "icons/icon-maskable-512.png",
   "icons/apple-touch-icon.png",
   "icons/favicon-32.png",
   "docs/screenshots/driving-school.png",
   "data/cities/index.json",
   "data/cities/beverly-hills.json",
   "data/cities/paris.json",
   "data/cities/san-francisco.json",
   "data/cities/shibuya.json",
   "data/cities/times-square.json",
   "data/pretrained-brain.json",
   "js/car/car.js",
   "js/car/controls.js",
   "js/car/genetics.js",
   "js/car/network.js",
   "js/car/sensor.js",
   "js/car/trafficCar.js",
   "js/car/visualizer.js",
   "js/editors/crossingEditor.js",
   "js/editors/graphEditor.js",
   "js/editors/lightEditor.js",
   "js/editors/markingEditor.js",
   "js/editors/parkingEditor.js",
   "js/editors/startEditor.js",
   "js/editors/stopEditor.js",
   "js/editors/targetEditor.js",
   "js/editors/yieldEditor.js",
   "js/items/building.js",
   "js/items/tree.js",
   "js/markings/crossing.js",
   "js/markings/light.js",
   "js/markings/marking.js",
   "js/markings/parking.js",
   "js/markings/start.js",
   "js/markings/stop.js",
   "js/markings/target.js",
   "js/markings/yield.js",
   "js/math/graph.js",
   "js/math/osm.js",
   "js/math/pathfinding.js",
   "js/math/spatialGrid.js",
   "js/math/utils.js",
   "js/math/worldGenerator.js",
   "js/miniMap.js",
   "js/pedestrians.js",
   "js/placeSearch.js",
   "js/places.js",
   "js/primitives/envelope.js",
   "js/primitives/point.js",
   "js/primitives/polygon.js",
   "js/primitives/segment.js",
   "js/school/coach.js",
   "js/school/drivingSchool.js",
   "js/school/hazards.js",
   "js/school/lessons.js",
   "js/school/playerControls.js",
   "js/school/progress.js",
   "js/school/quiz.js",
   "js/school/sounds.js",
   "js/simulation.js",
   "js/trainingChart.js",
   "js/viewport.js",
   "js/world.js",
   "js/worldWorker.js",
   "js/pwa.js",
];

self.addEventListener("install", (event) => {
   event.waitUntil(
      caches.open(CACHE).then((cache) => cache.addAll(APP_FILES)).then(() => self.skipWaiting())
   );
});

self.addEventListener("activate", (event) => {
   event.waitUntil(
      caches.keys()
         .then((keys) => Promise.all(keys.filter((k) => k != CACHE).map((k) => caches.delete(k))))
         .then(() => self.clients.claim())
   );
});

self.addEventListener("fetch", (event) => {
   const request = event.request;
   if (request.method != "GET") return;
   const url = new URL(request.url);
   const fonts = url.host == "fonts.googleapis.com" || url.host == "fonts.gstatic.com";
   if (url.origin != location.origin && !fonts) {
      return; // map searches and downloads always go to the network
   }
   if (url.pathname.includes("/api/")) {
      return; // the local map proxy
   }
   // saved copy first (fast, works offline), refreshed in the background
   event.respondWith(
      caches.open(CACHE).then(async (cache) => {
         const saved = await cache.match(request, { ignoreSearch: !fonts });
         const fresh = fetch(request)
            .then((response) => {
               if (response.ok) cache.put(request, response.clone());
               return response;
            })
            .catch(() => saved);
         return saved || fresh;
      })
   );
});
