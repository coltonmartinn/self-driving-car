// The road network as directed lanes, for traffic to drive along
class TrafficNetwork {
   constructor(world) {
      this.world = world;
      this.edges = [];
      this.outgoing = new Map();
      for (const seg of world.graph.segments) {
         this.#addEdge(seg.p1, seg.p2, seg);
         if (!seg.oneWay) {
            this.#addEdge(seg.p2, seg.p1, seg);
         }
      }
      this.controls = world.markings.filter(
         (m) => m instanceof Light || m instanceof Stop || m instanceof Yield
      );
   }

   #addEdge(from, to, seg) {
      const edge = { from, to, seg };
      this.edges.push(edge);
      if (!this.outgoing.has(from)) {
         this.outgoing.set(from, []);
      }
      this.outgoing.get(from).push(edge);
   }

   // The line a car follows: right-hand lane, or the middle of a one-way road
   lane(edge) {
      const dir = normalize(subtract(edge.to, edge.from));
      const offset = edge.seg.oneWay ? 0 : this.world.roadWidth / 4;
      const shift = scale(perpendicular(dir), offset);
      return { a: add(edge.from, shift), b: add(edge.to, shift), dir };
   }

   randomEdgeNear(point, minDist, maxDist) {
      const candidates = this.edges.filter((e) => {
         const d = distance(average(e.from, e.to), point);
         return d >= minDist && d <= maxDist;
      });
      if (candidates.length == 0) {
         return null;
      }
      return candidates[Math.floor(Math.random() * candidates.length)];
   }
}

// A car that already knows how to drive: it follows its lane, picks a random
// turn at each intersection, keeps its distance, and obeys lights and signs.
class TrafficCar extends Car {
   static COLORS = ["#e8554e", "#f2a541", "#f4d35e", "#7bc67e", "#9b6ad6", "#f0f0f0", "#3b3b3b", "#c97b4a"];

   constructor(network, edge, t = Math.random()) {
      const lane = network.lane(edge);
      const pos = lerp2D(lane.a, lane.b, t);
      const color = TrafficCar.COLORS[Math.floor(Math.random() * TrafficCar.COLORS.length)];
      const cruise = lerp(2, 2.8, Math.random());
      super(pos.x, pos.y, 30, 50, "AUTO", -angle(lane.dir) - Math.PI / 2, cruise + 0.5, color);

      this.network = network;
      this.edge = edge;
      this.nextEdge = null;
      this.cruiseSpeed = cruise;
      this.speed = cruise * 0.7;
      this.lost = false;

      this.servedStops = new Set();
      this.stopWait = 0;
      this.yieldWait = 0; // frames waiting to get into a roundabout
      this.blockedFrames = 0;
      this.ghostFrames = 0;
      this.playerWait = 0; // frames spent waiting on a stopped human driver
      this.hazardBrake = 0; // frames of emergency stop (a Driving School hazard)
      this.plan = null; // graph points to drive through, in order (else random turns)
      this.passing = null; // a parked vehicle we're driving around
      this.siren = false;
   }

   heading() {
      return new Point(-Math.sin(this.angle), -Math.cos(this.angle));
   }

   update(otherTraffic) {
      this.#drive(otherTraffic);
      super.update([], []);
   }

