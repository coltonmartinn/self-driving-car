const test = require("node:test");
const assert = require("node:assert/strict");
const { loadApp } = require("./helpers/loadApp");

const { Point, Segment, Graph, Pathfinder, Route, MinHeap, WorldGenerator } = loadApp();

// 3x3 grid of intersections, 100 apart:
//  a b c
//  d e f
//  g h i
function grid() {
   const p = {};
   "abcdefghi".split("").forEach((name, i) => {
      p[name] = new Point((i % 3) * 100, Math.floor(i / 3) * 100);
   });
   const roads = ["ab", "bc", "de", "ef", "gh", "hi", "ad", "dg", "be", "eh", "cf", "fi"];
   const segments = roads.map(([x, y]) => new Segment(p[x], p[y]));
   return { p, graph: new Graph(Object.values(p), segments), segments };
}

const pathLength = (path) =>
   path.slice(1).reduce((sum, pt, i) => sum + Math.hypot(pt.x - path[i].x, pt.y - path[i].y), 0);

test("MinHeap pops in priority order", () => {
   const heap = new MinHeap();
   for (const n of [5, 1, 9, 3, 7, 2, 8]) heap.push("v" + n, n);
   const out = [];
   while (heap.size) out.push(heap.pop());
   assert.equal(out.join(","), "v1,v2,v3,v5,v7,v8,v9");
});

test("A* finds a shortest path across the grid", () => {
   const { p, graph } = grid();
   const path = Pathfinder.shortestPath(graph, p.a, p.i);
   assert.equal(path[0], p.a);
   assert.equal(path[path.length - 1], p.i);
   assert.equal(pathLength(path), 400);
});

test("A* respects one-way streets", () => {
   const { p, graph, segments } = grid();
   // make every road touching i one-way *out of* i... except you can't get in
   for (const s of segments) {
      if (s.includes(p.i)) {
         s.oneWay = true;
         if (s.p2 == p.i) [s.p1, s.p2] = [s.p2, s.p1]; // direction: i -> elsewhere
      }
   }
   assert.equal(Pathfinder.shortestPath(graph, p.a, p.i), null);
   assert.ok(Pathfinder.shortestPath(graph, p.i, p.a)); // leaving i is fine
});

test("A* matches Dijkstra on random cities", () => {
   for (let run = 0; run < 5; run++) {
      const { points, segments } = WorldGenerator.generateGraph();
      const graph = new Graph(points, segments);
      const [a, b] = [points[0], points[points.length - 1]];
      const astar = Pathfinder.shortestPath(graph, a, b);

      // plain Dijkstra for reference
      const dist = new Map(points.map((pt) => [pt, Infinity]));
      dist.set(a, 0);
      const todo = new Set(points);
      while (todo.size) {
         let u = null;
         for (const v of todo) if (u == null || dist.get(v) < dist.get(u)) u = v;
         todo.delete(u);
         for (const s of segments) {
            if (!s.includes(u)) continue;
            const v = s.p1 == u ? s.p2 : s.p1;
            dist.set(v, Math.min(dist.get(v), dist.get(u) + s.length()));
         }
      }
      assert.ok(Math.abs(pathLength(astar) - dist.get(b)) < 1e-6);
   }
});

test("Route measures progress and finds points along the way", () => {
   const route = new Route([new Point(0, 0), new Point(100, 0), new Point(100, 100)]);
   assert.equal(route.length, 200);

   const loc = route.locate(new Point(100.5, 40), 0);
   assert.equal(loc.index, 1);
   assert.ok(Math.abs(loc.progress - 140) < 1e-9);
   assert.ok(Math.abs(loc.distance - 0.5) < 1e-9);

   const mid = route.pointAt(150);
   assert.equal(mid.x, 100);
   assert.equal(mid.y, 50);
   assert.equal(route.pointAt(999).y, 100); // clamped to the end
});
