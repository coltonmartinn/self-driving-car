// A careful driver for "Show me" demo drives: it drives a lesson by itself
// and says what it's doing and why, like an instructor thinking out loud.
// It only uses what a student can see (the route, signs and lights, other
// cars and people). Pure logic, so whole lessons are tested in Node.
class Autopilot {
   // controls: the car's controls to press. turns: DrivingSchool.turnsOf(route)
   constructor({ sim, car, coach, controls, lesson, parkingSpot = null }) {
      this.sim = sim;
      this.car = car;
      this.coach = coach;
      this.controls = controls;
      this.lesson = lesson;
      this.parkingSpot = parkingSpot;
      this.world = sim.world;
      this.frame = 0;
      this.served = new Set(); // stop signs we've already stopped at
      this.stopWait = 0;
      this.said = new Map(); // what -> frame, so each thing is said once
      this.waitedAtRed = null;
   }

   heading() {
      return new Point(-Math.sin(this.car.angle), -Math.cos(this.car.angle));
   }

   // An instructor's line, the first time `key` comes up (or again after `again` frames)
   #say(key, title, tip = "", again = Infinity) {
      const last = this.said.get(key);
      if (last != null && this.frame - last < again) return null;
      this.said.set(key, this.frame);
      return { severity: "demo", rule: "demo", title, tip };
   }

   // Drive one frame. Returns what the driver says now (or null).
   update(turns) {
      this.frame++;
      const car = this.car;
      const controls = this.controls;
      if (car.damaged || car.arrived || !this.sim.trip) {
         controls.forward = controls.left = controls.right = false;
         controls.reverse = false;
         return null;
      }
      const lines = [];
      const say = (...args) => {
         const line = this.#say(...args);
         if (line) lines.push(line);
      };
      const rw = this.world.roadWidth;
      const mph = DrivingCoach.MPH_PER_UNIT;
      const route = this.sim.trip.route;
      const loc = route.locate(car, car.routeIndex || 0);
      const heading = this.heading();
      if (this.frame == 1) {
         say("start", "Easing onto the gas", "Smooth and steady. I'll keep just under " + this.lesson.speedLimit + " mph.");
      }

      // steer for a point ahead, in the right-hand lane. If that point is
      // inside the tightest circle the car can turn, it would just circle
      // around it, so look further ahead until it isn't.
      const aimAt = (look) => {
         const at = Math.max(20, Math.min(loc.progress + look, route.length));
         const p = route.pointAt(at);
         const d = normalize(subtract(p, route.pointAt(at - 20)));
         return { p, d, point: add(p, scale(perpendicular(d), rw / 4)) };
      };
      let look = 70 + Math.abs(car.speed) * 15;
      let ahead = aimAt(look);
      const radius = 1 / 0.025 + 4; // see Car: the slowest steering is speed * 0.025 per frame
      const right = perpendicular(heading);
      while (look < 200 && [1, -1].some((side) => distance(ahead.point, add(car, scale(right, radius * side))) < radius)) {
         look += 20;
         ahead = aimAt(look);
      }
      const p1 = ahead.p;
      const dir = ahead.d;
      let aim = ahead.point;
      let target = (this.lesson.speedLimit - 3) / mph;
      this.why = "cruise"; // what's holding the speed down (for tests and debugging)
      const limit = (value, why) => {
         if (value < target) this.why = why;
         return Math.min(target, value);
      };

      // pulling over: signal, then ease to the curb inside the space
      let parkTarget = null;
      if (this.parkingSpot) {
         // how far along the route (a straight line could point anywhere)
         if (this.spotRoute != route) {
            this.spotRoute = route;
            this.spotAt = route.locate(this.parkingSpot.center, 0, route.points.length).progress;
         }
         const toSpot = this.spotAt - loc.progress; // from the middle of the car
         if (toSpot < 380) {
            controls.signal = "right";
            say("park", "Pulling over: signal right, check behind", "Then slow down gradually and ease toward the curb.");
            const curb = rw / 2 - 24;
            const t = toSpot < 220 ? 1 : 1 - (toSpot - 220) / 160;
            aim = add(p1, scale(perpendicular(dir), rw / 4 + (curb - rw / 4) * t));
            parkTarget = Math.max(0, toSpot - 4) / 90;
            if (toSpot < 60) say("park2", "Stopping inside the space", "Parallel to the curb, close but not touching.");
         }
      }

      const desired = -angle(subtract(aim, car)) - Math.PI / 2;
      let steer = desired - car.angle;
      steer = Math.atan2(Math.sin(steer), Math.cos(steer));

      // turns: signal early, slow down before the corner
      const next = turns.find((t) => t.at > loc.progress - 10);
      if (next && next.at - loc.progress < 200) target = limit(1.1, "turn");
      if (Math.abs(steer) > 0.35) target = limit(0.9, "steering");
      // bends in the road (not just turns at junctions): slow down before them
      const bend = this.#bendAhead(route, loc.progress);
      if (bend > 0.5) target = limit(bend > 1 ? 0.9 : 1.2, "bend");
      if (next && next.at - loc.progress < 350 && Math.abs(next.turn) < 2.4 && !parkTarget) {
         const side = next.turn > 0 ? "left" : "right";
         controls.signal = side;
         say(next, "Signaling " + side + " for the turn", "About 100 feet before the corner, and slowing down before it, not in it.");
      }

      // signs and signals
      for (const m of this.coach.controls) {
         const gap = this.coach.lineDistance(m);
         if (gap == null || gap < 0 || gap > 220) continue;
         if (m instanceof Stop && !this.served.has(m)) {
            say(m, "Stop sign ahead: braking early", "So the car stops smoothly, behind the white line.");
            target = limit(gap < 12 ? 0 : gap / 60, "stop sign");
            if (gap < 25 && Math.abs(car.speed) < 0.05) {
               if (++this.stopWait == 1) {
                  say("stopped" + this.served.size, "Full stop. One-thousand-one…", "Looking left, right, and left again before going.");
               }
               if (this.stopWait > 50 && this.#junctionClear()) {
                  this.served.add(m);
                  this.stopWait = 0;
               }
            }
         }
         if (m instanceof Light) {
            // on yellow, stop if there's room to stop comfortably
            const canStop = gap > (car.speed * car.speed) / (2 * 0.03) + 10;
            if (m.state == "red" || (m.state == "yellow" && canStop)) {
               say(m.state + this.#key(m), m.state == "red" ? "Red light: stopping behind the line" : "Yellow, with room to stop: stopping",
                  m.state == "red" ? "And waiting for green." : "Yellow means stop if you safely can.", 300);
               target = limit(gap < 12 ? 0 : gap / 60, "light");
               if (Math.abs(car.speed) < 0.05) this.waitedAtRed = m;
            } else if (this.waitedAtRed == m && m.state == "green") {
               say("green" + this.#key(m), "Green, and the way is clear: go", "Even on green, check that nobody is running the red.");
               this.waitedAtRed = null;
            }
         }
      }

      // people: wait for anyone crossing, and stop for anyone in the road
      const people = this.sim.crowd ? this.sim.crowd.people : [];
      for (const m of this.coach.crossings) {
         const gap = this.coach.crosswalkDistance(m);
         if (gap == null || gap < -5 || gap > 200) continue;
         if (people.some((p) => p.crossing == m && p.blockedBy != car && (p.onRoad || (p.state == "waiting" && p.wait < 30)))) {
            say(m, "Someone's crossing: stopping before the crosswalk", "And waiting until they're all the way across.", 600);
            target = limit(gap < 15 ? 0 : gap / 70, "crosswalk");
         }
      }
      for (const p of people) {
         if (p.state != "crossing" || p.blockedBy == car) continue; // waiting for us to move on
         const rel = subtract(p, car);
         const along = dot(rel, heading);
         // anyone in the road near our path, and anyone at all right in front of us
         const lateral = Math.abs(rel.x * heading.y - rel.y * heading.x);
         if (along > 0 && along < 260 && lateral < (p.onRoad ? 70 : 40)) {
            if (p.jaywalking) say(p, "Someone ran into the road! Braking", "This is why you scan the sidewalks, not just the car ahead.");
            target = limit(Math.max(0, (along - 60) / 80), "person");
         }
      }

      // other cars: keep a safe gap, and never drive into someone's path
      for (const t of this.sim.traffic) {
         const rel = subtract(t, car);
         const along = dot(rel, heading);
         const lateral = Math.abs(rel.x * heading.y - rel.y * heading.x);
         if (along > 0 && along < 350 && lateral < 30) {
            // the lesson's following distance (2 s, or 3 at night), plus a margin
            const safe = Math.max(0, (along - 80) / (60 * (this.coach.followSeconds + 0.5)));
            if (safe < target) {
               target = limit(safe, "car ahead");
               if (t.controls.reverse && t.hazardBrake > 0) {
                  say(t, "Brake lights ahead! Braking right away", "A safe following distance is what gives you time to stop.");
               } else if (along < 300 && car.speed > 0.8) {
                  say("follow", "Keeping " + this.coach.followSeconds + "+ seconds behind this car",
                     "Count: one-thousand-one, one-thousand-two" + (this.coach.followSeconds > 2 ? ", one-thousand-three." : "."), 1800);
               }
            }
         }
      }
      if (this.#conflictAhead()) target = limit(0, "cross traffic");
      if (parkTarget != null) target = limit(parkTarget, "parking");

      controls.left = steer > 0.03;
      controls.right = steer < -0.03;
      controls.forward = car.speed < target - 0.03;
      controls.reverse = car.speed > target + 0.08;
      return lines[0] || null;
   }

   // How far the road ahead turns from where the car is pointing (radians)
   #bendAhead(route, progress) {
      let most = 0;
      const dirAt = (at) => normalize(subtract(route.pointAt(at), route.pointAt(at - 20)));
      const now = this.heading();
      for (let at = progress + 30; at < Math.min(progress + 220, route.length); at += 30) {
         const d = dirAt(at);
         most = Math.max(most, Math.abs(Math.atan2(now.x * d.y - now.y * d.x, dot(now, d))));
      }
      return most;
   }

   #key(m) {
      if (!this.ids) this.ids = new Map();
      if (!this.ids.has(m)) this.ids.set(m, this.ids.size);
      return ":" + this.ids.get(m);
   }

   // Would a car crossing our path reach us in the next second or so?
   #conflictAhead() {
      const car = this.car;
      const heading = this.heading();
      for (const t of this.sim.traffic) {
         if (Math.abs(t.x - car.x) > 260 || Math.abs(t.y - car.y) > 260) continue;
         const theirs = new Point(-Math.sin(t.angle), -Math.cos(t.angle));
         if (dot(theirs, heading) > 0.7) continue; // same way: the gap rule handles it
         for (let s = 10; s <= 70; s += 10) {
            const me = add(car, scale(heading, Math.max(car.speed, 0.8) * s + 30));
            const them = add(t, scale(theirs, t.speed * s));
            if (distance(me, them) < 45) return true;
         }
      }
      return false;
   }

   // Nobody coming through the junction ahead (after a stop sign)
   #junctionClear() {
      const car = this.car;
      const heading = this.heading();
      return this.sim.traffic.every((t) => {
         const d = distance(t, car);
         if (d > 300 || t.speed < 0.3) return true;
         const theirs = new Point(-Math.sin(t.angle), -Math.cos(t.angle));
         const towards = dot(subtract(car, t), theirs) > 0;
         return !towards || dot(theirs, heading) > 0.7 || d > 250;
      });
   }
}
