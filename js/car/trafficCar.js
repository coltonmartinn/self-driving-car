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
      this.blockedFrames = 0;
      this.ghostFrames = 0;
      this.playerWait = 0; // frames spent waiting on a stopped human driver
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
      // don't make a U-turn unless it's a dead end
      const forward = options.filter((e) => e.to != this.edge.from);
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

      const toTarget = subtract(target, pos);
      const desiredAngle = -angle(toTarget) - Math.PI / 2;
      let diff = desiredAngle - this.angle;
      diff = Math.atan2(Math.sin(diff), Math.cos(diff)); // wrap to -PI..PI

      let targetSpeed = this.cruiseSpeed;
      if (turning > 0.5 || Math.abs(diff) > 0.4) {
         targetSpeed = Math.min(targetSpeed, 1.6); // slow down for corners
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
         if (other == this || (ghost && !other.isPlayer)) continue;
         const rel = new Point(other.x - this.x, other.y - this.y);
         const along = dot(rel, heading);
         if (along <= 0 || along > 160) continue;
         const lateral = Math.abs(rel.x * heading.y - rel.y * heading.x);
         if (lateral > (other.isPlayer ? 45 : 28)) continue;
         const limit = stoppingSpeed(along - 75);
         if (limit < targetSpeed) {
            targetSpeed = limit;
            blocked = true;
            blockedByPlayer = other.isPlayer && Math.abs(other.speed) < 0.1;
         }
      }

      // traffic lights and signs for our direction (only the nearest light
      // counts, like a driver watching the signal at the next stop line)
      const ahead = [];
      for (const m of this.network.controls) {
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
         } else if (m instanceof Yield && gap < 60) {
            targetSpeed = Math.min(targetSpeed, 1.2);
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
}
