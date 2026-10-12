const test = require("node:test");
const assert = require("node:assert/strict");
const { loadApp } = require("./helpers/loadApp");

const { Point, Segment, Graph, SpatialGrid } = loadApp();

test("Graph refuses duplicate and zero-length segments", () => {
   const a = new Point(0, 0);
   const b = new Point(10, 0);
   const g = new Graph([a, b]);
   assert.equal(g.tryAddSegment(new Segment(a, b)), true);
   assert.equal(g.tryAddSegment(new Segment(b, a)), false);
   assert.equal(g.tryAddSegment(new Segment(a, new Point(0, 0))), false);
   assert.equal(g.segments.length, 1);
});

test("removing a point removes the roads attached to it", () => {
   const [a, b, c] = [new Point(0, 0), new Point(10, 0), new Point(20, 0)];
   const g = new Graph([a, b, c], [new Segment(a, b), new Segment(b, c)]);
   g.removePoint(b);
   assert.equal(g.points.length, 2);
   assert.equal(g.segments.length, 0);
});

test("Graph.load rebuilds shared points and keeps one-way roads", () => {
   const [a, b, c] = [new Point(0, 0), new Point(10, 0), new Point(10, 10)];
   const g = new Graph([a, b, c], [new Segment(a, b), new Segment(b, c, true)]);
   const loaded = Graph.load(JSON.parse(g.hash()));
   assert.equal(loaded.points.length, 3);
   // both segments must reference the very same middle point object
   assert.equal(loaded.segments[0].p2, loaded.segments[1].p1);
   assert.equal(loaded.segments[1].oneWay, true);
   assert.equal(loaded.hash(), g.hash());
});

test("SpatialGrid only returns items near the query", () => {
   const grid = new SpatialGrid(100);
   grid.insert("near", { left: 0, right: 50, top: 0, bottom: 50 });
   grid.insert("wide", { left: -500, right: 500, top: 10, bottom: 20 });
   grid.insert("far", { left: 5000, right: 5050, top: 5000, bottom: 5050 });
   const found = grid.query({ left: 10, right: 20, top: 10, bottom: 20 });
   assert.deepEqual([...found].sort(), ["near", "wide"]);
   assert.deepEqual([...grid.queryPoint(new Point(5020, 5020))], ["far"]);
});
