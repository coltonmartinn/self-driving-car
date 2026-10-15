// A careful driver for "Show me" demo drives: it drives a lesson by itself
// and says what it's doing and why, like an instructor thinking out loud.
// It only uses what a student can see (the route, signs and lights, other
// cars and people). Pure logic, so whole lessons are tested in Node.
class Autopilot {
   // controls: the car's controls to press. turns: DrivingSchool.directionsOf(route, world)
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
      this.queue = []; // lines waiting to be said (one at a time)
      this.waitedAtRed = null;
      this.passing = null; // a parked truck we're driving around
      this.yielding = null; // an ambulance we've pulled over for
   }

   // A glance over the shoulder (once per maneuver)
   #look(side, key) {
      if (this.looked != key && this.controls.lookOver) {
         this.looked = key;
         this.controls.lookOver(side, true);
      }
   }

   heading() {
      return new Point(-Math.sin(this.car.angle), -Math.cos(this.car.angle));
   }

   // An instructor's line, the first time `key` comes up (or again after `again` frames)
   // (title and tip can hold {names} filled from vars, so they translate)
   #say(key, title, tip = "", again = Infinity, vars = null) {
      const last = this.said.get(key);
      if (last != null && this.frame - last < again) return null;
      this.said.set(key, this.frame);
      return { severity: "demo", rule: "demo", title, tip, vars };
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
      if (this.parkingSpot && this.parkingSpot.parallel) {
         const spot = this.parkingSpot;
         const ahead = dot(subtract(spot.center, car), spot.directionVector);
         if (this.parking || (ahead < 330 && ahead > -60 && distance(spot.center, car) < 400)) {
            const line = this.#parallelPark(spot);
            if (line) lines.push(line);
            this.queue.push(...lines);
            return this.#next();
         }
      }
      if (this.frame == 1) {
         say("start", "Easing onto the gas", "Smooth and steady. I'll keep just under {limit} mph.", Infinity, { limit: this.lesson.speedLimit });
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
            this.#look("right", "park");
            say("park", "Pulling over: signal right, look over my right shoulder", "Then slow down gradually and ease toward the curb.");
            const curb = rw / 2 - 24;
            const t = toSpot < 220 ? 1 : 1 - (toSpot - 220) / 160;
            aim = add(p1, scale(perpendicular(dir), rw / 4 + (curb - rw / 4) * t));
            parkTarget = Math.max(0, toSpot - 4) / 90;
            if (toSpot < 150) this.#look("right", "park-again"); // one more check right before moving over
            if (toSpot < 60) say("park2", "Stopping inside the space", "Parallel to the curb, close but not touching.");
         }
      }

      // a school zone ahead: slow to its limit before reaching it
      const zone = this.coach.zoneAt(car) || this.coach.zoneAt(route.pointAt(loc.progress + 160));
      if (zone) {
         target = limit((zone.limit - 2) / mph, "school zone");
         say(zone, "School zone: slowing to {limit} mph", "Children could step out from anywhere. Eyes on the sidewalks.", Infinity, { limit: zone.limit });
      }

      // a truck parked in our lane: wait for a gap, then go around it
      const offsetFor = (lateral) => add(p1, scale(perpendicular(dir), lateral));
      const blocker = this.passing || this.#blockerAhead(route, loc.progress);
      if (blocker) {
         const along = dot(subtract(blocker, car), heading);
         if (this.passing && along < -blocker.height / 2 - 55) {
            say("back" + this.#key(blocker), "Past it: signal right, back into my lane", "And off goes the signal once I'm back.");
            controls.signal = "right";
            this.passing = null;
            this.returning = 50;
         } else if (this.passing) {
            aim = offsetFor(-rw / 4);
            target = limit(1.4, "passing");
            if (along < -10) controls.signal = "right";
         } else if (along < 330) {
            say(blocker, "A truck is blocking our lane", "We'll go around it, but only when the other lane is clear.");
            controls.signal = "left";
            this.#look("left", blocker);
            if (this.#otherLaneClear(blocker)) {
               this.#look("left", "go" + this.#key(blocker)); // one more look, right before pulling out
               if (!this.passing) say("go" + this.#key(blocker), "Signaled, blind spot checked, lane's clear: going around", "Not too fast, and leave room beside the truck.");
               this.passing = blocker;
            } else {
               say("wait" + this.#key(blocker), "Oncoming car: waiting behind the truck", "Passing means using their lane. Never squeeze in front of them.", 600);
               // (far enough back to pull out around it without clipping its corner)
               target = limit(Math.max(0, (along - blocker.height / 2 - 110) / 80), "truck ahead");
            }
         }
      }
      if (this.returning > 0 && --this.returning == 0 && controls.signal == "right") controls.signal = null;

      // an ambulance with its siren on: pull over to the right and stop
      // (and wait until it's well past before pulling out again)
      const siren = this.sim.traffic.find((t) => t.siren && distance(t, car) < 800 &&
         dot(subtract(car, t), new Point(-Math.sin(t.angle), -Math.cos(t.angle))) > -200);
      if (siren) {
         this.yielding = siren;
         say(siren, "Siren! Pulling over to the right and stopping", "Check the blind spot, signal right, then stop near the curb.");
         controls.signal = "right";
         this.#look("right", siren);
         aim = offsetFor(rw / 2 - 21);
         // creep over to the curb, unless we're at an intersection: then just stop
         const offset = this.coach.laneOffset();
         const atCurb = offset == null || offset > rw / 2 - 30 || this.coach.nearJunction(rw * 2.2);
         // (if it's already close, stopping right away is safest)
         target = limit(atCurb || distance(siren, car) < 260 ? 0 : 1.1, "ambulance");
      } else if (this.yielding) {
         say("gone" + this.#key(this.yielding), "It's gone by: signal left, check, and back into the lane", "Watch for other drivers doing the same.");
         controls.signal = null;
         this.yielding = null;
      }

      // roundabouts: slow down, yield to cars coming round, keep to the
      // middle of the ring, and signal before the exit
      const round = turns.find((t) => t.roundabout && t.exitAt > loc.progress - 40);
      if (round) {
         const toEntry = round.at - loc.progress;
         if (toEntry < 450) {
            say(round, "Roundabout ahead: slowing down and looking left", "Cars already in it go first. We're taking exit {exit}.", Infinity, { exit: round.exit });
            target = limit(1.1, "roundabout");
         }
         if (toEntry < 150 && distance(p1, round.roundabout.center) < round.roundabout.radius + rw / 2) {
            aim = p1; // the ring is one-way: drive down its middle, like everyone else
         }
         if (toEntry < 0) {
            say("in" + this.#key(round), "Going counterclockwise, island on our left", "And no stopping in the roundabout unless we have to.");
         }
         if (round.exitAt - loc.progress < 170 && loc.progress < round.exitAt + 40) {
            controls.signal = "right";
            say("out" + this.#key(round), "Our exit is next: signaling right", "So drivers waiting to come in know we're leaving.");
         }
      }

      const desired = -angle(subtract(aim, car)) - Math.PI / 2;
      let steer = desired - car.angle;
      steer = Math.atan2(Math.sin(steer), Math.cos(steer));

      // turns: signal early, slow down before the corner
      const next = turns.find((t) => !t.roundabout && t.at > loc.progress - 10);
      if (next && next.at - loc.progress < 200) target = limit(1.1, "turn");
      if (Math.abs(steer) > 0.35) target = limit(0.9, "steering");
      // bends in the road (not just turns at junctions): slow down before them
      const bend = this.#bendAhead(route, loc.progress);
      if (bend > 0.5) target = limit(bend > 1 ? 0.9 : 1.2, "bend");
      if (next && next.at - loc.progress < 350 && Math.abs(next.turn) < 2.4 && !parkTarget) {
         const side = next.turn > 0 ? "left" : "right";
         controls.signal = side;
         say(next, side == "left" ? "Signaling left for the turn" : "Signaling right for the turn",
            "About 100 feet before the corner, and slowing down before it, not in it.");
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
         if (m instanceof Yield) {
            // a roundabout: wait at the line for anyone coming round
            const rb = Roundabouts.at(this.world, m.center, 200);
            if (rb && Roundabouts.trafficComing(rb, m.center, this.sim.traffic, { window: 1.6, roadWidth: rw })) {
               say("yield" + this.#key(m), "Car coming round: waiting at the yield line", "It has the right of way. We go when there's a gap.", 600);
               target = limit(gap < 12 ? 0 : gap / 60, "yield");
               this.waitedAtYield = m;
            } else if (this.waitedAtYield == m) {
               say("gap" + this.#key(m), "There's our gap: in we go", "Turning right onto the ring.");
               this.waitedAtYield = null;
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
                  say("follow", this.coach.followSeconds > 2 ? "Keeping 3+ seconds behind this car" : "Keeping 2+ seconds behind this car",
                     this.coach.followSeconds > 2 ? "Count: one-thousand-one, one-thousand-two, one-thousand-three." : "Count: one-thousand-one, one-thousand-two.", 1800);
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
      this.queue.push(...lines);
      return this.#next();
   }

   // Parallel parking, the textbook way: pull up beside the car ahead of
   // the space, back in on two arcs (wheel toward the curb, then away), then
   // center up. Steps: approach, swing, back, straighten, center, done.
   #parallelPark(spot) {
      const car = this.car;
      const c = this.controls;
      const dir = spot.directionVector;
      const side = perpendicular(dir); // towards the curb
      const rel = subtract(car, spot.center);
      const x = dot(rel, dir); // + = ahead of the space's middle
      const y = dot(rel, side); // 0 = in line with the parked cars
      const h = this.heading();
      const tilt = Math.abs(Math.atan2(dir.x * h.y - dir.y * h.x, dot(dir, h)));
      const R = 1 / 0.025; // the car's tightest turn (see Car)
      // (the numbers come from a search over the maneuver with this car's
      // physics, for the most room to spare)
      const stopX = spot.height / 2 + 5; // a little behind the car ahead
      const outY = -40; // about 3 feet out from the parked cars
      const go = (speed) => {
         // hold a speed (negative = backing up)
         c.forward = car.speed < speed - 0.03;
         c.reverse = car.speed > speed + 0.03;
      };
      let line = null;
      const say = (key, title, tip) => {
         if (!this.said.has(key)) {
            this.said.set(key, this.frame);
            line = { severity: "demo", rule: "demo", title, tip };
         }
      };
      this.parking = this.parking || "approach";
      c.left = c.right = false;
      if (c.steer !== undefined) c.steer = null;

      if (this.parking == "approach") {
         c.signal = "right";
         say("pp1", "Parallel parking: signal right", "Pull up beside the car in front of the space, 2-3 feet out from it.");
         const aim = add(add(spot.center, scale(dir, x + 70)), scale(side, outY));
         let steer = -angle(subtract(aim, car)) - Math.PI / 2 - car.angle;
         steer = Math.atan2(Math.sin(steer), Math.cos(steer));
         c.left = steer > 0.02;
         c.right = steer < -0.02;
         go(Math.max(0, Math.min(1.2, (stopX - x) / 60)));
         if (stopX - x < 2 && Math.abs(car.speed) < 0.03) this.parking = "swing";
      } else if (this.parking == "swing") {
         say("pp2", "Backing up, wheel turned toward the curb", "Slowly! Watch the back of the car swing in.");
         c.right = true;
         go(-0.35);
         if (tilt > 0.75) this.parking = "back";
      } else if (this.parking == "back") {
         say("pp3", "About 45°: straighten the wheel and keep backing", "Until the car is close enough to swing the front in.");
         go(-0.35);
         if (y > -6 - R * (1 - Math.cos(tilt))) this.parking = "straighten";
      } else if (this.parking == "straighten") {
         say("pp4", "Now turn the wheel the other way", "The front swings in and the car straightens out.");
         c.left = true;
         go(-0.3);
         if (tilt < 0.03) this.parking = "center";
      } else if (this.parking == "center") {
         say("pp5", "Center up in the space", "Leave room in front and behind for the other cars to get out.");
         go(x > 4 ? -0.25 : x < -4 ? 0.25 : 0);
         if (Math.abs(x) <= 4 && Math.abs(car.speed) < 0.03) this.parking = "done";
      } else {
         c.signal = null;
         go(0);
      }
      this.why = "parking: " + this.parking;
      return line;
   }

   // A parked vehicle in our lane ahead, on the route
   #blockerAhead(route, progress) {
      const car = this.car;
      const heading = this.heading();
      return (this.sim.parked || []).find((p) => {
         const rel = subtract(p, car);
         const along = dot(rel, heading);
         return along > 0 && along < 420 && Math.abs(rel.x * heading.y - rel.y * heading.x) < 40 &&
            route.locate(p, 0, route.points.length).progress > progress;
      }) || null;
   }

   // Nobody coming the other way for long enough to get around `blocker`
   #otherLaneClear(blocker) {
      const car = this.car;
      const heading = this.heading();
      const rw = this.world.roadWidth;
      return this.sim.traffic.every((t) => {
         const rel = subtract(t, car);
         const along = dot(rel, heading);
         const lateral = rel.x * heading.y - rel.y * heading.x;
         const theirs = new Point(-Math.sin(t.angle), -Math.cos(t.angle));
         if (along < -60 || Math.abs(lateral) > rw * 1.2) return true;
         if (dot(theirs, heading) > 0.7) {
            // same way: only a problem if it's passing too, right beside us
            return Math.abs(along) > 120 || Math.abs(lateral) < 20;
         }
         return along > dot(subtract(blocker, car), heading) + 700;
      });
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

   // One line at a time, at least a third of a second apart, so none get lost
   #next() {
      if (this.queue.length == 0 || this.frame - (this.saidAt || -Infinity) < 20) {
         return null;
      }
      this.saidAt = this.frame;
      return this.queue.shift();
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
