// Watches a student driver and judges them like a road test examiner:
// signs and signals, speed, following distance, lane position, turn signals
// and crashes. Pure logic (no drawing), so it is tested in Node.
class DrivingCoach {
   // severity: "minor" and "major" cost points; "critical" fails the drive,
   // like on a real road test; "good" is praise; "info" just ends the drive
   static RULES = {
      crash: {
         severity: "critical", title: "Collision",
         tip: "Scan ahead, keep your speed down near other cars, and leave yourself room to stop.",
      },
      hit_pedestrian: {
         severity: "critical", title: "Hit a pedestrian",
         tip: "Near crosswalks, slow down and cover the brake. People can step out from behind parked cars.",
      },
      pedestrian_yield: {
         severity: "critical", title: "Didn't yield to a pedestrian",
         tip: "If someone is in the crosswalk, stop before it and wait until they're all the way across.",
      },
      curb: {
         severity: "critical", title: "Hit the curb",
         tip: "Slow down before turns, and look through the turn to where you want to go.",
      },
      red_light: {
         severity: "critical", title: "Ran a red light",
         tip: "A red light means stop behind the line, every time. On yellow, stop if you safely can.",
      },
      ran_stop: {
         severity: "critical", title: "Drove through a stop sign",
         tip: "Stop signs mean a full stop behind the line, even when the road looks empty.",
      },
      wrong_way: {
         severity: "critical", title: "Wrong way on a one-way street",
         tip: "Check the signs before you turn: one-way streets only go one direction.",
      },
      rolling_stop: {
         severity: "major", title: "Rolling stop",
         tip: "Stop completely so the car stops moving. Count \"one-thousand-one\" before going.",
      },
      wrong_side: {
         severity: "major", title: "Drove on the wrong side",
         tip: "Stay to the right of the center line, unless you're passing something blocking your lane.",
      },
      reckless_speed: {
         severity: "major", title: "Far over the speed limit",
         tip: "At high speed you need far more room to stop, and crashes are much worse.",
      },
      speeding: {
         severity: "minor", title: "Speeding",
         tip: "Glance at your speedometer often, and ease off before you go over the limit.",
      },
      tailgating: {
         severity: "minor", title: "Following too closely",
         tip: "Use the 2-second rule: when the car ahead passes a mark, you should pass it 2+ seconds later.",
      },
      no_signal: {
         severity: "minor", title: "Turned without signaling",
         tip: "Signal about 100 feet (30 m) before every turn, so others know what you're doing.",
      },
      wrong_signal: {
         severity: "minor", title: "Signaled the wrong way",
         tip: "Double-check your signal matches the way you're turning. Q is left, E is right.",
      },
      fast_yield: {
         severity: "minor", title: "Didn't slow down to yield",
         tip: "At a yield sign, slow down and be ready to stop for traffic that has the right of way.",
      },
      hit_by_traffic: {
         severity: "info", title: "Another car hit you",
         tip: "Not your fault this time. Out on the road, keep scanning your mirrors and leave yourself an escape route.",
      },
      full_stop: { severity: "good", title: "Full stop at the stop sign" },
      yielded_pedestrian: { severity: "good", title: "Stopped for a pedestrian" },
      hazard_avoided: { severity: "good", title: "Handled the hazard safely" },
      parked_well: { severity: "good", title: "Pulled over neatly" },
      parallel_parked: { severity: "good", title: "Parallel parked!" },
      far_from_curb: {
         severity: "minor", title: "Parked too far from the curb",
         tip: "End up close to the curb (within about a foot and a half), so passing cars have room.",
      },
      too_many_moves: {
         severity: "minor", title: "Too many back-and-forth moves",
         tip: "Line up about 2-3 feet from the car ahead, reverse with the wheel turned toward the curb, then straighten up. Most tests allow a few corrections.",
      },
      park_signal: {
         severity: "minor", title: "Didn't signal before parking",
         tip: "Signal right as you pull up beside the car ahead of the space, so drivers behind know you're stopping to park.",
      },
      missed_spot: {
         severity: "major", title: "Stopped outside the spot",
         tip: "Aim to stop with the whole car inside the marked space, close to the curb.",
      },
      crooked_park: {
         severity: "minor", title: "Parked at an angle",
         tip: "Straighten the wheel as you come to the curb, so the car ends up parallel to it.",
      },
      pullover_signal: {
         severity: "minor", title: "Pulled over without signaling",
         tip: "Signal right before moving to the curb, so drivers behind know you're slowing down.",
      },
      no_blind_spot_check: {
         severity: "minor", title: "Didn't check your blind spot",
         tip: "Before moving sideways (passing, changing lanes, pulling over), look over your shoulder. Z looks left, C looks right.",
      },
      pass_no_signal: {
         severity: "minor", title: "Passed without signaling",
         tip: "Signal left before moving out to pass, so drivers behind and ahead know what you're doing.",
      },
      pass_return_signal: {
         severity: "minor", title: "Didn't signal back into your lane",
         tip: "After passing, signal right before you move back into your lane.",
      },
      unsafe_pass: {
         severity: "major", title: "Passed with oncoming traffic too close",
         tip: "Only move into the other lane when it's clear far enough ahead to pass and get back. If in doubt, wait.",
      },
      school_zone_speeding: {
         severity: "major", title: "Speeding in a school zone",
         tip: "School zones have a low limit (often 15-20 mph) because children can step out without looking. Fines are usually doubled.",
      },
      emergency_yield: {
         severity: "major", title: "Didn't pull over for the ambulance",
         tip: "When you hear a siren or see flashing lights, slow down, pull to the right edge of the road and stop until it has passed.",
      },
      phone_use: {
         severity: "major", title: "Looked at your phone to reply",
         tip: "Texting while driving is against the law for new drivers in almost every state. If it can't wait, park first.",
      },
      ignored_phone: { severity: "good", title: "Left your phone alone" },
      yielded_emergency: { severity: "good", title: "Pulled over for the ambulance" },
      clean_pass: { severity: "good", title: "Passed safely" },
      checked_blind_spot: { severity: "good", title: "Checked your blind spot" },
      waited_green: { severity: "good", title: "Waited for the green light" },
      signaled: { severity: "good", title: "Signaled the turn" },
      safe_gap: { severity: "good", title: "Kept a safe following distance" },
   };

