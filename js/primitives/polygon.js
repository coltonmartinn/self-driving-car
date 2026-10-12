class Polygon {
   #bounds = null;

   constructor(points) {
      this.points = points;
      this.segments = [];
      for (let i = 1; i <= points.length; i++) {
         this.segments.push(
            new Segment(points[i - 1], points[i % points.length])
         );
      }
   }

   static load(info) {
      return new Polygon(info.points.map((p) => new Point(p.x, p.y)));
   }

   // segments are rebuilt from points on load, so only save the points
   toJSON() {
      return { points: this.points };
   }

   // Axis-aligned bounding box, used to skip expensive checks early.
   // (break() only adds points along existing edges, so it never changes.)
   getBounds() {
      if (!this.#bounds) {
         const xs = this.points.map((p) => p.x);
         const ys = this.points.map((p) => p.y);
         this.#bounds = {
            left: Math.min(...xs),
            right: Math.max(...xs),
            top: Math.min(...ys),
            bottom: Math.max(...ys),
         };
      }
      return this.#bounds;
   }

   isNearBounds(point, margin = 0) {
      const b = this.getBounds();
      return (
         point.x >= b.left - margin &&
         point.x <= b.right + margin &&
         point.y >= b.top - margin &&
         point.y <= b.bottom + margin
      );
   }

   boundsOverlap(poly, margin = 0) {
      const a = this.getBounds();
      const b = poly.getBounds();
      return (
         a.left - margin <= b.right &&
         a.right + margin >= b.left &&
         a.top - margin <= b.bottom &&
         a.bottom + margin >= b.top
      );
   }

   // Returns the outline segments of the union of all polygons
   static union(polys) {
      const grid = Polygon.#indexPolys(polys);
      Polygon.multiBreak(polys, grid);
      const keptSegments = [];
      for (let i = 0; i < polys.length; i++) {
         for (const seg of polys[i].segments) {
            let keep = true;
            const midpoint = average(seg.p1, seg.p2);
            for (const j of grid.queryPoint(midpoint)) {
               if (i != j && polys[j].containsPoint(midpoint)) {
                  keep = false;
                  break;
               }
            }
            if (keep) {
               keptSegments.push(seg);
            }
         }
      }
      return keptSegments;
   }

   static multiBreak(polys, grid = Polygon.#indexPolys(polys)) {
      for (let i = 0; i < polys.length - 1; i++) {
         // only polygons in nearby grid cells can cross this one
         const nearby = [...grid.query(polys[i].getBounds())]
            .filter((j) => j > i)
            .sort((a, b) => a - b);
         for (const j of nearby) {
            if (polys[i].boundsOverlap(polys[j])) {
               Polygon.break(polys[i], polys[j]);
            }
         }
      }
   }

   static #indexPolys(polys) {
      const grid = new SpatialGrid(250);
      polys.forEach((poly, i) => grid.insert(i, poly.getBounds()));
      return grid;
   }

   // Splits segments of both polygons at every point where they cross
   static break(poly1, poly2) {
      const segs1 = poly1.segments;
      const segs2 = poly2.segments;
      for (let i = 0; i < segs1.length; i++) {
         for (let j = 0; j < segs2.length; j++) {
            const int = getIntersection(
               segs1[i].p1,
               segs1[i].p2,
               segs2[j].p1,
               segs2[j].p2
            );

            if (int && int.offset != 1 && int.offset != 0) {
               const point = new Point(int.x, int.y);
               let aux = segs1[i].p2;
               segs1[i].p2 = point;
               segs1.splice(i + 1, 0, new Segment(point, aux));
               aux = segs2[j].p2;
               segs2[j].p2 = point;
               segs2.splice(j + 1, 0, new Segment(point, aux));
            }
         }
      }
   }

   distanceToPoint(point) {
      return Math.min(...this.segments.map((s) => s.distanceToPoint(point)));
   }

   distanceToPoly(poly) {
      return Math.min(...this.points.map((p) => poly.distanceToPoint(p)));
   }

   intersectsPoly(poly) {
      if (!this.boundsOverlap(poly)) {
         return false;
      }
      for (const s1 of this.segments) {
         for (const s2 of poly.segments) {
            if (getIntersection(s1.p1, s1.p2, s2.p1, s2.p2)) {
               return true;
            }
         }
      }
      return false;
   }

   containsSegment(seg) {
      const midpoint = average(seg.p1, seg.p2);
      return this.containsPoint(midpoint);
   }

   // Ray casting: shoot a ray to the right and count edge crossings; odd
   // means inside. Each edge counts its lower end but not its upper one, so a
   // ray passing exactly through a corner is still counted once.
   containsPoint(point) {
      if (!this.isNearBounds(point)) {
         return false;
      }
      let inside = false;
      const pts = this.points;
      for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
         const a = pts[i];
         const b = pts[j];
         if (
            a.y > point.y != b.y > point.y &&
            point.x < ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y) + a.x
         ) {
            inside = !inside;
         }
      }
      return inside;
   }

   drawSegments(ctx) {
      for (const seg of this.segments) {
         seg.draw(ctx, { color: getRandomColor(), width: 5 });
      }
   }

   draw(
      ctx,
      { stroke = "blue", lineWidth = 2, fill = "rgba(0,0,255,0.3)", join = "miter" } = {}
   ) {
      ctx.beginPath();
      ctx.fillStyle = fill;
      ctx.strokeStyle = stroke;
      ctx.lineWidth = lineWidth;
      ctx.lineJoin = join;
      ctx.moveTo(this.points[0].x, this.points[0].y);
      for (let i = 1; i < this.points.length; i++) {
         ctx.lineTo(this.points[i].x, this.points[i].y);
      }
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
   }
}