   #chooseNext() {
      const options = this.network.outgoing.get(this.edge.to) || [];
      if (this.plan && this.plan.length > 0) {
         const planned = options.find((e) => e.to == this.plan[0]);
         this.plan.shift();
         if (planned) {
            return planned;
         }
         this.plan = null; // off the plan: wander like everyone else
      }
      // don't make a U-turn unless it's a dead end
      const forward = options.filter((e) => e.to != this.edge.from);
      if (forward.length == 0 && this.network.world.mapEdges && this.network.world.mapEdges.has(this.edge.to)) {
         return null; // the road runs on off the map: drive off it (and get recycled)
      }
      const pool = forward.length > 0 ? forward : options;
      if (pool.length == 0) {
         return null;
      }
      return pool[Math.floor(Math.random() * pool.length)];
   }

   #drive(otherTraffic) {
      const pos = new Point(this.x, this.y);
      let lane = this.network.lane(this.edge);
      let laneSeg = new Segment(lane.a, lane.b);
      let len = laneSeg.length();
      let t = laneSeg.projectPoint(pos).offset;

      // reached the end of this road piece: move on to the next one
      if ((1 - t) * len < 20) {
         const next = this.nextEdge || this.#chooseNext();
         if (!next) {
            this.lost = true;
            return;
         }
         this.edge = next;
         this.nextEdge = null;
         this.yieldWait = 0;
         lane = this.network.lane(this.edge);
         laneSeg = new Segment(lane.a, lane.b);
         len = laneSeg.length();
         t = Math.max(0, laneSeg.projectPoint(pos).offset);
      }

      if (laneSeg.distanceToPoint(pos) > 150) {
         this.lost = true; // drifted way off its lane
         return;
      }

      // pure pursuit: steer towards a point a bit further along the route
      const lookahead = 70;
      const remaining = (1 - t) * len;
      let target;
      let turning = 0;
      if (remaining > lookahead) {
         target = lerp2D(lane.a, lane.b, t + lookahead / len);
      } else {
         if (!this.nextEdge) {
            this.nextEdge = this.#chooseNext();
         }
         if (this.nextEdge) {
            const nextLane = this.network.lane(this.nextEdge);
            const nextLen = distance(nextLane.a, nextLane.b);
            target = lerp2D(nextLane.a, nextLane.b, Math.min(1, (lookahead - remaining) / nextLen));
            turning = Math.abs(Math.atan2(
               lane.dir.x * nextLane.dir.y - lane.dir.y * nextLane.dir.x,
               dot(lane.dir, nextLane.dir)
            ));
         } else {
            target = lane.b;
         }
      }

      // driving around a parked vehicle: aim for the other lane until past it
      const rw = this.network.world.roadWidth;
      const clearOf = this.siren ? this.passing && this.passing.height + 90 : this.passing && this.passing.height / 2 + 45;
      if (this.passing && dot(subtract(this.passing, pos), lane.dir) < -clearOf) {
         this.passing = null; // past it: back to our lane
      }
      if (!this.passing) {
         this.passing = this.#blockerToPass(otherTraffic, lane.dir, rw);
      }
      if (this.passing) {
         // into the other lane; an ambulance just straddles the middle, so
         // cars pulled over on both sides have room
         // (and gives a student a wider berth)
         const shift = !this.siren ? -rw / 2 : this.passing.isPlayer ? -rw / 4 - 14 : -rw / 4;
         target = add(target, scale(perpendicular(lane.dir), shift));
      }
      // an ambulance with its siren on coming our way: pull over to the right
      const yieldTo = this.siren ? null : otherTraffic.find((o) => o.siren && distance(o, pos) < 450 &&
         dot(subtract(pos, o), new Point(-Math.sin(o.angle), -Math.cos(o.angle))) > 0);
      if (yieldTo) {
         target = add(target, scale(perpendicular(lane.dir), rw / 2 - 22 - rw / 4));
      }

      const toTarget = subtract(target, pos);
      const desiredAngle = -angle(toTarget) - Math.PI / 2;
      let diff = desiredAngle - this.angle;
      diff = Math.atan2(Math.sin(diff), Math.cos(diff)); // wrap to -PI..PI

      let targetSpeed = this.cruiseSpeed;
      if (turning > 0.5 || Math.abs(diff) > 0.4) {
         targetSpeed = Math.min(targetSpeed, 1.6); // slow down for corners
      }
      if (Roundabouts.at(this.network.world, pos, rw)) {
         targetSpeed = Math.min(targetSpeed, 1.3); // about 17 mph round a roundabout
      }

      const heading = this.heading();
      const stoppingSpeed = (gap) => Math.max(0, (gap / 40) * this.cruiseSpeed);

      // keep a safe distance from cars ahead in the same lane (a human
      // driver is never ignored, and gets a wider berth)
      let blocked = false;
      let blockedByPlayer = false;
      const ghost = this.ghostFrames > 0;
      if (ghost) {
         this.ghostFrames--;
      }
      for (const other of otherTraffic) {
         if (other == this || other == this.passing || (ghost && !other.isPlayer && !other.isPedestrian)) continue;
         if (other.isPedestrian && (!other.onRoad || other.blockedBy == this)) continue; // on the sidewalk, or waiting for us
         const rel = new Point(other.x - this.x, other.y - this.y);
         const along = dot(rel, heading);
         if (along <= 0 || along > 160) continue;
         const lateral = Math.abs(rel.x * heading.y - rel.y * heading.x);
         // a human driver close in front (even off to the side, e.g. while
         // turning a corner) gets a full stop: never bump into a student
         const closePlayer = other.isPlayer && along > 10 && along < 100 && lateral < (this.siren ? 36 : 60);
         // anyone walking across the road ahead, in either lane, gets to finish
         if (!closePlayer && lateral > (other.isPedestrian ? 80 : other.isPlayer ? 45 : 28)) continue;
         const limit = closePlayer ? 0 : stoppingSpeed(along - 75);
         if (limit < this.cruiseSpeed && other.isPlayer && Math.abs(other.speed) < 0.1) {
            blockedByPlayer = true; // (even if someone else is in the way too)
         }
         if (limit < targetSpeed) {
            targetSpeed = limit;
            blocked = true;
         }
      }

      if (yieldTo) {
         targetSpeed = Math.min(targetSpeed, 0.6 * Math.max(0, (distance(yieldTo, pos) - 150) / 300)); // and stop
      }

      // traffic lights and signs for our direction (only the nearest light
      // counts, like a driver watching the signal at the next stop line;
      // an ambulance with its siren on doesn't have to stop)
      const ahead = [];
      for (const m of this.siren ? [] : this.network.controls) {
         const rel = subtract(m.center, pos);
         const along = dot(rel, heading);
         if (along < -10 || along > 150) continue;
         if (Math.abs(rel.x * heading.y - rel.y * heading.x) > 30) continue;
         if (dot(m.directionVector, heading) < 0.7) continue;
         ahead.push({ m, along });
      }
      const lights = ahead.filter(({ m }) => m instanceof Light);
      const nearestLight = lights.length > 0
         ? lights.reduce((a, b) => (b.along < a.along ? b : a)).m
         : null;
      for (const { m, along } of ahead) {
         if (m instanceof Light && m != nearestLight) continue;
         const gap = along + m.height / 2 - 30; // car front to the stop line
         if (m instanceof Light) {
            if (m.state == "red" || (m.state == "yellow" && gap > 40)) {
               targetSpeed = Math.min(targetSpeed, gap < 3 ? 0 : stoppingSpeed(gap));
            }
         } else if (m instanceof Stop) {
            if (!this.servedStops.has(m)) {
               targetSpeed = Math.min(targetSpeed, gap < 3 ? 0 : stoppingSpeed(gap));
               if (gap < 15 && this.speed < 0.1) {
                  this.stopWait++;
                  if (this.stopWait > 45) {
                     this.servedStops.add(m); // came to a full stop, now go
                     this.stopWait = 0;
                  }
               }
            }
         } else if (m instanceof Yield) {
            // at a roundabout, wait for a gap in the cars coming round
            // (but not forever: someone may be stopped in the ring)
            const rb = Roundabouts.at(this.network.world, m.center, 200);
            const coming = rb && gap < 120 && this.yieldWait < 300 &&
               Roundabouts.trafficComing(rb, m.center, otherTraffic, { exclude: this, roadWidth: rw });
            if (coming) {
               targetSpeed = Math.min(targetSpeed, gap < 3 ? 0 : stoppingSpeed(gap));
               if (this.speed < 0.1) this.yieldWait++;
            } else if (gap < 60) {
               targetSpeed = Math.min(targetSpeed, 1.2);
            }
         }
      }

      // last line of defense: never drive into a student's car. Where would
      // we be in a few frames? If that overlaps them, stop.
      let hardStop = false;
      if (targetSpeed > 0.05 || this.speed > 0.05) {
         const ahead = scale(heading, Math.max(this.speed, 0.5) * 10 + 6);
         const future = this.polygon.map((p) => ({ x: p.x + ahead.x, y: p.y + ahead.y }));
         for (const other of otherTraffic) {
            if (!other.isPlayer || Math.abs(other.x - pos.x) > 150 || Math.abs(other.y - pos.y) > 150) continue;
            // with a margin around them, for drifting in from the side
            const roomy = other.polygon.map((p) => ({ x: other.x + (p.x - other.x) * 1.35, y: other.y + (p.y - other.y) * 1.35 }));
            if (polysIntersect(future, roomy)) {
               targetSpeed = 0;
               hardStop = true;
               blocked = true;
               if (Math.abs(other.speed) < 0.1) blockedByPlayer = true;
            }
         }
      }

      // if stuck behind someone for too long (e.g. a standoff in a junction),
      // stop worrying about other cars for a moment so traffic keeps flowing
      if (blocked && this.speed < 0.1) {
         this.blockedFrames++;
         if (this.blockedFrames > 180) {
            this.ghostFrames = 90;
            this.blockedFrames = 0;
         }
      } else {
         this.blockedFrames = 0;
      }

      // emergency stop: brake lights on, as hard as a real car can (about
      // 9 m/s²), so a driver keeping their distance has time to react
      // (braking + rolling friction = 0.025 units/frame², i.e. 9 m/s²)
      this.brakePower = this.hazardBrake > 0 ? 0.017 : hardStop ? 0.3 : this.acceleration;
      this.friction = this.hazardBrake > 0 ? 0.008 : 0.05;
      if (this.hazardBrake > 0) {
         this.hazardBrake--;
         targetSpeed = 0;
      }

      // a car can't ghost through a person who is waiting (that would be a
      // crash on their record), so after a while it just leaves the road
      this.playerWait = blockedByPlayer && this.speed < 0.1 ? this.playerWait + 1 : 0;
      if (this.playerWait > 240) {
         this.lost = true;
      }

      this.controls.left = diff > 0.02;
      this.controls.right = diff < -0.02;
      this.controls.forward = this.speed < targetSpeed - 0.05;
      this.controls.reverse = this.speed > targetSpeed + 0.3 && this.speed > 0.25; // brake
   }

   // A parked vehicle in our lane ahead that we can drive around now: the
   // other lane is clear of oncoming cars (an ambulance doesn't wait, and
   // also goes around cars that stopped to let it by)
   #blockerToPass(otherTraffic, dir, rw) {
      const pos = new Point(this.x, this.y);
      let blocker = null;
      for (const o of otherTraffic) {
         // (an ambulance also goes past anyone who stopped for it, the student too)
         const passable = o.isParked || (this.siren && !o.isPedestrian && Math.abs(o.speed) < 0.3);
         if (!passable) continue;
         const rel = subtract(o, pos);
         const along = dot(rel, dir);
         if (along > 0 && along < 220 && Math.abs(rel.x * dir.y - rel.y * dir.x) < (this.siren ? 50 : 30)) {
            blocker = o;
         }
      }
      if (!blocker || this.siren) {
         return blocker;
      }
      const clear = otherTraffic.every((o) => {
         if (o == this || o.isParked || o.isPedestrian) return true;
         const rel = subtract(o, pos);
         const along = dot(rel, dir);
         const lateral = rel.x * dir.y - rel.y * dir.x; // + = to our left
         return along < -40 || along > 650 || Math.abs(lateral) > rw * 0.9 || (Math.abs(lateral) < 20 && along > 0);
      });
      return clear ? blocker : null;
   }
}

