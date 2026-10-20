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
         if (Roundabouts.isRingPoint(world, p)) {
            // a roundabout: YIELD where each street comes in, nothing on the ring
            for (const first of ns) {
               if (Roundabouts.isRingPoint(world, first.point)) continue;
               const marking = DrivingSchool.approachMarking(world, neighbors, p, first, "yield");
               if (marking && !existing.some((m) => distance(m.center, marking.center) < rw)) added.push(marking);
            }
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
      return kind == "light" ? new Light(center, dir, size, size)
         : kind == "yield" ? new Yield(center, dir, size, size) : new Stop(center, dir, size, size);
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

   // Points where a driver has a choice: junctions, and dead ends (U-turns).
   // (Not the points on a roundabout: going round it isn't a turn.)
   junctionsOf(world) {
      const degree = new Map();
      for (const seg of world.graph.segments) {
         degree.set(seg.p1, (degree.get(seg.p1) || 0) + 1);
         degree.set(seg.p2, (degree.get(seg.p2) || 0) + 1);
      }
      return new Set(world.graph.points.filter((p) => degree.get(p) != 2 && !Roundabouts.isRingPoint(world, p)));
   },

   // The roundabouts a route goes through: where it comes onto the ring and
   // leaves it (distances along the route), and which exit it takes
   roundaboutsOn(route, world) {
      const found = [];
      for (let i = 0; i < route.points.length; i++) {
         if (!Roundabouts.isRingPoint(world, route.points[i])) continue;
         const roundabout = Roundabouts.at(world, route.points[i], 2);
         let j = i;
         while (j + 1 < route.points.length && Roundabouts.isRingPoint(world, route.points[j + 1])) j++;
         // exits passed on the way, counting the one taken
         const isExit = (p) => roundabout.approaches.some((a) => a.exit && distance(a, p) < 2);
         const exit = route.points.slice(i + 1, j + 1).filter(isExit).length;
         if (j > i && j < route.points.length - 1) {
            found.push({ roundabout, enterIndex: i, exitIndex: j, enterAt: route.cumulative[i], exitAt: route.cumulative[j], exit: Math.max(1, exit) });
         }
         i = j;
      }
      return found;
   },

   // Turn-by-turn directions: the turns at junctions, and the roundabouts
   // (as { roundabout, at, exitAt, exit }), in order along the route
   directionsOf(route, world) {
      const turns = DrivingSchool.turnsOf(route, DrivingSchool.junctionsOf(world));
      const rounds = DrivingSchool.roundaboutsOn(route, world).map((r) => ({
         index: r.enterIndex, at: r.enterAt, exitAt: r.exitAt, point: route.points[r.enterIndex], turn: 0, roundabout: r.roundabout, exit: r.exit,
      }));
      // the practice highway: merge onto it, and take the exit
      const highway = [];
      if (world.highway) {
         for (const [kind, p] of [["merge", world.highway.merge], ["exit", world.highway.exit]]) {
            const i = route.points.indexOf(p);
            if (i > 0) highway.push({ index: i, at: route.cumulative[i], point: p, turn: 0, kind });
         }
      }
      return [...turns, ...rounds, ...highway].sort((a, b) => a.at - b.at);
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
         const turnOver = (reach) => {
            const a = subtract(route.points[i], route.pointAt(at - reach));
            const b = subtract(route.pointAt(at + reach), route.points[i]);
            // screen y points down, so a left turn has a negative cross product
            return Math.atan2(-(a.x * b.y - a.y * b.x), dot(a, b));
         };
         let turn = turnOver(60);
         // a road can also curve round through a junction: the way it points
         // coming in and going out (where the coach looks) shows a turn too
         const dirIn = DrivingSchool.directionAt(route, at - 130);
         const dirOut = DrivingSchool.directionAt(route, at + 150);
         const wide = Math.atan2(-(dirIn.x * dirOut.y - dirIn.y * dirOut.x), dot(dirIn, dirOut));
         if (Math.abs(turn) <= 0.6 && Math.abs(wide) > 0.7 && Math.sign(wide) == Math.sign(turn)) {
            turn = wide;
         }
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
      const { length, turns, stops, lights, crossings, roundabouts = 0 } = features;
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
         case "roundabout": // through two roundabouts or so
            return Math.min(roundabouts, 2) * 4 + near(meters, 500, 200) - lights * 0.5;
         case "drill": // quiet and straight: no lights, signs or turns in the way
            return near(meters, 500, 150) - turns - lights * 2 - stops * 2;
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
         roundabouts: (world.roundabouts || []).length ? DrivingSchool.roundaboutsOn(route, world).length : 0,
      };
   },

   // Routes a learner can follow: no hairpin turns through a junction, and
   // not ending right after a turn (the GPS would say "turn, then arrive")
   fairRoute(route, junctions) {
      const turns = DrivingSchool.turnsOf(route, junctions);
      return turns.every((t) => Math.abs(t.turn) < 2.2) &&
         (turns.length == 0 || route.length - turns[turns.length - 1].at > 200);
   },

   // Try a few destinations and keep the one whose route suits the lesson
   // (stopMarks: for the stopping drill, prefer routes with room for that many marks)
   pickTrip(sim, kind, tries = 30, stopMarks = 0) {
      // the practice highway has one trip: on-ramp to exit
      if (sim.world.highway) {
         return sim.setTrip(sim.world.highway.end) ? sim.world.highway.end : null;
      }
      let best = null;
      const junctions = DrivingSchool.junctionsOf(sim.world);
      // for roundabouts, some places just past one (few random trips go through one)
      const beyond = [];
      if (kind == "roundabout") {
         const home = sim.home.point;
         for (const rb of sim.world.roundabouts || []) {
            const out = distance(rb.center, home);
            beyond.push(...sim.world.graph.points.filter((p) => {
               const d = distance(p, rb.center);
               return d > rb.radius * 2.5 && d < 1500 && distance(p, home) > out;
            }));
         }
      }
      for (let i = 0; i < tries; i++) {
         const dest = beyond.length > 0 && i % 2 == 0
            ? beyond[Math.floor(sim.options.random() * beyond.length)]
            : sim.randomDestination();
         // (not on a roundabout: a trip doesn't end going round one)
         if (!dest || Roundabouts.isRingPoint(sim.world, dest) || !sim.setTrip(dest)) {
            continue;
         }
         const features = DrivingSchool.features(sim.trip.route, sim.world, junctions);
         // (an unfair route only if there's nothing else)
         let score = DrivingSchool.routeScore(features, kind) - (DrivingSchool.fairRoute(sim.trip.route, junctions) ? 0 : 1000);
         if (stopMarks) score += Math.min(stopMarks, Drills.stopMarksOn(sim.trip.route, sim.world, stopMarks).length) * 3;
         if (!best || score > best.score) {
            best = { dest, score };
         }
      }
      if (best) {
         sim.setTrip(best.dest);
      }
      return best ? best.dest : null;
   },

   // The route's direction at `at` (a distance along it)
   directionAt(route, at) {
      return normalize(subtract(route.pointAt(at + 10), route.pointAt(at - 10)));
   },

   // Is the route straight for `reach` each way from `at`, away from
   // junctions, crosswalks and signs (and on a two-way road, if asked)?
   // That's where a car can pull over or be parked.
   straightAt(route, world, at, reach = 90, twoWay = false) {
      const rw = world.roadWidth;
      const turnBetween = (a, b) => Math.abs(Math.atan2(a.x * b.y - a.y * b.x, dot(a, b)));
      const p = route.pointAt(at);
      const dir = DrivingSchool.directionAt(route, at);
      if (turnBetween(DrivingSchool.directionAt(route, at - reach), dir) > 0.12 ||
         turnBetween(dir, DrivingSchool.directionAt(route, at + reach)) > 0.12) {
         return false;
      }
      const seg = twoWay ? getNearestSegment(p, world.graph.segments) : null;
      if (seg && seg.oneWay) {
         return false;
      }
      const markings = world.markings.filter((m) => m instanceof Crossing || m instanceof Stop || m instanceof Light || m instanceof Yield);
      return world.intersections.every((j) => distance(j, p) > rw * 1.6) &&
         markings.every((m) => distance(m.center, p) > rw * 1.2);
   },

   // The first place from `from` back to `to` (distances along the route)
   // where straightAt holds. If there's none: the place farthest from any
   // junction, crosswalk or sign.
   findStraight(route, world, from, to, reach = 90, twoWay = false) {
      for (let at = from; at > to; at -= 20) {
         if (DrivingSchool.straightAt(route, world, at, reach, twoWay)) {
            return at;
         }
      }
      const markings = world.markings.filter((m) => m instanceof Crossing || m instanceof Stop || m instanceof Light || m instanceof Yield);
      const clearance = (at) => {
         const p = route.pointAt(at);
         return Math.min(...world.intersections.map((j) => distance(j, p)), ...markings.map((m) => distance(m.center, p)));
      };
      let best = from;
      for (let at = from; at > to; at -= 20) {
         if (clearance(at) > clearance(best)) best = at;
      }
      return best;
   },

   // A marked space by the curb, near the end of the route, on a straight
   // stretch away from junctions, crosswalks and signs (where real drivers
   // can pull over)
   parkingSpotOn(route, world) {
      const rw = world.roadWidth;
      const start = Math.max(route.length * 0.6, route.length - 120);
      const at = DrivingSchool.findStraight(route, world, start, Math.max(150, route.length * 0.4));
      const dir = DrivingSchool.directionAt(route, at);
      const center = add(route.pointAt(at), scale(perpendicular(dir), rw / 2 - 24));
      return new Parking(center, dir, 44, 90);
   },

   // A space between two parked cars at the curb, near the end of the
   // route, to parallel park in. Returns the space (a Parking marking whose
   // center is level with the parked cars, `gap` long).
   parallelSpotOn(sim, route, gap = 96) {
      const rw = sim.world.roadWidth;
      const start = Math.max(route.length * 0.55, route.length - 260);
      const end = Math.max(300, route.length * 0.35);
      // the straightest stretch there is: long and straight if possible
      let at = start;
      for (const reach of [170, 130, 95]) {
         at = DrivingSchool.findStraight(route, sim.world, start, end, reach);
         if (DrivingSchool.straightAt(route, sim.world, at, reach)) break;
      }
      const dir = DrivingSchool.directionAt(route, at);
      const side = perpendicular(dir);
      const line = add(route.pointAt(at), scale(side, rw / 2 - 22)); // where parked cars sit
      const heading = -angle(dir) - Math.PI / 2;
      const colors = ["#8f9aa6", "#b5523b", "#d9c9a3", "#3e5c76"];
      const pick = Math.floor(DrivingSchool.hash(line) * colors.length);
      for (const s of [1, -1]) {
         sim.addParked(add(line, scale(dir, s * (gap / 2 + 25))), heading, { color: colors[(pick + (s > 0 ? 0 : 2)) % colors.length] });
      }
      const spot = new Parking(line, dir, 34, gap);
      spot.parallel = true;
      return spot;
   },

   // Delivery trucks double-parked in the student's lane (hazard lights on),
   // to pass. Returns the trucks.
   addBlockers(sim, route, count = 2) {
      const trucks = [];
      for (let i = 0; i < count; i++) {
         const want = route.length * (0.3 + (0.45 * i) / Math.max(1, count - 1 || 1));
         const at = DrivingSchool.findStraight(route, sim.world, want, want - 500, 160, true);
         if (!DrivingSchool.straightAt(route, sim.world, at, 160, true) || at < 500 || at > route.length - 300) continue;
         if (trucks.some((t) => Math.abs(t.at - at) < 600)) continue;
         const dir = DrivingSchool.directionAt(route, at);
         const point = add(route.pointAt(at), scale(perpendicular(dir), sim.world.roadWidth / 4));
         const truck = sim.addParked(point, -angle(dir) - Math.PI / 2, {
            width: 34, height: 92, color: "#ece6d8", hazardLights: true,
         });
         truck.at = at;
         trucks.push(truck);
      }
      return trucks;
   },

   // An ambulance coming the other way along the student's route, siren on,
   // starting 450-1300 units ahead on a two-way street. Returns it (already
   // in the traffic), or null if the road ahead won't do (yet).
   spawnAmbulance(sim, car) {
      const route = sim.trip && sim.trip.route;
      if (!route) return null;
      const progress = route.locate(car, car.routeIndex || 0).progress;
      const unitsPerMph = 1 / DrivingCoach.MPH_PER_UNIT;
      for (let at = Math.min(progress + 1100, route.length - 50); at > progress + 450; at -= 50) {
         let i = route.points.length - 2;
         while (i > 0 && route.cumulative[i] > at) i--;
         const from = route.points[i + 1];
         const to = route.points[i];
         const edge = sim.network.edges.find((e) => e.from == from && e.to == to);
         if (!edge) continue; // a one-way street
         const t = 1 - (at - route.cumulative[i]) / Math.max(1, route.cumulative[i + 1] - route.cumulative[i]);
         const ambulance = new EmergencyVehicle(sim.network, edge, Math.max(0, Math.min(1, t)), 38 * unitsPerMph);
         ambulance.plan = route.points.slice(0, i).reverse(); // back along the route, past the student
         sim.traffic.push(ambulance);
         sim.world.traffic = sim.traffic;
         return ambulance;
      }
      // one-way streets: it comes up from behind instead, and passes
      for (let at = progress - 600; at > progress - 1200 && at > 0; at -= 50) {
         let i = route.points.length - 2;
         while (i > 0 && route.cumulative[i] > at) i--;
         const edge = sim.network.edges.find((e) => e.from == route.points[i] && e.to == route.points[i + 1]);
         if (!edge) continue;
         const t = (at - route.cumulative[i]) / Math.max(1, route.cumulative[i + 1] - route.cumulative[i]);
         const ambulance = new EmergencyVehicle(sim.network, edge, Math.max(0, Math.min(1, t)), 38 * unitsPerMph);
         ambulance.plan = route.points.slice(i + 2);
         sim.traffic.push(ambulance);
         sim.world.traffic = sim.traffic;
         return ambulance;
      }
      return null;
   },

   // A school zone on part of the route (limit 15 mph), with a crosswalk in
   // the middle if there isn't one. Returns { zone, crossing (added, or null) }.
   schoolZoneOn(route, world, limit = 15) {
      const length = Math.min(900, route.length * 0.4);
      const from = Math.max(250, route.length * 0.3);
      const to = Math.min(route.length - 150, from + length);
      const points = [route.pointAt(from)];
      for (let i = 0; i < route.points.length; i++) {
         if (route.cumulative[i] > from && route.cumulative[i] < to) points.push(route.points[i]);
      }
      points.push(route.pointAt(to));
      const zone = { route: new Route(points), limit, kind: "school", from, to };
      const inZone = world.markings.some((m) => m instanceof Crossing && zone.route.locate(m.center, 0, points.length).distance < world.roadWidth / 2 + 10);
      let crossing = null;
      if (!inZone) {
         const mid = DrivingSchool.findStraight(route, world, (from + to) / 2, from + 100, 60);
         const dir = DrivingSchool.directionAt(route, mid);
         crossing = new Crossing(route.pointAt(mid), dir, world.roadWidth, world.roadWidth / 2);
      }
      return { zone, crossing };
   },


   // A lesson's extras, after sim.startGeneration(): a school zone (with a
   // crosswalk if it needs one), delivery trucks to pass, a parking space,
   // a drill's marks or lead car, the highway's slow trucks. Returns the zones
   // (for the coach), the markings added (to take away afterwards) and the rest.
   setUpLesson(sim, lesson) {
      const route = sim.trip.route;
      const zones = [];
      const added = [];
      if (lesson.schoolZone) {
         const { zone, crossing } = DrivingSchool.schoolZoneOn(route, sim.world);
         zones.push(zone);
         if (crossing) {
            sim.world.markings.push(crossing);
            added.push(crossing);
            if (sim.crowd) {
               sim.crowd.crossings.push(crossing);
               sim.crowd.route = null; // so it sees the new crosswalk on the route
            }
         }
      }
      if (lesson.blockers) {
         DrivingSchool.addBlockers(sim, route, lesson.blockers);
      }
      const spot = lesson.parallel ? DrivingSchool.parallelSpotOn(sim, route)
         : lesson.pullover ? DrivingSchool.parkingSpotOn(route, sim.world) : null;
      // drills: lines to stop on, a car to follow
      const marks = lesson.stopMarks ? Drills.stopMarksOn(route, sim.world, lesson.stopMarks) : [];
      const lead = lesson.leadCar ? Drills.spawnLeadCar(sim, sim.cars[0]) : null;
      // the highway: slow trucks to pass (40 mph)
      const trucks = lesson.highway && sim.world.highway ? HighwayCourse.addSlowTrucks(sim, 40 / DrivingCoach.MPH_PER_UNIT) : [];
      return { zones, added, spot, marks, lead, trucks };
   },

   // How a student's car handles: gentle like a real car, a little faster
   // than the limit at most, and with less grip on wet roads
   setUpStudentCar(car, lesson) {
      const unitsPerMph = 1 / DrivingCoach.MPH_PER_UNIT;
      car.color = "#2457f5";
      car.acceleration = 0.025;
      car.friction = 0.008;
      car.brakePower = 0.05;
      car.maxSpeed = (lesson.speedLimit + 20) * unitsPerMph;
      car.speedSteering = true;
      car.turnRate = 0.032;
      if (lesson.conditions && lesson.conditions.rain) {
         car.brakePower = 0.032; // wet road: brakes grip less
         car.friction = 0.006;
      }
      return car;
   },

   // A copy of `world` (with its signs and signals) where a few junctions near
   // the start are roundabouts, for the roundabout lesson. Returns null if
   // none would fit.
   roundaboutWorld(world) {
      const info = JSON.parse(JSON.stringify(world.toJSON()));
      if (Roundabouts.build(info, { near: Simulation.findStart(world).point }) == 0) {
         return null;
      }
      const copy = World.load(info);
      copy.lightTiming = world.lightTiming;
      DrivingSchool.addTrafficControls(copy);
      return copy;
   },

   // The next instruction for a driver at `progress` along the route
   // (turns: from directionsOf, or turnsOf)
   nextInstruction(route, progress, turns = DrivingSchool.turnsOf(route)) {
      const next = turns.find((t) => (t.roundabout ? t.exitAt : t.at) > progress - 20);
      const toEnd = route.length - progress;
      if (!next) {
         return { kind: "arrive", distance: toEnd };
      }
      if (next.kind) {
         return { kind: next.kind, distance: Math.max(0, next.at - progress) };
      }
      if (next.roundabout) {
         const inside = progress > next.at - 20;
         return { kind: "roundabout", exit: next.exit, inside, distance: Math.max(0, (inside ? next.exitAt : next.at) - progress) };
      }
      const sharp = Math.abs(next.turn) > 2.4;
      return {
         kind: sharp ? "uturn" : next.turn > 0 ? "left" : "right",
         distance: Math.max(0, next.at - progress),
      };
   },
};
