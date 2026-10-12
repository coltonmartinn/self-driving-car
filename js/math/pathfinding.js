// Binary min-heap keyed by a priority number
class MinHeap {
   constructor() {
      this.items = [];
   }

   get size() {
      return this.items.length;
   }

   push(value, priority) {
      const items = this.items;
      items.push({ value, priority });
      let i = items.length - 1;
      while (i > 0) {
         const parent = (i - 1) >> 1;
         if (items[parent].priority <= items[i].priority) break;
         [items[parent], items[i]] = [items[i], items[parent]];
         i = parent;
      }
   }

   pop() {
      const items = this.items;
      const top = items[0];
      const last = items.pop();
      if (items.length > 0) {
         items[0] = last;
         let i = 0;
         while (true) {
            const l = i * 2 + 1;
            const r = l + 1;
            let smallest = i;
            if (l < items.length && items[l].priority < items[smallest].priority) smallest = l;
            if (r < items.length && items[r].priority < items[smallest].priority) smallest = r;
            if (smallest == i) break;
            [items[smallest], items[i]] = [items[i], items[smallest]];
            i = smallest;
         }
      }
      return top.value;
   }
}

const Pathfinder = {
   // point -> [{ to, cost }], following one-way streets only in their direction
   buildAdjacency(graph) {
      const adjacency = new Map(graph.points.map((p) => [p, []]));
      for (const seg of graph.segments) {
         const cost = seg.length();
         adjacency.get(seg.p1)?.push({ to: seg.p2, cost });
         if (!seg.oneWay) {
            adjacency.get(seg.p2)?.push({ to: seg.p1, cost });
         }
      }
      return adjacency;
   },

   // A* search: like Dijkstra, but it explores towards the goal first,
   // using the straight-line distance as an optimistic estimate.
   // Returns the list of points from start to goal, or null if unreachable.
   shortestPath(graph, start, goal, adjacency = Pathfinder.buildAdjacency(graph)) {
      const cameFrom = new Map();
      const costSoFar = new Map([[start, 0]]);
      const open = new MinHeap();
      open.push(start, distance(start, goal));

      while (open.size > 0) {
         const current = open.pop();
         if (current == goal) {
            const path = [current];
            let node = current;
            while (cameFrom.has(node)) {
               node = cameFrom.get(node);
               path.unshift(node);
            }
            return path;
         }
         for (const { to, cost } of adjacency.get(current) || []) {
            const newCost = costSoFar.get(current) + cost;
            if (!costSoFar.has(to) || newCost < costSoFar.get(to)) {
               costSoFar.set(to, newCost);
               cameFrom.set(to, current);
               open.push(to, newCost + distance(to, goal));
            }
         }
      }
      return null;
   },
};

// A route along road center points, with helpers to measure how far along
// it something is (used to score the learning cars and steer them by GPS).
class Route {
   constructor(points) {
      this.points = points;
      this.cumulative = [0];
      for (let i = 1; i < points.length; i++) {
         this.cumulative.push(this.cumulative[i - 1] + distance(points[i - 1], points[i]));
      }
      this.length = this.cumulative[this.cumulative.length - 1];
   }

   // Where is `point` along the route? Searches a few segments around
   // `hintIndex` so a car can't "teleport" to a far part of a looping route.
   locate(point, hintIndex = 0, window = 6) {
      let best = null;
      const from = Math.max(0, hintIndex - 1);
      const to = Math.min(this.points.length - 2, hintIndex + window);
      for (let i = from; i <= to; i++) {
         const seg = new Segment(this.points[i], this.points[i + 1]);
         const proj = seg.projectPoint(point);
         const t = Math.max(0, Math.min(1, proj.offset));
         const onSeg = lerp2D(seg.p1, seg.p2, t);
         const d = distance(point, onSeg);
         if (!best || d < best.distance) {
            best = {
               index: i,
               distance: d,
               progress: this.cumulative[i] + t * seg.length(),
            };
         }
      }
      return best;
   }

   pointAt(progress) {
      progress = Math.max(0, Math.min(this.length, progress));
      let i = 0;
      while (i < this.cumulative.length - 2 && this.cumulative[i + 1] < progress) {
         i++;
      }
      const segLength = this.cumulative[i + 1] - this.cumulative[i];
      const t = segLength > 0 ? (progress - this.cumulative[i]) / segLength : 0;
      return lerp2D(this.points[i], this.points[i + 1], t);
   }

   draw(ctx, { color = "rgba(30,120,255,0.55)", width = 22 } = {}) {
      ctx.beginPath();
      ctx.strokeStyle = color;
      ctx.lineWidth = width;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.moveTo(this.points[0].x, this.points[0].y);
      for (let i = 1; i < this.points.length; i++) {
         ctx.lineTo(this.points[i].x, this.points[i].y);
      }
      ctx.stroke();
   }
}