   static PENALTY = { minor: 3, major: 10, critical: 30 };
   // reported in every lesson: how a drive ended badly is always explained
   static ALWAYS = new Set(["hit_by_traffic", "hit_pedestrian"]);
   static PASS_SCORE = 80;

   // speed (world units per frame) to mph: 60 frames/s, 10 units per meter
   static MPH_PER_UNIT = (60 / 10) * 2.23694;

   // A mistake's detail: in English, plus the pieces to show it in another language
   static detail(text, vars = {}) {
      const english = text.replace(/\{(\w+)\}/g, (m, name) => (name in vars ? String(vars[name]) : m));
      return { detail: english, detailKey: text, detailVars: vars };
   }

   static mph(speed) {
      return Math.abs(speed) * DrivingCoach.MPH_PER_UNIT;
   }

   // options: speedLimit (mph), rules (ids to judge; default all),
   // followSeconds (the minimum gap to the car ahead: 2, or more in bad weather),
   // zones (stretches of road with their own limit: [{ route, limit, kind }])
   constructor(world, car, { speedLimit = 30, rules = null, followSeconds = 2, zones = [] } = {}) {
      this.world = world;
      this.car = car;
      this.speedLimit = speedLimit;
      this.followSeconds = followSeconds;
      this.zones = zones;
      this.rules = rules ? new Set(rules) : null;

      this.events = [];
      this.frame = 0;
      this.finished = false;

      this.stats = {
         distance: 0, topSpeed: 0, fullStops: 0, signaledTurns: 0, turns: 0,
         moves: 0, // changes between driving forward and backing up
      };
      this.lastDirection = 0;

      this.controls = world.markings.filter(
         (m) => m instanceof Light || m instanceof Stop || m instanceof Yield
      );
      this.approaches = new Map(); // marking -> { minSpeed, lineDist, stateWhenStopped }
      this.crossings = world.markings.filter((m) => m instanceof Crossing);
      this.crosswalks = new Map(); // crossing -> { edgeDist, waited }

      this.segmentGrid = new SpatialGrid(250);
      for (const seg of world.graph.segments) {
         this.segmentGrid.insert(seg, SpatialGrid.boundsOfSegment(seg.p1, seg.p2));
      }
      const degree = new Map();
      for (const seg of world.graph.segments) {
         degree.set(seg.p1, (degree.get(seg.p1) || 0) + 1);
         degree.set(seg.p2, (degree.get(seg.p2) || 0) + 1);
      }
      this.junctions = world.graph.points.filter((p) => degree.get(p) >= 3);
      this.junctionGrid = new SpatialGrid(250);
      for (const p of this.junctions) {
         this.junctionGrid.insert(p, SpatialGrid.boundsAround(p, 0));
      }

      this.counters = { speeding: 0, reckless: 0, tailgating: 0, wrongSide: 0, wrongWay: 0, safeGap: 0, zoneSpeeding: 0 };
      this.lastLook = { left: -Infinity, right: -Infinity }; // frames of the last shoulder checks
      this.seenLooks = car.controls.lookCount || 0;
      this.pass = null; // a pass in progress (around a parked vehicle)
      this.emergencies = new Map(); // emergency vehicle -> what we did as it came
      this.judgedEmergencies = new Set(); // (each one is judged once)
      this.reportedZones = new Set();
      this.cooldown = {}; // rule -> frames until it can be reported again
      this.turn = null; // the turn in progress through a junction
      this.lastSignal = { side: null, frame: -Infinity };
      this.lastPos = new Point(car.x, car.y);
   }

