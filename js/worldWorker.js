// Background thread that turns downloaded map data into a world, so the
// page (and its loading spinner) stays responsive while the geometry runs.
importScripts(
   "math/utils.js",
   "math/spatialGrid.js",
   "math/graph.js",
   "math/osm.js",
   "math/worldGenerator.js",
   "primitives/point.js",
   "primitives/segment.js",
   "primitives/polygon.js",
   "primitives/envelope.js",
   "items/building.js",
   "items/tree.js",
   "markings/marking.js",
   "markings/stop.js",
   "markings/yield.js",
   "markings/crossing.js",
   "markings/parking.js",
   "markings/light.js",
   "markings/start.js",
   "markings/target.js",
   "world.js",
   "places.js"
);

onmessage = (evt) => {
   const { data, place } = evt.data;
   try {
      const world = Places.buildWorld(data, place);
      // include the finished road shapes so the page doesn't redo that work
      postMessage({ ok: true, info: JSON.parse(JSON.stringify(world.toFullJSON())) });
   } catch (e) {
      postMessage({ ok: false, error: e.message });
   }
};
