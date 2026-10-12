// Buckets items by the grid cells their bounding box touches, so "what is
// near here?" only looks at a few cells instead of every item in the world.
class SpatialGrid {
   constructor(cellSize = 250) {
      this.cellSize = cellSize;
      this.cells = new Map();
   }

   static boundsOfSegment(p1, p2, margin = 0) {
      return {
         left: Math.min(p1.x, p2.x) - margin,
         right: Math.max(p1.x, p2.x) + margin,
         top: Math.min(p1.y, p2.y) - margin,
         bottom: Math.max(p1.y, p2.y) + margin,
      };
   }

   static boundsAround(point, radius) {
      return {
         left: point.x - radius,
         right: point.x + radius,
         top: point.y - radius,
         bottom: point.y + radius,
      };
   }

   #key(cx, cy) {
      return cx * 1000003 + cy;
   }

   #range(bounds) {
      const cs = this.cellSize;
      return [
         Math.floor(bounds.left / cs),
         Math.floor(bounds.right / cs),
         Math.floor(bounds.top / cs),
         Math.floor(bounds.bottom / cs),
      ];
   }

   insert(item, bounds) {
      const [x0, x1, y0, y1] = this.#range(bounds);
      for (let cx = x0; cx <= x1; cx++) {
         for (let cy = y0; cy <= y1; cy++) {
            const key = this.#key(cx, cy);
            let cell = this.cells.get(key);
            if (!cell) {
               cell = [];
               this.cells.set(key, cell);
            }
            cell.push(item);
         }
      }
   }

   // Unique items whose cells overlap the bounds (may include a few extras)
   query(bounds) {
      const [x0, x1, y0, y1] = this.#range(bounds);
      const result = new Set();
      for (let cx = x0; cx <= x1; cx++) {
         for (let cy = y0; cy <= y1; cy++) {
            const cell = this.cells.get(this.#key(cx, cy));
            if (cell) {
               for (const item of cell) {
                  result.add(item);
               }
            }
         }
      }
      return result;
   }

   queryPoint(point) {
      const cs = this.cellSize;
      return this.cells.get(this.#key(Math.floor(point.x / cs), Math.floor(point.y / cs))) || [];
   }
}