   get score() {
      let score = 100;
      for (const e of this.events) {
         score -= DrivingCoach.PENALTY[e.severity] || 0;
      }
      return Math.max(0, score);
   }

   get failed() {
      return this.events.some((e) => e.severity == "critical");
   }

   get passed() {
      return !this.failed && this.score >= DrivingCoach.PASS_SCORE;
   }

   get grade() {
      if (this.failed) return "F";
      const s = this.score;
      return s >= 95 ? "A+" : s >= 90 ? "A" : s >= 80 ? "B" : s >= 70 ? "C" : s >= 60 ? "D" : "F";
   }

   get mistakes() {
      return this.events.filter((e) => e.severity != "good" && e.severity != "info");
   }

   // Record what happened (if that rule is being judged); returns the event
   report(rule, extra = {}) {
      if (this.rules && !this.rules.has(rule) && !DrivingCoach.ALWAYS.has(rule)) {
         return null;
      }
      if (this.cooldown[rule] > 0) {
         return null;
      }
      const info = DrivingCoach.RULES[rule];
      const event = {
         rule, severity: info.severity, title: info.title, tip: info.tip || "",
         frame: this.frame, x: this.car.x, y: this.car.y, ...extra,
      };
      this.events.push(event);
      this.cooldown[rule] = 180;
      return event;
   }

   // Judge one frame. traffic: the other cars. Returns the new events.
   update(traffic = []) {
      if (this.finished) {
         return [];
      }
      const before = this.events.length;
      const car = this.car;
      this.frame++;
      for (const rule in this.cooldown) {
         this.cooldown[rule]--;
      }

      const pos = new Point(car.x, car.y);
      this.stats.distance += distance(pos, this.lastPos);
      this.lastPos = pos;
      this.stats.topSpeed = Math.max(this.stats.topSpeed, DrivingCoach.mph(car.speed));

      if (car.damaged && !car.arrived) {
         const other = traffic.find((t) => t != car && polysIntersect(car.polygon, t.polygon));
         if (!other) {
            this.report("curb");
         } else if (other.isPedestrian) {
            this.report("hit_pedestrian");
         } else if (other.isParked) {
            this.report("crash"); // it can't have moved into us
         } else if (Math.abs(car.speed) < 0.1 || (Math.abs(car.speed) < 0.3 && Math.abs(other.speed) > 0.3)) {
            this.report("hit_by_traffic"); // we were (nearly) stopped: they hit us
         } else {
            this.report("crash");
         }
         this.finished = true;
         return this.events.slice(before);
      }

      const signal = car.controls.signal || null;
      if (signal) {
         this.lastSignal = { side: signal, frame: this.frame };
      }
      if (Math.abs(car.speed) > 0.05) {
         const direction = Math.sign(car.speed);
         if (this.lastDirection && direction != this.lastDirection) this.stats.moves++;
         this.lastDirection = direction;
      }
      const looks = car.controls.lookCount || 0;
      if (looks != this.seenLooks) {
         this.seenLooks = looks;
         this.lastLook[car.controls.looked] = this.frame;
      }

      this.#checkSpeed();
      this.#checkEmergency(traffic.filter((t) => t.siren));
      this.#checkSignsAndSignals();
      this.#checkCrosswalks(traffic.filter((t) => t.isPedestrian));
      this.#checkFollowing(traffic);
      this.#checkLane(traffic);
      this.#checkTurns(signal);
      return this.events.slice(before);
   }

