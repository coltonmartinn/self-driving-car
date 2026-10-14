// People on foot who use the crosswalks: they wait at the curb, look for a
// gap, then walk across. Drivers (and traffic) must let them finish.
class Pedestrian {
   static SHIRTS = ["#e8554e", "#f2a541", "#4fb0c6", "#7bc67e", "#9b6ad6", "#f06aa8", "#3b6fd8", "#efe6d2"];
   static SKIN = ["#f1c7a5", "#d9a47a", "#a9714b", "#7a4b2e", "#5a3720"];

   constructor(crossing, side, random = Math.random) {
      this.crossing = crossing;
      this.side = side; // +1 or -1: which curb they start from
      this.t = 0; // 0 = start curb, 1 = other curb
      this.state = "waiting"; // waiting | crossing | done
      this.wait = 40 + Math.floor(random() * 140); // frames before looking for a gap
      this.speed = 0.22 + random() * 0.08; // ~1.3-1.8 m/s
      this.shirt = Pedestrian.SHIRTS[Math.floor(random() * Pedestrian.SHIRTS.length)];
      this.skin = Pedestrian.SKIN[Math.floor(random() * Pedestrian.SKIN.length)];
      this.isPedestrian = true;
      this.jaywalking = false; // crossing away from a crosswalk (a Driving School hazard)
      this.blockedBy = null; // a stopped car in their way, that they're waiting on
      this.x = 0;
      this.y = 0;
      this.polygon = [];
      this.#place();
   }

   // the walking line across the road, a little past each curb
   get ends() {
      const c = this.crossing;
      const across = perpendicular(c.directionVector);
      const half = c.width / 2 + 18;
      return [add(c.center, scale(across, half * this.side)), add(c.center, scale(across, -half * this.side))];
   }

   // on the road surface (not on the sidewalk)?
   get onRoad() {
      const c = this.crossing;
      const lateral = Math.abs(dot(subtract(this, c.center), perpendicular(c.directionVector)));
      return this.state == "crossing" && lateral < c.width / 2 + 4;
   }

   // cars: everything that could hit them
   update(cars) {
      if (this.state == "waiting") {
         if (--this.wait <= 0 && this.#gapIsSafe(cars)) {
            this.state = "crossing";
         }
      } else if (this.state == "crossing") {
         const [a, b] = this.ends;
         const length = distance(a, b);
         // nobody walks into the side of a car: they wait for it to move on
         // (and it shouldn't wait for them). Only a car driving into
         // someone hits them.
         const ahead = lerp2D(a, b, Math.min(1, this.t + 22 / length));
         const r = 10;
         const step = [
            { x: ahead.x - r, y: ahead.y - r }, { x: ahead.x + r, y: ahead.y - r },
            { x: ahead.x + r, y: ahead.y + r }, { x: ahead.x - r, y: ahead.y + r },
         ];
         this.blockedBy = cars.find((c) =>
            c.polygon && Math.abs(c.x - ahead.x) < 80 && Math.abs(c.y - ahead.y) < 80 &&
            polysIntersect(step, c.polygon)
         ) || null;
         if (!this.blockedBy) {
            this.t = Math.min(1, this.t + this.speed / length);
         }
         if (this.t >= 1) {
            this.state = "done";
         }
      }
      this.#place();
   }

   // don't step out right in front of a car that couldn't stop; a car
   // that has stopped short of the crosswalk is waiting for us, so go
   #gapIsSafe(cars) {
      const c = this.crossing;
      for (const car of cars) {
         const d = distance(car, c.center);
         const stopped = Math.abs(car.speed) < 0.1 && d > c.height / 2 + car.height / 2;
         if (stopped) continue;
         if (d < 90 || (d < 240 && Math.abs(car.speed) > 0.6)) {
            return false;
         }
      }
      return true;
   }

   #place() {
      const [a, b] = this.ends;
      const p = lerp2D(a, b, this.t);
      this.x = p.x;
      this.y = p.y;
      const r = 12;
      this.polygon = [
         { x: p.x - r, y: p.y - r }, { x: p.x + r, y: p.y - r },
         { x: p.x + r, y: p.y + r }, { x: p.x - r, y: p.y + r },
      ];
   }

   draw(ctx) {
      const [a, b] = this.ends;
      const dir = normalize(subtract(b, a));
      const side = perpendicular(dir);
      const swing = this.state == "crossing" ? Math.sin(this.t * 60) * 5 : 0;
      // legs/arms swing while walking: two small feet
      for (const s of [-1, 1]) {
         const foot = add(add(this, scale(side, 7 * s)), scale(dir, swing * s));
         ctx.beginPath();
         ctx.fillStyle = "#2b2b2b";
         ctx.arc(foot.x, foot.y, 4, 0, Math.PI * 2);
         ctx.fill();
      }
      ctx.beginPath();
      ctx.fillStyle = "rgba(0,0,0,0.25)";
      ctx.ellipse(this.x + 4, this.y + 5, 15, 11, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.fillStyle = this.shirt;
      ctx.strokeStyle = "rgba(255,255,255,0.9)";
      ctx.lineWidth = 2.5;
      ctx.arc(this.x, this.y, 14, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.fillStyle = this.skin;
      ctx.arc(this.x, this.y, 7.5, 0, Math.PI * 2);
      ctx.fill();
   }
}

// Spawns pedestrians at crosswalks near where the action is
class Crowd {
   constructor(world, { max = 10, random = Math.random } = {}) {
      this.world = world;
      this.max = max;
      this.random = random;
      this.crossings = world.markings.filter((m) => m instanceof Crossing);
      this.people = [];
      this.frame = 0;
      this.route = null;
      this.onRoute = []; // crossings on the current route
   }

   // focus: the point to keep people near (the student's car)
   // route: if given, people mostly appear at crosswalks along it
   update(focus, cars, route = null) {
      if (route != this.route) {
         this.route = route;
         this.onRoute = route
            ? this.crossings.filter((c) => route.locate(c.center, 0, route.points.length).distance < this.world.roadWidth / 2 + 10)
            : [];
      }
      const preferred = this.onRoute.length > 0 ? this.onRoute : null;
      this.frame++;
      for (const person of this.people) {
         person.update(cars);
      }
      this.people = this.people.filter((p) => p.state != "done" && distance(p, focus) < 2000);

      if (this.frame % 45 == 0 && this.people.length < this.max) {
         const near = (list) => list.filter((c) => {
            const d = distance(c.center, focus);
            return d > 250 && d < 1100 && !this.people.some((p) => p.crossing == c);
         });
         const pool = preferred && this.random() < 0.7 ? near(preferred) : near(this.crossings);
         if (pool.length > 0) {
            const crossing = pool[Math.floor(this.random() * pool.length)];
            this.people.push(new Pedestrian(crossing, this.random() < 0.5 ? 1 : -1, this.random));
         }
      }
   }

   draw(ctx) {
      for (const person of this.people) {
         person.draw(ctx);
      }
   }
}
