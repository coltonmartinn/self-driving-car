const test = require("node:test");
const assert = require("node:assert/strict");
const { loadApp } = require("./helpers/loadApp");

const { Osm, World, Graph, Light, Stop, Crossing, Places, Simulation } = loadApp({ seed: 2 });

// A tiny made-up neighbourhood in Overpass JSON format: a crossroads, a
// one-way street, a reversed one-way, a footpath and one building.
const LAT = 40.0;
const LON = -75.0;
const d = 0.0009; // about 100 m
const node = (id, dLat, dLon, tags) => ({ type: "node", id, lat: LAT + dLat, lon: LON + dLon, tags });
const fixture = {
   elements: [
      node(1, 0, 0, { highway: "traffic_signals" }),
      node(2, d, 0),
      node(3, -d, 0, { highway: "crossing" }),
      node(4, 0, d),
      node(5, 0, -d),
      node(6, -2 * d, 0),
      node(7, 0, 2 * d),
      node(8, d * 0.3, d * 0.3),
      node(9, d * 0.3, d * 0.6),
      node(10, d * 0.6, d * 0.6),
      node(11, d * 0.6, d * 0.3),
      node(12, d, d),
      { type: "way", id: 100, nodes: [2, 1, 3, 6], tags: { highway: "residential" } },
      { type: "way", id: 101, nodes: [5, 1, 4], tags: { highway: "primary" } },
      { type: "way", id: 102, nodes: [4, 7], tags: { highway: "tertiary", oneway: "yes" } },
      { type: "way", id: 103, nodes: [12, 2], tags: { highway: "residential", oneway: "-1" } },
      { type: "way", id: 104, nodes: [1, 12], tags: { highway: "footway" } },
      { type: "way", id: 105, nodes: [8, 9, 10, 11, 8], tags: { building: "yes", "building:levels": "5" } },
   ],
};

test("projection puts the center at 0,0 and uses 10 units per meter", () => {
   const project = Osm.projection(LAT, LON);
   const origin = project(LAT, LON);
   assert.ok(Math.abs(origin.x) < 1e-9 && Math.abs(origin.y) < 1e-9);
   const north = project(LAT + 0.001, LON); // 0.001° latitude ≈ 110.5 m
   assert.ok(Math.abs(north.y + 1105.4) < 1, "y " + north.y);
});

test("parse keeps drivable roads, skips footpaths, and handles one-ways", () => {
   const { segments, points } = Osm.parse(fixture, { lat0: LAT, lon0: LON });
   assert.equal(segments.length, 3 + 2 + 1 + 1); // no footway segment
   assert.ok(points.every((p) => typeof p.id == "number"));

   const oneWays = segments.filter((s) => s.oneWay);
   assert.equal(oneWays.length, 2);
   // oneway=-1 means traffic goes against the node order: 2 -> 12
   const reversed = oneWays.find((s) => s.p1.id == 2 || s.p2.id == 2);
   assert.equal(reversed.p1.id, 2);
   assert.equal(reversed.p2.id, 12);
});

test("parse turns building outlines into flat-roofed buildings with real height", () => {
   const { buildings } = Osm.parse(fixture, { lat0: LAT, lon0: LON });
   assert.equal(buildings.length, 1);
   assert.equal(buildings[0].base.points.length, 4); // closing node dropped
   assert.equal(buildings[0].roof, "flat");
   assert.equal(buildings[0].height, 5 * 3.2 * 10);
});

test("parse drops road pieces entirely outside the radius", () => {
   const { segments } = Osm.parse(fixture, { lat0: LAT, lon0: LON, radius: 150 });
   // node 6 and 7 are ~200 m out, but their segments start inside, so they stay;
   // nothing starts and ends outside in this fixture
   assert.equal(segments.length, 7);
   const tight = Osm.parse(fixture, { lat0: LAT, lon0: LON, radius: 50 });
   assert.ok(tight.segments.length < 7);
});

test("signals and crossings become markings in the world", () => {
   const parsed = Osm.parse(fixture, { lat0: LAT, lon0: LON });
   const world = new World(new Graph());
   world.graph = new Graph(parsed.points, parsed.segments);
   world.generateRoads();
   const markings = Osm.createMarkings(world, parsed.features);
   const lights = markings.filter((m) => m instanceof Light);
   // the crossroads at node 1 has 4 two-way approaches long enough for a light
   assert.equal(lights.length, 4);
   assert.equal(markings.filter((m) => m instanceof Crossing).length, 1);
   assert.equal(markings.filter((m) => m instanceof Stop).length, 0);
});

test("roads cut off at the edge of a downloaded area run off the map, without cul-de-sacs", () => {
   // a street east-west through the middle, 1 km long, and a real dead end
   // 150 m to the north, in a 300 m area (plus a 150 m margin)
   const m = 1 / 111320; // degrees of longitude per meter at the equator
   const n = (id, east, north) => ({ type: "node", id, lat: north / 110540, lon: east * m });
   const data = {
      elements: [
         n(1, -500, 0), n(2, -250, 0), n(3, 0, 0), n(4, 250, 0), n(5, 500, 0), n(6, 0, 150),
         { type: "way", id: 10, nodes: [1, 2, 3, 4, 5], tags: { highway: "residential" } },
         { type: "way", id: 11, nodes: [3, 6], tags: { highway: "residential" } },
      ],
   };
   const world = Places.buildWorld(data, { name: "Test", lat: 0, lon: 0, radius: 300, loadRadius: 450 });
   assert.equal(world.mapEdges.size, 2, "both ends of the long street");
   assert.equal(world.culDeSacs.length, 1, "only the real dead end gets a turnaround");
   assert.ok(Math.abs(world.culDeSacs[0].y + 1500) < 1);
   // saved and loaded, it still knows
   const again = World.load(JSON.parse(JSON.stringify(world.toJSON())));
   assert.equal(again.mapEdges.size, 2);
   assert.equal(again.culDeSacs.length, 1);
   // trips stay inside the picked area
   const sim = new Simulation(world, { trafficOn: false });
   for (let i = 0; i < 20; i++) {
      const dest = sim.randomDestination();
      assert.ok(Math.hypot(dest.x, dest.y) < 3000, "inside the area");
   }
});