   heading() {
      return new Point(-Math.sin(this.car.angle), -Math.cos(this.car.angle));
   }

   // The zone the car is in (e.g. a school zone), if any
   zoneAt(p) {
      for (const zone of this.zones) {
         const loc = zone.route.locate(p, 0, zone.route.points.length);
         if (loc.distance < this.world.roadWidth / 2 + 10 && loc.progress > 0 && loc.progress < zone.route.length) {
            return zone;
         }
      }
      return null;
   }

   // The speed limit where the car is now (mph)
   get currentLimit() {
      const zone = this.zoneAt(this.car);
      return zone ? Math.min(zone.limit, this.speedLimit) : this.speedLimit;
   }

   // Did the student look over that shoulder in the last `frames` frames?
   lookedRecently(side, frames = 300) {
      return this.frame - this.lastLook[side] <= frames;
   }

   signaledRecently(side, frames = 300) {
      return this.car.controls.signal == side || (this.lastSignal.side == side && this.frame - this.lastSignal.frame <= frames);
   }

   #checkSpeed() {
      // reported once per stretch over the limit (a second over is a slip;
      // staying over is speeding)
      const mph = DrivingCoach.mph(this.car.speed);
      const zone = this.zoneAt(this.car);
      if (zone && zone.kind == "school") {
         // its own, bigger mistake; once per zone
         this.counters.zoneSpeeding = mph > zone.limit + 3 ? this.counters.zoneSpeeding + 1 : 0;
         if (this.counters.zoneSpeeding == 45 && !this.reportedZones.has(zone)) {
            this.reportedZones.add(zone);
            this.report("school_zone_speeding", DrivingCoach.detail("{mph} mph in a {limit}", { mph: Math.round(mph), limit: zone.limit }));
         }
         this.counters.speeding = 0;
         return;
      }
      this.counters.zoneSpeeding = 0;
      const limit = this.currentLimit;
      const detail = DrivingCoach.detail("{mph} mph in a {limit}", { mph: Math.round(mph), limit });
      if (mph > limit + 3) {
         this.counters.speeding++;
         if (this.counters.speeding == 60) {
            this.report("speeding", detail);
         }
      } else {
         this.counters.speeding = 0;
      }
      if (mph > limit + 15) {
         this.counters.reckless++;
         if (this.counters.reckless == 30) {
            this.report("reckless_speed", detail);
         }
      } else {
         this.counters.reckless = 0;
      }
   }

   // Distance from the front of the car to a marking's stop line, if the car
   // is driving towards it in its lane; otherwise null
   lineDistance(m) {
      const car = this.car;
      const heading = this.heading();
      if (dot(heading, m.directionVector) < 0.6) {
         return null;
      }
      const rel = subtract(m.center, car);
      const lateral = Math.abs(rel.x * m.directionVector.y - rel.y * m.directionVector.x);
      if (lateral > this.world.roadWidth * 0.45) {
         return null;
      }
      return dot(rel, m.directionVector) + m.height / 2 - car.height / 2;
   }

   #checkSignsAndSignals() {
      const car = this.car;
      const speed = Math.abs(car.speed);
      for (const m of this.controls) {
         if (Math.abs(m.center.x - car.x) > 400 || Math.abs(m.center.y - car.y) > 400) {
            this.approaches.delete(m);
            continue;
         }
         const d = this.lineDistance(m);
         if (d == null || d < -80 || d > 300) {
            this.approaches.delete(m);
            continue;
         }
         let a = this.approaches.get(m);
         if (!a) {
            a = { minSpeed: Infinity, lineDist: d, stoppedAtRed: false };
            this.approaches.set(m, a);
         }
         if (d < 120 && d > -10) {
            a.minSpeed = Math.min(a.minSpeed, speed);
            if (m instanceof Light && m.state == "red" && speed < 0.1) {
               a.stoppedAtRed = true;
            }
         }
         // the front of the car just crossed the line
         if (a.lineDist > 0 && d <= 0) {
            this.#crossedLine(m, a, speed);
         }
         a.lineDist = d;
      }
   }

   #crossedLine(m, a, speed) {
      if (m instanceof Stop) {
         if (a.minSpeed < 0.12) {
            this.stats.fullStops++;
            this.report("full_stop");
         } else if (a.minSpeed < 1.2) {
            this.report("rolling_stop", DrivingCoach.detail("slowest {mph} mph", { mph: Math.round(DrivingCoach.mph(a.minSpeed)) }));
         } else {
            this.report("ran_stop");
         }
      } else if (m instanceof Light) {
         if (m.state == "red") {
            this.report("red_light");
         } else if (a.stoppedAtRed) {
            this.report("waited_green");
         }
      } else if (m instanceof Yield && speed > 1.5) {
         this.report("fast_yield");
      }
   }

   // Distance from the front of the car to the near edge of a crosswalk it
   // is driving towards (from either direction); otherwise null
   crosswalkDistance(m) {
      const car = this.car;
      const heading = this.heading();
      const along = dot(heading, m.directionVector);
      if (Math.abs(along) < 0.6) {
         return null;
      }
      const dir = along > 0 ? m.directionVector : scale(m.directionVector, -1);
      const rel = subtract(m.center, car);
      if (Math.abs(rel.x * dir.y - rel.y * dir.x) > m.width * 0.6) {
         return null;
      }
      return dot(rel, dir) - m.height / 2 - car.height / 2;
   }

   // Anyone walking in a crosswalk must be allowed to finish crossing
   #checkCrosswalks(people) {
      const car = this.car;
      for (const m of this.crossings) {
         if (Math.abs(m.center.x - car.x) > 400 || Math.abs(m.center.y - car.y) > 400) {
            this.crosswalks.delete(m);
            continue;
         }
         const d = this.crosswalkDistance(m);
         if (d == null || d < -60 || d > 300) {
            this.crosswalks.delete(m);
            continue;
         }
         let c = this.crosswalks.get(m);
         if (!c) {
            c = { edgeDist: d, waited: false };
            this.crosswalks.set(m, c);
         }
         // anyone on the road in our half, or about to reach it
         const busy = people.some((p) =>
            p.crossing == m && p.onRoad &&
            Math.abs(dot(subtract(p, car), perpendicular(this.heading()))) < this.world.roadWidth / 2
         );
         if (busy && d > -10 && d < 150 && Math.abs(car.speed) < 0.1) {
            c.waited = true;
         }
         if (c.edgeDist > 0 && d <= 0) {
            if (busy) {
               this.report("pedestrian_yield");
            } else if (c.waited) {
               this.report("yielded_pedestrian");
            }
         }
         c.edgeDist = d;
      }
   }

   // The 2-second rule, for the closest car ahead in our lane
   #checkFollowing(traffic) {
      const car = this.car;
      const heading = this.heading();
      const speed = car.speed;
      let gap = Infinity;
      for (const other of traffic) {
         if (other == car || other.isPedestrian) continue;
         const rel = subtract(other, car);
         const along = dot(rel, heading);
         if (along <= 0 || along > 600) continue;
         const lateral = Math.abs(rel.x * heading.y - rel.y * heading.x);
         if (lateral > 30) continue;
         const otherHeading = new Point(-Math.sin(other.angle), -Math.cos(other.angle));
         if (dot(otherHeading, heading) < 0.7) continue; // crossing or oncoming
         gap = Math.min(gap, along - car.height);
      }
      if (gap == Infinity || speed < 0.7) {
         this.counters.tailgating = 0;
         this.counters.safeGap = 0;
         return;
      }
      const seconds = gap / speed / 60;
      if (seconds < this.followSeconds) {
         this.counters.safeGap = 0;
         this.counters.tailgating++;
         if (this.counters.tailgating == 90) {
            this.report("tailgating", DrivingCoach.detail("{seconds} s behind, keep {needed}+", { seconds: seconds.toFixed(1), needed: this.followSeconds }));
         }
      } else {
         this.counters.tailgating = 0;
         this.counters.safeGap++;
         if (this.counters.safeGap == 600) {
            this.report("safe_gap");
         }
      }
   }

   nearJunction(radius) {
      for (const p of this.junctionGrid.query(SpatialGrid.boundsAround(this.car, radius))) {
         if (distance(p, this.car) < radius) {
            return p;
         }
      }
      return null;
   }

   // Signed distance from the middle of the road (+ = right side), on a
   // two-way road the car is driving along (pointing within ~60 degrees of
   // it, or within ~35 with strict); otherwise null
   laneOffset(strict = false) {
      const car = this.car;
      let best = null;
      for (const seg of this.segmentGrid.query(SpatialGrid.boundsAround(car, 150))) {
         const d = seg.distanceToPoint(car);
         if (!best || d < best.d) {
            best = { seg, d };
         }
      }
      if (!best || best.d > this.world.roadWidth / 2 || best.seg.oneWay) {
         return null;
      }
      const segDir = best.seg.directionVector();
      const along = dot(this.heading(), segDir);
      if (Math.abs(along) < (strict ? 0.8 : 0.5)) {
         return null;
      }
      const dir = along > 0 ? segDir : scale(segDir, -1);
      return dot(subtract(car, best.seg.projectPoint(car).point), perpendicular(dir));
   }

   // A parked or stopped vehicle blocking our lane, near us (we may pass it)
   blockerNear(traffic) {
      const car = this.car;
      const heading = this.heading();
      return traffic.find((t) => {
         if (!t.isParked) return false;
         const rel = subtract(t, car);
         const along = dot(rel, heading);
         return along > -t.height - 60 && along < 400 && Math.abs(rel.x * heading.y - rel.y * heading.x) < this.world.roadWidth * 0.6;
      }) || null;
   }

   // Passing a parked vehicle: signal, check the blind spot, make sure the
   // other lane is clear, then signal back
   #checkPassing(traffic) {
      if (this.pass && this.frame - this.pass.frame > 1200) {
         this.pass = null; // turned off somewhere instead of finishing the pass
      }
      const offset = this.laneOffset();
      if (offset == null) {
         return;
      }
      const rw = this.world.roadWidth;
      const blocker = this.blockerNear(traffic);
      if (!this.pass && blocker && offset < -rw * 0.05) {
         this.pass = { blocker, frame: this.frame, signaled: this.signaledRecently("left"), looked: this.lookedRecently("left") };
         if (!this.pass.signaled) this.report("pass_no_signal");
         if (!this.pass.looked) this.report("no_blind_spot_check", DrivingCoach.detail("left, before passing"));
         // anyone coming the other way, too close to pass safely?
         const car = this.car;
         const heading = this.heading();
         const oncoming = traffic.some((t) => {
            if (t.isParked || t.isPedestrian) return false;
            const theirs = new Point(-Math.sin(t.angle), -Math.cos(t.angle));
            if (dot(theirs, heading) > -0.7) return false;
            const rel = subtract(t, car);
            const along = dot(rel, heading);
            const closing = (Math.abs(car.speed) + Math.abs(t.speed)) * 60 * 2.5; // 2.5 seconds
            return along > 0 && along < Math.max(250, closing) && Math.abs(rel.x * heading.y - rel.y * heading.x) < rw;
         });
         if (oncoming) {
            this.pass.unsafe = true;
            this.report("unsafe_pass");
         }
      } else if (this.pass && offset > rw * 0.1) {
         const back = this.signaledRecently("right");
         if (!back) this.report("pass_return_signal");
         if (back && this.pass.signaled && this.pass.looked && !this.pass.unsafe) this.report("clean_pass");
         this.pass = null;
      }
   }

   // An ambulance with its siren on: pull over to the right and stop until
   // it has gone by
   #checkEmergency(sirens) {
      const car = this.car;
      const heading = this.heading();
      for (const e of sirens) {
         const rel = subtract(e, car);
         const along = dot(rel, heading);
         if (distance(e, car) > 900) {
            this.emergencies.delete(e);
            continue;
         }
         let seen = this.emergencies.get(e);
         if (!seen) {
            seen = { along, stoppedRight: 0, judged: this.judgedEmergencies.has(e) };
            this.emergencies.set(e, seen);
         }
         // pulled over to the right, or stopped at an intersection (no
         // pulling over in the middle of one)
         const offset = this.laneOffset();
         const right = offset == null || offset > this.world.roadWidth / 4 + 4 || this.nearJunction(this.world.roadWidth * 2.2);
         if (Math.abs(car.speed) < 0.3 && right) seen.stoppedRight++;
         // it's going past us now (coming towards us, or overtaking us)
         if (!seen.judged && Math.sign(seen.along) != Math.sign(along) && distance(e, car) < 200) {
            seen.judged = true;
            this.judgedEmergencies.add(e);
            this.report(seen.stoppedRight > 20 ? "yielded_emergency" : "emergency_yield");
         }
         seen.along = along;
      }
   }

   // Right side of two-way roads, and the right way on one-way roads
   #checkLane(traffic = []) {
      const car = this.car;
      if (this.pass || this.blockerNear(traffic)) {
         this.counters.wrongSide = 0; // passing something blocking the lane is fine
         this.#checkPassing(traffic);
         return;
      }
      if (Math.abs(car.speed) < 0.3 || this.nearJunction(this.world.roadWidth * 1.2)) {
         this.counters.wrongSide = 0;
         this.counters.wrongWay = 0;
         return;
      }
      let best = null;
      for (const seg of this.segmentGrid.query(SpatialGrid.boundsAround(car, 150))) {
         const d = seg.distanceToPoint(car);
         if (!best || d < best.d) {
            best = { seg, d };
         }
      }
      if (!best || best.d > this.world.roadWidth / 2) {
         return;
      }
      const seg = best.seg;
      const heading = this.heading();
      const segDir = seg.directionVector();
      const along = dot(heading, segDir);

      if (seg.oneWay) {
         this.counters.wrongWay = along < -0.7 && car.speed > 0 ? this.counters.wrongWay + 1 : 0;
         if (this.counters.wrongWay == 45) {
            this.report("wrong_way");
         }
         return;
      }
      if (Math.abs(along) < 0.8) {
         this.counters.wrongSide = 0;
         return; // turning or crossing the road
      }
      const dir = along > 0 ? segDir : scale(segDir, -1);
      const onLine = seg.projectPoint(car).point;
      const side = dot(subtract(car, onLine), perpendicular(dir)); // + = right side
      this.counters.wrongSide = side < -this.world.roadWidth * 0.08 ? this.counters.wrongSide + 1 : 0;
      if (this.counters.wrongSide == 60) {
         this.report("wrong_side");
      }
   }

   // A turn = heading changes a lot while passing through a junction.
   // Was the matching turn signal on shortly before or during it?
   #checkTurns(signal) {
      const car = this.car;
      const junction = this.nearJunction(this.world.roadWidth * 0.9);
      if (!this.turn && junction && Math.abs(car.speed) > 0.2) {
         this.turn = {
            junction,
            lastAngle: car.angle,
            change: 0, // added up frame by frame, so two quick turns can't wrap around to look like one the other way
            signals: new Set(this.frame - this.lastSignal.frame < 180 ? [this.lastSignal.side] : []),
         };
      }
      if (!this.turn) {
         return;
      }
      let step = car.angle - this.turn.lastAngle;
      this.turn.change += Math.atan2(Math.sin(step), Math.cos(step));
      this.turn.lastAngle = car.angle;
      if (signal) {
         this.turn.signals.add(signal);
      }
      if (distance(car, this.turn.junction) < this.world.roadWidth * 1.1) {
         return;
      }
      // left the junction
      const change = this.turn.change;
      const signals = this.turn.signals;
      this.turn = null;
      if (Math.abs(change) < 0.7) {
         return; // went straight
      }
      this.stats.turns++;
      const side = change > 0 ? "left" : "right";
      if (signals.has(side)) {
         this.stats.signaledTurns++;
         this.report("signaled");
      } else if (signals.size > 0) {
         this.report("wrong_signal");
      } else {
         this.report("no_signal");
      }
      if (car.controls.cancelSignal) {
         car.controls.cancelSignal(); // like a real car, the signal clicks off
      }
   }

   // Judges a stop at the curb, in the marked parking space `spot`
   judgePullOver(spot) {
      const car = this.car;
      const dir = spot.directionVector;
      const rel = subtract(car, spot.center);
      const along = dot(rel, dir);
      const lateral = dot(rel, perpendicular(dir));
      const inside = Math.abs(along) <= spot.height / 2 - car.height / 2 + 10 && Math.abs(lateral) <= spot.width / 2 + 6;
      const heading = this.heading();
      const off = Math.abs(Math.atan2(heading.x * dir.y - heading.y * dir.x, dot(heading, dir))) * (180 / Math.PI);
      const events = [];
      const signaled = this.lastSignal.side == "right" && this.frame - this.lastSignal.frame < 600;
      if (!signaled) events.push(this.report("pullover_signal"));
      if (this.rules && this.rules.has("no_blind_spot_check")) {
         events.push(this.lookedRecently("right", 900)
            ? this.report("checked_blind_spot")
            : this.report("no_blind_spot_check", DrivingCoach.detail("right, before pulling over")));
      }
      if (!inside) {
         events.push(this.report("missed_spot"));
      } else if (off > 12) {
         events.push(this.report("crooked_park", DrivingCoach.detail("{degrees}° off", { degrees: Math.round(off) })));
      } else {
         events.push(this.report("parked_well"));
      }
      return events.filter(Boolean);
   }

   // Judges a parallel park in `spot` (the space between two parked cars)
   judgeParallelPark(spot, movesAllowed = 7) {
      const car = this.car;
      const dir = spot.directionVector;
      const rel = subtract(car, spot.center);
      const along = dot(rel, dir);
      const toCurb = dot(rel, perpendicular(dir)); // 0 = in line with the parked cars, + = closer to the curb
      const heading = this.heading();
      const off = Math.abs(Math.atan2(heading.x * dir.y - heading.y * dir.x, dot(heading, dir))) * (180 / Math.PI);
      const events = [];
      const inside = Math.abs(along) <= spot.height / 2 - car.height / 2 + 6 && toCurb > -spot.width / 2 - 14;
      if (!(this.lastSignal.side == "right" && this.frame - this.lastSignal.frame < 60 * 60)) {
         events.push(this.report("park_signal"));
      }
      if (!inside) {
         events.push(this.report("missed_spot", DrivingCoach.detail("{units} units off the middle", { units: Math.round(Math.abs(along)) })));
         return events.filter(Boolean);
      }
      if (toCurb < -9) {
         events.push(this.report("far_from_curb", DrivingCoach.detail("{feet} ft away", { feet: Math.round((7 - toCurb) / 3.048) })));
      }
      if (off > 10) {
         events.push(this.report("crooked_park", DrivingCoach.detail("{degrees}° off", { degrees: Math.round(off) })));
      }
      if (this.stats.moves > movesAllowed) {
         events.push(this.report("too_many_moves", DrivingCoach.detail("{moves} moves", { moves: this.stats.moves })));
      }
      if (events.every((e) => !e)) {
         events.push(this.report("parallel_parked"));
      }
      return events.filter(Boolean);
   }

   // A summary for the report card
   summary() {
      const minutes = this.frame / 60 / 60;
      return {
         score: this.score,
         grade: this.grade,
         passed: this.passed,
         failed: this.failed,
         mistakes: this.mistakes,
         praise: this.events.filter((e) => e.severity == "good"),
         distanceMeters: Math.round(this.stats.distance / Osm.UNITS_PER_METER),
         minutes,
         topSpeed: Math.round(this.stats.topSpeed),
         fullStops: this.stats.fullStops,
         turns: this.stats.turns,
         signaledTurns: this.stats.signaledTurns,
      };
   }
}
