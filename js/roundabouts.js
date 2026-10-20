// Roundabouts, for the Driving School's roundabout lesson: a few of a city's
// junctions become one-lane roundabouts. Traffic goes counterclockwise (as
// in the US and Canada) and yields on the way in. Works on a world's saved
// JSON before World.load, so the real city stays as it is everywhere else.
// Pure logic (tested in Node).
class Roundabouts {
   static RADIUS = 200; // the middle of the ring: 20 m from the center of the island

   // Turns up to `max` junctions of the world `info` (World.toJSON) into
   // roundabouts, picking ones near `near` first and keeping them apart.
   // Changes `info` (graph, markings, buildings, trees) and returns how
   // many it made; the roundabouts are listed in info.roundabouts.
   static build(info, { max = 5, near = { x: 0, y: 0 } } = {}) {
      const rw = info.roadWidth || 140;
      const R = Roundabouts.RADIUS;
      const graph = Roundabouts.#graphOf(info);
      const neighbors = Roundabouts.#neighbors(graph);
      const candidates = graph.points
         .filter((p) => [3, 4].includes((neighbors.get(p) || []).length))
         .sort((a, b) => Roundabouts.#dist(a, near) - Roundabouts.#dist(b, near));
      const made = [];
      for (const c of candidates) {
         if (made.length >= max) break;
         if (made.some((m) => Roundabouts.#dist(m.center, c) < R * 2 + rw * 6)) continue;
         const plan = Roundabouts.#plan(info, graph, neighbors, c, rw);
         if (!plan) continue;
         Roundabouts.#apply(info, graph, plan, rw);
         made.push(plan.roundabout);
      }
      info.graph = {
         points: graph.points.map((p) => ({ x: p.x, y: p.y })),
         segments: graph.segments.map((s) => ({ p1: { x: s.p1.x, y: s.p1.y }, p2: { x: s.p2.x, y: s.p2.y }, oneWay: s.oneWay, ...(s.name ? { name: s.name } : {}), ...(s.speedLimit ? { speedLimit: s.speedLimit } : {}) })),
      };
      info.roundabouts = [...(info.roundabouts || []), ...made];
      return made.length;
   }

   // The roundabout whose ring passes within `margin` of p, if any
   static at(world, p, margin = 0) {
      for (const rb of world.roundabouts || []) {
         if (Roundabouts.#dist(rb.center, p) < rb.radius + margin) return rb;
      }
      return null;
   }

   // Is p one of the points on a roundabout's ring?
   static isRingPoint(world, p) {
      const rb = Roundabouts.at(world, p, 2);
      return !!rb && Math.abs(Roundabouts.#dist(rb.center, p) - rb.radius) < 2;
   }

   // Cars in the ring coming towards `at` (a point at the entry), which a
   // driver entering there must let go first. `window`: how far back around
   // the ring to look (radians).
   static trafficComing(rb, at, cars, { window = 1.3, exclude = null, moving = false, roadWidth = 140 } = {}) {
      const entry = Math.atan2(at.y - rb.center.y, at.x - rb.center.x);
      return cars.find((o) => {
         if (o == exclude || o.isPedestrian || o.isParked) return false;
         if (moving && Math.abs(o.speed) < 0.3) return false;
         if (Math.abs(Roundabouts.#dist(o, rb.center) - rb.radius) > roadWidth / 2 + 15) return false;
         // the ring goes the way the angle shrinks (counterclockwise on
         // screen), so cars on their way to us have a bigger angle
         let behind = Math.atan2(o.y - rb.center.y, o.x - rb.center.x) - entry;
         behind = Math.atan2(Math.sin(behind), Math.cos(behind));
         return behind > -0.2 && behind < window;
      }) || null;
   }

   // Which way round: + when moving the right way (counterclockwise on
   // screen, angle shrinking), - when going the wrong way. heading is a unit
   // vector.
   static flow(rb, p, heading) {
      const r = { x: p.x - rb.center.x, y: p.y - rb.center.y };
      const len = Math.hypot(r.x, r.y) || 1;
      return -(r.x * heading.y - r.y * heading.x) / len;
   }

   // ---------- building ----------

   static #dist(a, b) {
      return Math.hypot(a.x - b.x, a.y - b.y);
   }

   // The saved graph, with shared point objects (like Graph.load)
   static #graphOf(info) {
      const key = (p) => p.x + "," + p.y;
      const byKey = new Map();
      const points = info.graph.points.map((p) => {
         const point = { x: p.x, y: p.y };
         byKey.set(key(p), point);
         return point;
      });
      const segments = info.graph.segments.map((s) => ({ p1: byKey.get(key(s.p1)), p2: byKey.get(key(s.p2)), oneWay: s.oneWay, name: s.name, speedLimit: s.speedLimit }));
      return { points, segments };
   }

   static #neighbors(graph) {
      const neighbors = new Map(graph.points.map((p) => [p, []]));
      for (const seg of graph.segments) {
         neighbors.get(seg.p1).push({ seg, point: seg.p2 });
         neighbors.get(seg.p2).push({ seg, point: seg.p1 });
      }
      return neighbors;
   }

   static #segDist(p, a, b) {
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy || 1)));
      return Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy);
   }

   // Can junction c become a roundabout? Each street must run on without
   // another junction until well past the ring, nothing else may be near,
   // and the streets must meet the ring far enough apart.
   static #plan(info, graph, neighbors, c, rw) {
      const R = Roundabouts.RADIUS;
      const dist = Roundabouts.#dist;
      const reach = R + rw * 2.6; // room for the ring, a YIELD line and a car
      const approaches = [];
      const used = new Set();
      for (const first of neighbors.get(c)) {
         const pts = [c, first.point];
         const segs = [first.seg];
         while (dist(pts[pts.length - 1], c) < reach) {
            const here = pts[pts.length - 1];
            const ns = neighbors.get(here);
            if (ns.length != 2 || pts.length > 40) return null; // another junction, or a dead end
            const next = ns.find((n) => n.seg != segs[segs.length - 1]);
            if (next.point == c || pts.includes(next.point)) return null;
            pts.push(next.point);
            segs.push(next.seg);
         }
         // where the street crosses the ring
         const i = pts.findIndex((p) => dist(p, c) >= R);
         const a = pts[i - 1];
         const b = pts[i];
         let lo = 0;
         let hi = 1;
         for (let k = 0; k < 30; k++) {
            const mid = (lo + hi) / 2;
            const m = { x: a.x + (b.x - a.x) * mid, y: a.y + (b.y - a.y) * mid };
            if (dist(m, c) < R) lo = mid;
            else hi = mid;
         }
         const ang = Math.atan2(a.y + (b.y - a.y) * lo - c.y, a.x + (b.x - a.x) * lo - c.x);
         const x = { x: Math.round((c.x + Math.cos(ang) * R) * 10) / 10, y: Math.round((c.y + Math.sin(ang) * R) * 10) / 10 };
         // which ways the street can be driven, next to the ring
         const seg = segs[i - 1];
         const way = !seg.oneWay ? "both" : seg.p1 == a ? "out" : "in";
         // if the next point is right by the ring, the street starts after it
         const skip = dist(x, b) < 20 && i + 1 < pts.length;
         const outer = skip ? pts[i + 1] : b;
         approaches.push({
            angle: ang, point: x, outer, way, name: seg.name, speedLimit: seg.speedLimit,
            removedPoints: pts.slice(1, skip ? i + 1 : i),
            removedSegs: segs.slice(0, skip ? i + 1 : i),
         });
         for (const s of segs) used.add(s);
      }
      approaches.sort((p, q) => p.angle - q.angle);
      for (let k = 0; k < approaches.length; k++) {
         const next = approaches[(k + 1) % approaches.length];
         let gap = next.angle - approaches[k].angle;
         if (gap <= 0) gap += Math.PI * 2;
         if (gap < 0.75) return null; // streets too close together
      }
      if (!approaches.some((ap) => ap.way != "out") || !approaches.some((ap) => ap.way != "in")) {
         return null; // nowhere to come in, or nowhere to leave
      }
      // other roads must stay clear of the ring
      for (const s of graph.segments) {
         if (used.has(s)) continue;
         if (Roundabouts.#segDist(c, s.p1, s.p2) < R + rw * 1.3) return null;
      }
      // keep the start and finish markers where they are
      for (const m of info.markings || []) {
         if ((m.type == "start" || m.type == "target") && dist(m.center, c) < R + rw * 2) return null;
      }
      return {
         center: c, approaches,
         roundabout: {
            center: { x: c.x, y: c.y }, radius: R,
            approaches: approaches.map((ap) => ({ x: ap.point.x, y: ap.point.y, entry: ap.way != "out", exit: ap.way != "in" })),
         },
      };
   }

   static #apply(info, graph, plan, rw) {
      const R = Roundabouts.RADIUS;
      const c = plan.center;
      const dist = Roundabouts.#dist;
      const removePoints = new Set([c, ...plan.approaches.flatMap((ap) => ap.removedPoints)]);
      const removeSegs = new Set(plan.approaches.flatMap((ap) => ap.removedSegs));
      graph.points = graph.points.filter((p) => !removePoints.has(p));
      graph.segments = graph.segments.filter((s) => !removeSegs.has(s));

      // the ring: the streets' points, plus more in between to keep it round
      const ring = [];
      const n = plan.approaches.length;
      for (let k = 0; k < n; k++) {
         const ap = plan.approaches[k];
         ring.push(ap.point);
         let to = plan.approaches[(k + 1) % n].angle;
         if (to <= ap.angle) to += Math.PI * 2;
         const steps = Math.ceil((to - ap.angle) / 0.45);
         for (let s = 1; s < steps; s++) {
            const a = ap.angle + ((to - ap.angle) * s) / steps;
            ring.push({ x: Math.round((c.x + Math.cos(a) * R) * 10) / 10, y: Math.round((c.y + Math.sin(a) * R) * 10) / 10 });
         }
      }
      graph.points.push(...ring);
      // one way round: from each point to the one before it (angles shrink)
      for (let k = 0; k < ring.length; k++) {
         graph.segments.push({ p1: ring[k], p2: ring[(k - 1 + ring.length) % ring.length], oneWay: true });
      }
      for (const ap of plan.approaches) {
         graph.segments.push(ap.way == "in"
            ? { p1: ap.outer, p2: ap.point, oneWay: true, name: ap.name, speedLimit: ap.speedLimit }
            : { p1: ap.point, p2: ap.outer, oneWay: ap.way == "out", name: ap.name, speedLimit: ap.speedLimit });
      }
      plan.roundabout.ring = ring.map((p) => ({ x: p.x, y: p.y }));

      // clear the ground: old signs and crosswalks, and buildings and trees
      // in the way of the ring; a tree goes on the island
      const clear = R + rw / 2 + 30;
      info.markings = (info.markings || []).filter((m) => dist(m.center, c) > R + rw * 2);
      info.buildings = (info.buildings || []).filter((b) => {
         const pts = b.base.points;
         const inside = pts.some((p, k) => {
            const q = pts[(k + 1) % pts.length];
            return (p.y > c.y) != (q.y > c.y) && c.x < ((q.x - p.x) * (c.y - p.y)) / (q.y - p.y) + p.x;
         });
         return !inside && pts.every((p, k) => Roundabouts.#segDist(c, p, pts[(k + 1) % pts.length]) > clear);
      });
      const treeSize = info.treeSize || 160;
      info.trees = (info.trees || []).filter((t) => dist(t.center, c) > clear + treeSize / 2);
      info.trees.push({ center: { x: c.x, y: c.y }, size: Math.min(treeSize, (R - rw / 2) * 1.1), height: 200 });
   }
}
