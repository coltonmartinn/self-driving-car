// Helpers that turn a world into a place to practice driving: signs and
// lights at every intersection, routes picked to fit a lesson, and
// turn-by-turn directions. No drawing and no page access (tested in Node).
const DrivingSchool = {
   // Real map data rarely tags every sign and signal, so intersections
   // without any get some: lights at bigger crossings, stop signs elsewhere.
   // The choice depends only on the intersection's position, so a city
   // always gets the same signs.
   addTrafficControls(world) {
      const rw = world.roadWidth;
      const isControl = (m) => m instanceof Light || m instanceof Stop || m instanceof Yield;
      const existing = world.markings.filter(isControl);
      const neighbors = WorldGenerator.getNeighbors(world.graph);
      const added = [];
      for (const [p, ns] of neighbors) {
         if (ns.length < 3) {
            continue;
         }
         if (existing.some((m) => distance(m.center, p) < rw * 1.6)) {
            continue; // already has real signs or signals
         }
         const kind = ns.length >= 4 && DrivingSchool.hash(p) < 0.6 ? "light" : "stop";
         for (const first of ns) {
            const marking = DrivingSchool.approachMarking(world, neighbors, p, first, kind);
            // junctions a few meters apart can claim the same street: one
            // sign or light per approach is enough
            const duplicate = marking && [...existing, ...added].some((m) =>
               distance(m.center, marking.center) < rw * 1.5 &&
               dot(m.directionVector, marking.directionVector) > 0.7
            );
            if (marking && !duplicate) {
               added.push(marking);
            }
         }
      }
      world.markings.push(...added);
      return added.length;
   },

   // A sign or light for traffic coming into junction p along the road that
   // starts with `first`. Imported streets are made of many short pieces, so
   // this follows the road back through them to find room for the sign.
   approachMarking(world, neighbors, p, first, kind) {
      const rw = world.roadWidth;
      let setback = rw / 2 + 30; // stop line just before the junction
      if (first.seg.oneWay && first.seg.p2 != p) {
         return null; // nobody drives this way towards p
      }
      const chain = [p, first.point];
      let length = distance(p, first.point);
      while (length < rw * 3.5) { // room for the sign, even behind a crosswalk
         const here = chain[chain.length - 1];
         const ns = neighbors.get(here) || [];
         if (ns.length != 2) {
            break; // another junction or a dead end
         }
         const next = ns.find((n) => n.point != chain[chain.length - 2]);
         if (!next) {
            break;
         }
         chain.push(next.point);
         length += distance(here, next.point);
      }
      if (length < setback + rw / 2) {
         return null; // junctions too close together
      }
      const route = new Route(chain);
      // the stop line goes before a crosswalk at the corner, not on top of it
      for (const m of world.markings) {
         if (!(m instanceof Crossing)) continue;
         const loc = route.locate(m.center, 0, chain.length);
         if (loc.distance < rw / 2 && loc.progress < setback + m.height) {
            setback = Math.max(setback, loc.progress + m.height / 2 + 45);
         }
      }
      if (length < setback + rw / 2) {
         return null;
      }
      const at = route.pointAt(setback);
      const dir = normalize(subtract(route.pointAt(setback - 10), route.pointAt(setback + 10)));
      const center = first.seg.oneWay ? at : add(at, scale(perpendicular(dir), rw / 4));
      const size = rw / 2;
      return kind == "light" ? new Light(center, dir, size, size) : new Stop(center, dir, size, size);
   },

   // Mid-block crosswalks on longer streets that have none (many places,
   // like suburbs, have no crosswalks in their map data at all)
   addCrosswalks(world) {
      const rw = world.roadWidth;
      const neighbors = WorldGenerator.getNeighbors(world.graph);
      const existing = world.markings.filter((m) => m instanceof Crossing);
      const isEnd = (p) => (neighbors.get(p) || []).length != 2;
      const seen = new Set();
      const added = [];
      for (const [start, ns] of neighbors) {
         if (!isEnd(start)) continue;
         for (const first of ns) {
            if (seen.has(first.seg)) continue;
            // follow the street to the next junction or dead end
            const chain = [start];
            let step = first;
            while (step) {
               seen.add(step.seg);
               chain.push(step.point);
               if (isEnd(step.point)) break;
               const prev = chain[chain.length - 2];
               step = neighbors.get(step.point).find((n) => n.point != prev && !seen.has(n.seg));
            }
            const route = new Route(chain);
            if (route.length < rw * 5 || DrivingSchool.hash(chain[1]) < 0.35) {
               continue; // short streets, and some long ones, go without
            }
            const center = route.pointAt(route.length / 2);
            if ([...existing, ...added].some((m) => distance(m.center, center) < rw * 3)) {
               continue;
            }
            const dir = normalize(subtract(route.pointAt(route.length / 2 + 10), route.pointAt(route.length / 2 - 10)));
            added.push(new Crossing(center, dir, rw, rw / 2));
         }
      }
      world.markings.push(...added);
      return added.length;
   },

   crossingsOn(route, world) {
      return world.markings.filter(
         (m) => m instanceof Crossing && route.locate(m.center, 0, route.points.length).distance < world.roadWidth / 2 + 10
      );
   },

   // A repeatable number in [0, 1) for a point
   hash(p) {
      const s = Math.sin(p.x * 12.9898 + p.y * 78.233) * 43758.5453;
      return s - Math.floor(s);
   },

   // Points where a driver has a choice: junctions, and dead ends (U-turns)
   junctionsOf(world) {
      const degree = new Map();
      for (const seg of world.graph.segments) {
         degree.set(seg.p1, (degree.get(seg.p1) || 0) + 1);
         degree.set(seg.p2, (degree.get(seg.p2) || 0) + 1);
      }
      return new Set(world.graph.points.filter((p) => degree.get(p) != 2));
   },

   // Where and which way the route turns (+ = left, - = right, in radians).
   // Pass the world's junctions so bends in a road don't count as turns.
   // The turn is measured over a stretch around the corner, since real
   // roads curve through junctions in several small pieces.
   turnsOf(route, junctions = null) {
      const turns = [];
      for (let i = 1; i < route.points.length - 1; i++) {
         if (junctions && !junctions.has(route.points[i])) {
            continue;
         }
         const at = route.cumulative[i];
         const a = subtract(route.points[i], route.pointAt(at - 60));
         const b = subtract(route.pointAt(at + 60), route.points[i]);
         // screen y points down, so a left turn has a negative cross product
         const turn = Math.atan2(-(a.x * b.y - a.y * b.x), dot(a, b));
         if (Math.abs(turn) > 0.6) {
            turns.push({ index: i, at, point: route.points[i], turn });
         }
      }
      return turns;
   },

   // Signs and lights the route drives through, in the right direction
   controlsOn(route, world) {
      const found = [];
      for (const m of world.markings) {
         if (!(m instanceof Light || m instanceof Stop || m instanceof Yield)) {
            continue;
         }
         const loc = route.locate(m.center, 0, route.points.length);
         if (loc.distance > world.roadWidth / 2) {
            continue;
         }
         const dir = normalize(subtract(route.pointAt(loc.progress + 5), route.pointAt(loc.progress - 5)));
         if (dot(dir, m.directionVector) > 0.7) {
            found.push({ marking: m, at: loc.progress });
         }
      }
      return found.sort((a, b) => a.at - b.at);
   },

   // What a lesson's route should look like
   routeScore(features, kind) {
      const { length, turns, stops, lights, crossings } = features;
      const meters = length / Osm.UNITS_PER_METER;
      const near = (v, goal, spread) => -Math.abs(v - goal) / spread;
      switch (kind) {
         case "basics": // short, at most a turn or two
            return near(meters, 250, 100) + near(turns, 1, 1) - stops - lights;
         case "stops":
            return Math.min(stops, 3) * 2 + near(meters, 450, 120) - lights * 0.5;
         case "lights":
            return Math.min(lights, 3) * 2 + near(meters, 450, 120);
         case "turns":
            return Math.min(turns, 4) * 2 + near(meters, 450, 120);
         case "crossings":
            return Math.min(crossings, 3) * 2 + near(meters, 450, 120);
         case "following": // long straight-ish roads, to follow other cars
            return near(meters, 450, 150) - turns;
         default: // a full road test: a bit of everything
            return Math.min(turns, 4) + Math.min(stops, 3) + Math.min(lights, 3) + Math.min(crossings, 2) +
               near(meters, 600, 250);
      }
   },

   features(route, world, junctions = DrivingSchool.junctionsOf(world)) {
      const controls = DrivingSchool.controlsOn(route, world);
      return {
         length: route.length,
         turns: DrivingSchool.turnsOf(route, junctions).length,
         stops: controls.filter((c) => c.marking instanceof Stop).length,
         lights: controls.filter((c) => c.marking instanceof Light).length,
         crossings: DrivingSchool.crossingsOn(route, world).length,
      };
   },

   // Try a few destinations and keep the one whose route suits the lesson
   pickTrip(sim, kind, tries = 30) {
      let best = null;
      const junctions = DrivingSchool.junctionsOf(sim.world);
      for (let i = 0; i < tries; i++) {
         const dest = sim.randomDestination();
         if (!dest || !sim.setTrip(dest)) {
            continue;
         }
         const features = DrivingSchool.features(sim.trip.route, sim.world, junctions);
         const score = DrivingSchool.routeScore(features, kind);
         if (!best || score > best.score) {
            best = { dest, score };
         }
      }
      if (best) {
         sim.setTrip(best.dest);
      }
      return best ? best.dest : null;
   },

   // The next instruction for a driver at `progress` along the route
   nextInstruction(route, progress, turns = DrivingSchool.turnsOf(route)) {
      const next = turns.find((t) => t.at > progress - 20);
      const toEnd = route.length - progress;
      if (!next) {
         return { kind: "arrive", distance: toEnd };
      }
      const sharp = Math.abs(next.turn) > 2.4;
      return {
         kind: sharp ? "uturn" : next.turn > 0 ? "left" : "right",
         distance: Math.max(0, next.at - progress),
      };
   },
};
