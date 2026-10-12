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
      waited_green: { severity: "good", title: "Waited for the green light" },
      signaled: { severity: "good", title: "Signaled the turn" },
      safe_gap: { severity: "good", title: "Kept a safe following distance" },
   };

   static PENALTY = { minor: 3, major: 10, critical: 30 };
   static PASS_SCORE = 80;

   // speed (world units per frame) to mph: 60 frames/s, 10 units per meter
   static MPH_PER_UNIT = (60 / 10) * 2.23694;

   static mph(speed) {
      return Math.abs(speed) * DrivingCoach.MPH_PER_UNIT;
   }

   // options: speedLimit (mph), rules (ids to judge; default all)
   constructor(world, car, { speedLimit = 30, rules = null } = {}) {
      this.world = world;
      this.car = car;
      this.speedLimit = speedLimit;
      this.rules = rules ? new Set(rules) : null;

      this.events = [];
      this.frame = 0;
      this.finished = false;

      this.stats = {
         distance: 0, topSpeed: 0, fullStops: 0, signaledTurns: 0, turns: 0,
      };

      this.controls = world.markings.filter(
         (m) => m instanceof Light || m instanceof Stop || m instanceof Yield
      );
      this.approaches = new Map(); // marking -> { minSpeed, lineDist, stateWhenStopped }

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

      this.counters = { speeding: 0, reckless: 0, tailgating: 0, wrongSide: 0, wrongWay: 0, safeGap: 0 };
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
      if (this.rules && !this.rules.has(rule) && rule != "hit_by_traffic") {
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
         } else if (Math.abs(car.speed) < 0.3 && Math.abs(other.speed) > 0.3) {
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

      this.#checkSpeed();
      this.#checkSignsAndSignals();
      this.#checkFollowing(traffic);
      this.#checkLane();
      this.#checkTurns(signal);
      return this.events.slice(before);
   }

   heading() {
      return new Point(-Math.sin(this.car.angle), -Math.cos(this.car.angle));
   }

   #checkSpeed() {
      // reported once per stretch over the limit (a second over is a slip;
      // staying over is speeding)
      const mph = DrivingCoach.mph(this.car.speed);
      const detail = Math.round(mph) + " mph in a " + this.speedLimit;
      if (mph > this.speedLimit + 3) {
         this.counters.speeding++;
         if (this.counters.speeding == 60) {
            this.report("speeding", { detail });
         }
      } else {
         this.counters.speeding = 0;
      }
      if (mph > this.speedLimit + 15) {
         this.counters.reckless++;
         if (this.counters.reckless == 30) {
            this.report("reckless_speed", { detail });
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
            this.report("rolling_stop", { detail: "slowest " + Math.round(DrivingCoach.mph(a.minSpeed)) + " mph" });
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

   // The 2-second rule, for the closest car ahead in our lane
   #checkFollowing(traffic) {
      const car = this.car;
      const heading = this.heading();
      const speed = car.speed;
      let gap = Infinity;
      for (const other of traffic) {
         if (other == car) continue;
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
      if (seconds < 2) {
         this.counters.safeGap = 0;
         this.counters.tailgating++;
         if (this.counters.tailgating == 90) {
            this.report("tailgating", { detail: seconds.toFixed(1) + " s behind" });
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

   // Right side of two-way roads, and the right way on one-way roads
   #checkLane() {
      const car = this.car;
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
            startAngle: car.angle,
            signals: new Set(this.frame - this.lastSignal.frame < 180 ? [this.lastSignal.side] : []),
         };
      }
      if (!this.turn) {
         return;
      }
      if (signal) {
         this.turn.signals.add(signal);
      }
      if (distance(car, this.turn.junction) < this.world.roadWidth * 1.1) {
         return;
      }
      // left the junction
      let change = car.angle - this.turn.startAngle;
      change = Math.atan2(Math.sin(change), Math.cos(change));
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
