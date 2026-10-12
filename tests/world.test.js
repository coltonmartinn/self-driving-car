const test = require("node:test");
const assert = require("node:assert/strict");
const { loadApp } = require("./helpers/loadApp");

const { Point, Segment, Graph, World, WorldGenerator, Start, getIntersection } = loadApp();

function isConnected(graph) {
   const adj = new Map(graph.points.map((p) => [p, []]));
   for (const s of graph.segments) {
      adj.get(s.p1).push(s.p2);
      adj.get(s.p2).push(s.p1);
   }
   const seen = new Set([graph.points[0]]);
   const stack = [graph.points[0]];
   while (stack.length) {
      for (const n of adj.get(stack.pop())) {
         if (!seen.has(n)) {
            seen.add(n);
            stack.push(n);
         }
      }
   }
   return seen.size == graph.points.length;
}

test("random worlds are fully connected and roads never cross mid-block", () => {
   for (let run = 0; run < 10; run++) {
      const { points, segments } = WorldGenerator.generateGraph();
      const graph = new Graph(points, segments);
      assert.ok(isConnected(graph), "disconnected world");
      for (let i = 0; i < segments.length; i++) {
         for (let j = i + 1; j < segments.length; j++) {
            const a = segments[i];
            const b = segments[j];
            if (a.includes(b.p1) || a.includes(b.p2)) continue;
            assert.equal(getIntersection(a.p1, a.p2, b.p1, b.p2), null);
         }
      }
   }
});

test("generated markings all sit on a road and include a start", () => {
   const { points, segments } = WorldGenerator.generateGraph();
   const world = new World(new Graph(points, segments));
   const markings = WorldGenerator.generateMarkings(world);
   assert.ok(markings.some((m) => m instanceof Start));
   for (const m of markings) {
      assert.ok(world.envelopes.some((e) => e.poly.containsPoint(m.center)), m.type + " off road");
   }
});

test("dead ends get a cul-de-sac, junction stubs don't", () => {
   // a long T: dead ends at the far left, far right and bottom
   const c = new Point(0, 0);
   const left = new Point(-1000, 0);
   const right = new Point(1000, 0);
   const down = new Point(0, 1000);
   const stubEnd = new Point(0, -60); // tiny stub right at the junction
   const graph = new Graph(
      [c, left, right, down, stubEnd],
      [new Segment(left, c), new Segment(c, right), new Segment(c, down), new Segment(c, stubEnd)]
   );
   const world = new World(graph);
   assert.deepEqual(new Set(world.culDeSacs), new Set([left, right, down]));
   // the bulb is part of the road outline, so it's drivable
   const bulbEdge = new Point(-1000, world.getCulDeSacRadius() * 0.9);
   assert.ok(world.envelopes.some((e) => e.poly.containsPoint(bulbEdge)));
});

test("saving and loading a world keeps roads, buildings and markings", () => {
   const { points, segments } = WorldGenerator.generateGraph();
   const world = new World(new Graph(points, segments));
   world.markings.push(...WorldGenerator.generateMarkings(world));

   const loaded = World.load(JSON.parse(JSON.stringify(world)));
   assert.equal(loaded.graph.hash(), world.graph.hash());
   assert.equal(loaded.buildings.length, world.buildings.length);
   assert.equal(loaded.trees.length, world.trees.length);
   // compare as JSON: arrays made inside the sandbox aren't "strictly" equal to ours
   assert.equal(
      JSON.stringify(loaded.markings.map((m) => m.type)),
      JSON.stringify(world.markings.map((m) => m.type))
   );
   assert.equal(loaded.roadBorders.length, world.roadBorders.length);
   assert.equal(loaded.roadWidthChanged, false);
});

test("loading a save made with a different road width flags it and refits buildings", () => {
   const { points, segments } = WorldGenerator.generateGraph();
   const info = JSON.parse(JSON.stringify(new World(new Graph(points, segments))));
   info.roadWidth = 100;
   const loaded = World.load(info);
   assert.equal(loaded.roadWidthChanged, true);
   assert.equal(loaded.roadWidth, 140);
   for (const b of loaded.buildings) {
      assert.ok(!loaded.envelopes.some((e) => e.poly.intersectsPoly(b.base)));
   }
});

test("a world handed over with its road shapes loads without rebuilding them", () => {
   const { points, segments } = WorldGenerator.generateGraph();
   const world = new World(new Graph(points, segments));
   const info = JSON.parse(JSON.stringify(world.toFullJSON()));
   const loaded = World.load(info);
   assert.equal(loaded.envelopes.length, world.envelopes.length);
   assert.equal(loaded.culDeSacs.length, world.culDeSacs.length);
   assert.equal(
      JSON.stringify(loaded.roadBorders.map((s) => [s.p1.x, s.p1.y, s.p2.x, s.p2.y])),
      JSON.stringify(world.roadBorders.map((s) => [s.p1.x, s.p1.y, s.p2.x, s.p2.y]))
   );
   assert.equal(loaded.intersections.length, world.intersections.length);
});
