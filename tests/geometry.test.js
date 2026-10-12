const test = require("node:test");
const assert = require("node:assert/strict");
const { loadApp } = require("./helpers/loadApp");

const { Point, Segment, Polygon, Envelope, getIntersection } = loadApp();

const square = (x, y, size) =>
   new Polygon([
      new Point(x, y),
      new Point(x + size, y),
      new Point(x + size, y + size),
      new Point(x, y + size),
   ]);

test("getIntersection finds where two segments cross", () => {
   const hit = getIntersection(
      new Point(0, 0), new Point(10, 10),
      new Point(0, 10), new Point(10, 0)
   );
   assert.ok(hit);
   assert.equal(hit.x, 5);
   assert.equal(hit.y, 5);
   assert.equal(hit.offset, 0.5);
});

test("getIntersection returns null for parallel or separate segments", () => {
   assert.equal(getIntersection(new Point(0, 0), new Point(10, 0), new Point(0, 5), new Point(10, 5)), null);
   assert.equal(getIntersection(new Point(0, 0), new Point(1, 1), new Point(5, 0), new Point(6, -1)), null);
});

test("Segment.distanceToPoint uses the perpendicular inside and endpoints outside", () => {
   const seg = new Segment(new Point(0, 0), new Point(10, 0));
   assert.equal(seg.distanceToPoint(new Point(5, 3)), 3);
   assert.equal(seg.distanceToPoint(new Point(13, 4)), 5);
});

test("Polygon.containsPoint works for convex and concave shapes", () => {
   const sq = square(0, 0, 10);
   assert.equal(sq.containsPoint(new Point(5, 5)), true);
   assert.equal(sq.containsPoint(new Point(15, 5)), false);

   // L-shape: the notch at the top-right is outside
   const l = new Polygon([
      new Point(0, 0), new Point(4, 0), new Point(4, 6),
      new Point(10, 6), new Point(10, 10), new Point(0, 10),
   ]);
   assert.equal(l.containsPoint(new Point(2, 2)), true);
   assert.equal(l.containsPoint(new Point(8, 2)), false);
   assert.equal(l.containsPoint(new Point(8, 8)), true);
});

test("Polygon.union keeps only the outer outline of overlapping shapes", () => {
   const a = square(0, 0, 10);
   const b = square(5, 5, 10);
   const outline = Polygon.union([a, b]);
   // nothing in the outline may lie strictly inside either square
   for (const seg of outline) {
      const mid = new Point((seg.p1.x + seg.p2.x) / 2, (seg.p1.y + seg.p2.y) / 2);
      const insideA = mid.x > 0 && mid.x < 10 && mid.y > 0 && mid.y < 10;
      const insideB = mid.x > 5 && mid.x < 15 && mid.y > 5 && mid.y < 15;
      assert.ok(!(insideA && insideB) && !(insideA && mid.x > 5 && mid.y > 5));
   }
   const perimeter = outline.reduce((sum, s) => sum + s.length(), 0);
   assert.ok(Math.abs(perimeter - 60) < 1e-6, "perimeter " + perimeter);
});

test("Polygon.union leaves separate shapes untouched", () => {
   const outline = Polygon.union([square(0, 0, 10), square(100, 100, 10)]);
   assert.equal(outline.length, 8);
});

test("Envelope makes a rectangle around a segment with roundness 1", () => {
   const env = new Envelope(new Segment(new Point(0, 0), new Point(100, 0)), 20, 1);
   assert.equal(env.poly.points.length, 4);
   assert.equal(env.poly.containsPoint(new Point(50, 9)), true);
   assert.equal(env.poly.containsPoint(new Point(50, 11)), false);
});

test("Envelope.circle approximates a circle of the given radius", () => {
   const env = Envelope.circle(new Point(5, 5), 50);
   for (const p of env.poly.points) {
      assert.ok(Math.abs(Math.hypot(p.x - 5, p.y - 5) - 50) < 1e-9);
   }
   assert.equal(env.poly.containsPoint(new Point(5, 50)), true);
});