// An ambulance with its siren on: drives faster, ignores lights and signs,
// and everyone (including the student) should pull over and let it by
class EmergencyVehicle extends TrafficCar {
   constructor(network, edge, t, speed) {
      super(network, edge, t);
      this.siren = true;
      this.color = "#f4f6fb";
      this.width = 32;
      this.height = 62;
      this.cruiseSpeed = speed;
      this.maxSpeed = speed + 0.5;
      this.speed = speed * 0.8;
      this.place(this.x, this.y, this.angle);
   }

   draw(ctx) {
      super.draw(ctx);
      if (this.damaged) return;
      // a red stripe and a flashing red/blue light bar on the roof
      const p = this.polygon;
      const mid = (a, b, t) => ({ x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t) });
      ctx.save();
      ctx.lineWidth = 5;
      ctx.strokeStyle = "#d62828";
      ctx.beginPath();
      const s1 = mid(p[1], p[2], 0.62);
      const s2 = mid(p[0], p[3], 0.62);
      ctx.moveTo(s1.x, s1.y);
      ctx.lineTo(s2.x, s2.y);
      ctx.stroke();
      const flash = Math.floor(Date.now() / 160) % 2 == 0;
      const left = mid(mid(p[1], p[2], 0.45), mid(p[0], p[3], 0.45), 0.25);
      const right = mid(mid(p[1], p[2], 0.45), mid(p[0], p[3], 0.45), 0.75);
      for (const { at, on, color } of [{ at: left, on: flash, color: "#ff2b2b" }, { at: right, on: !flash, color: "#2b6bff" }]) {
         ctx.beginPath();
         ctx.fillStyle = on ? color : "rgba(60,60,70,0.8)";
         ctx.arc(at.x, at.y, on ? 7 : 5, 0, Math.PI * 2);
         ctx.fill();
         if (on) {
            ctx.beginPath();
            ctx.fillStyle = color == "#ff2b2b" ? "rgba(255,43,43,0.25)" : "rgba(43,107,255,0.25)";
            ctx.arc(at.x, at.y, 26, 0, Math.PI * 2);
            ctx.fill();
         }
      }
      ctx.restore();
   }
}
