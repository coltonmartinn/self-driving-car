// Short drills, for one skill at a time: stopping on a mark, and keeping a
// steady gap behind a car that speeds up and slows down. Pure logic (no
// drawing), tested in Node; the coach judges them.
const Drills = {
   // `count` marks to stop on, painted across the student's lane on straight
   // stretches of the route, well apart. [{ at, center, dir }]: at = distance
   // along the route, center = the middle of the line in the right lane.
   stopMarksOn(route, world, count = 3) {
      const rw = world.roadWidth;
      const marks = [];
      // straight there and for a run-up before it, away from junctions and signs
      for (let at = 450; at < route.length - 200 && marks.length < count; at += 40) {
         if (marks.some((m) => at - m.at < 650)) continue;
         if (!DrivingSchool.straightAt(route, world, at, 120) || !DrivingSchool.straightAt(route, world, at - 160, 120)) continue;
         const dir = DrivingSchool.directionAt(route, at);
         const seg = getNearestSegment(route.pointAt(at), world.graph.segments);
         const lane = seg && seg.oneWay ? 0 : rw / 4;
         marks.push({ at, center: add(route.pointAt(at), scale(perpendicular(dir), lane)), dir, width: rw / 2 - 6 });
      }
      return marks;
   },

   // How far the front of a car is from a mark's line: + before it, - past it
   distanceToMark(car, mark) {
      return dot(subtract(mark.center, car), mark.dir) - car.height / 2;
   },

   // A car on the route ahead of the student, in their lane, for them to
   // follow (it drives the route, then wanders on)
   spawnLeadCar(sim, car, ahead = 260) {
      const route = sim.trip.route;
      const start = route.locate(car, 0).progress + ahead;
      let i = 0;
      while (i < route.points.length - 2 && route.cumulative[i + 1] < start) i++;
      const edge = sim.network.edges.find((e) => e.from == route.points[i] && e.to == route.points[i + 1]);
      if (!edge) return null;
      const t = (start - route.cumulative[i]) / Math.max(1, route.cumulative[i + 1] - route.cumulative[i]);
      const lead = new TrafficCar(sim.network, edge, Math.max(0, Math.min(0.95, t)));
      lead.color = "#f2a541";
      lead.plan = route.points.slice(i + 2);
      lead.isLead = true;
      lead.keep = true;
      sim.traffic.push(lead);
      sim.world.traffic = sim.traffic;
      return lead;
   },

   // The lead car's top speed, as a share of the limit (under it, so a
   // student who falls back can always catch up)
   LEAD_PACE: 0.75,

   // The lead car's speed over time: cruising, slowing, speeding up again,
   // so the gap keeps changing (frame: frames since the start; limit: units
   // per frame)
   paceLead(lead, frame, limit) {
      const cycle = [1, 0.95, 0.6, 0.6, 0.85, 1, 0.75, 0.5, 0.9]; // 4 s each
      const step = Math.floor(frame / 240) % cycle.length;
      lead.cruiseSpeed = limit * cycle[step];
   },
};
