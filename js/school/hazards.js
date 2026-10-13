// Surprises that test a driver's attention: the car ahead brakes hard, or
// someone runs into the road. Measures how quickly the driver reacts
// (time from the hazard appearing until they press the brake).
class Hazards {
   // first: frames before the first hazard; gap: [min, max] frames between them
   constructor(sim, { random = Math.random, first = 360, gap = [480, 840] } = {}) {
      this.sim = sim;
      this.random = random;
      this.gap = gap;
      this.frame = 0;
      this.next = first;
      this.active = null; // { kind, start, reaction, until, person, car }
      this.results = []; // { kind, reaction (s or null), handled }
   }

   get averageReaction() {
      const times = this.results.map((r) => r.reaction).filter((t) => t != null);
      return times.length ? times.reduce((a, b) => a + b, 0) / times.length : null;
   }

   // Returns "start" or "done" (with details) when something happens
   update(car) {
      this.frame++;
      if (this.active) {
         return this.#track(car);
      }
      if (this.frame < this.next || car.damaged || car.arrived || car.speed < 1 || !this.sim.trip) {
         return null;
      }
      const started = (this.results.length % 2 == 0 && this.#leadCarBrakes(car)) || this.#personRunsOut(car) ||
         this.#leadCarBrakes(car);
      if (!started) {
         this.next = this.frame + 60; // try again shortly
         return null;
      }
      return { type: "start", kind: this.active.kind };
   }

   #track(car) {
      const a = this.active;
      if (a.reaction == null && car.controls.reverse && car.speed > 0) {
         a.reaction = (this.frame - a.start) / 60;
      }
      const over = car.damaged || this.frame > a.until ||
         (a.person && a.person.state == "done");
      if (!over) {
         return null;
      }
      const result = { kind: a.kind, reaction: a.reaction, handled: !car.damaged };
      this.results.push(result);
      this.active = null;
      this.next = this.frame + this.gap[0] + Math.floor(this.random() * (this.gap[1] - this.gap[0]));
      return { type: "done", ...result };
   }

   // The nearest car ahead in our lane slams on its brakes
   #leadCarBrakes(car) {
      const heading = new Point(-Math.sin(car.angle), -Math.cos(car.angle));
      let lead = null;
      let best = Infinity;
      for (const t of this.sim.traffic) {
         const rel = subtract(t, car);
         const along = dot(rel, heading);
         const lateral = Math.abs(rel.x * heading.y - rel.y * heading.x);
         const sameWay = dot(heading, new Point(-Math.sin(t.angle), -Math.cos(t.angle))) > 0.8;
         if (along > 100 && along < 400 && lateral < 30 && sameWay && t.speed > 0.8 && along < best) {
            lead = t;
            best = along;
         }
      }
      if (!lead) return false;
      lead.hazardBrake = 150; // 2.5 s stopped, then it drives on
      this.active = { kind: "brake", start: this.frame, reaction: null, until: this.frame + 240, car: lead };
      return true;
   }

   // Someone runs across the road ahead, away from any crosswalk
   #personRunsOut(car) {
      const sim = this.sim;
      if (!sim.crowd) return false;
      const route = sim.trip.route;
      const ahead = 150 + car.speed * 50; // about 2 seconds away
      if (car.fitness + ahead + 100 > route.length) return false;
      const center = route.pointAt(car.fitness + ahead);
      const dir = normalize(subtract(route.pointAt(car.fitness + ahead + 10), route.pointAt(car.fitness + ahead - 10)));
      // not in a junction, where the road shape is unclear
      if (sim.world.intersections.some((p) => distance(p, center) < sim.world.roadWidth * 1.5)) return false;
      const spot = new Crossing(center, dir, sim.world.roadWidth, sim.world.roadWidth / 2);
      const person = new Pedestrian(spot, this.random() < 0.5 ? 1 : -1, this.random);
      person.state = "crossing";
      person.speed = 0.5; // running
      person.jaywalking = true;
      sim.crowd.people.push(person);
      this.active = { kind: "person", start: this.frame, reaction: null, until: this.frame + 600, person };
      return true;
   }
}
