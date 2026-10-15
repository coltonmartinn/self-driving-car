// Runs one generation of learning cars in a world, with traffic and optional
// GPS trips. No drawing and no page access, so the very same code runs in the
// browser (lab.html and drive.html draw it) and headless in Node (scripts/train.js).
class Simulation {
   static DEFAULTS = {
      populationSize: 100,
      trafficCount: 30,
      trafficOn: true,
      strategy: "crossover", // or "mutation" (the original course approach)
      mutation: 0.1,
      parents: 10,
      stuckFrames: 300, // no progress for 5 s = out of this generation
      generationFrames: 60 * 90, // a generation lasts at most 90 s
      gps: true, // false = cars get no GPS hints (for experiments)
      trafficSpeed: null, // [min, max] cruising speed for traffic (default: TrafficCar's own)
      autoArrive: true, // false: reaching the end of the route doesn't end the drive (the page decides)
      pedestrians: false, // people walking across crosswalks (needs js/pedestrians.js)
      playerControls: null, // manual mode: a human's PlayerControls (else the keyboard)
      random: Math.random,
   };

   constructor(world, options = {}) {
      this.options = { ...Simulation.DEFAULTS, ...options };
      this.world = world;
      this.network = new TrafficNetwork(world); // (DrivingSchool spawns an ambulance on it)
      this.adjacency = Pathfinder.buildAdjacency(world.graph);

      // index the road edges so each car only checks the ones near it
      this.borderGrid = new SpatialGrid(250);
      for (const seg of world.roadBorders) {
         this.borderGrid.insert([seg.p1, seg.p2], SpatialGrid.boundsOfSegment(seg.p1, seg.p2));
      }

      this.home = Simulation.findStart(world);
      this.start = this.home;
      this.trip = null; // { route } when the cars have a destination
      this.manual = false;

      this.cars = [];
      this.traffic = [];
      this.parked = []; // vehicles stopped at the side for good (see addParked)
      this.crowd = null; // pedestrians, when options.pedestrians is on
      this.bestCar = null;
      this.frame = 0;
   }

   get isEmpty() {
      return this.world.graph.segments.length == 0;
   }

   get alive() {
      return this.cars.filter((c) => !c.damaged).length;
   }

   // Everything a driver must not hit: traffic, parked vehicles, people
   get others() {
      return [...this.traffic, ...this.parked, ...(this.crowd ? this.crowd.people : [])];
   }

   get arrived() {
      return this.cars.filter((c) => c.arrived).length;
   }

   // The 📍 start marking if there is one, otherwise a decent road near the middle
   static findStart(world) {
      const marking = world.markings.find((m) => m instanceof Start);
      if (marking) {
         const dir = marking.directionVector;
         return { point: marking.center, angle: -angle(dir) - Math.PI / 2 };
      }
      if (world.graph.segments.length == 0) {
         return { point: new Point(0, 0), angle: 0 };
      }
      const center = world.source == "osm"
         ? new Point(0, 0)
         : scale(world.graph.points.reduce((c, p) => add(c, p), new Point(0, 0)), 1 / world.graph.points.length);
      const roads = world.graph.segments.filter((s) => s.length() > world.roadWidth * 2.5);
      const pool = roads.length > 0 ? roads : world.graph.segments;
      let best = pool[0];
      for (const s of pool) {
         if (distance(average(s.p1, s.p2), center) < distance(average(best.p1, best.p2), center)) {
            best = s;
         }
      }
      return Simulation.#laneStart(world, best.p1, best.p2, best, 0.5);
   }

   // A spot in the right-hand lane of the road from a to b, facing b
   static #laneStart(world, a, b, seg, t) {
      const dir = normalize(subtract(b, a));
      let point = lerp2D(a, b, t);
      if (seg && !seg.oneWay) {
         point = add(point, scale(perpendicular(dir), world.roadWidth / 4));
      }
      return { point, angle: -angle(dir) - Math.PI / 2 };
   }

   // ---------- generations ----------

   // brains: one per car (e.g. from breed()), or null for random brains
   startGeneration(brains = null) {
      const player = this.manual ? this.options.playerControls : null;
      const type = player ? "PLAYER" : this.manual ? "KEYS" : "AI";
      const count = this.manual ? 1 : this.options.populationSize;
      this.cars = [];
      for (let i = 0; i < count; i++) {
         const car = new Car(this.start.point.x, this.start.point.y, 30, 50, type, this.start.angle, 4, "#2266dd");
         if (brains && !this.manual) {
            car.brain = brains[i % brains.length];
         }
         if (player) {
            car.controls = player;
         }
         car.isPlayer = this.manual;
         this.cars.push(car);
      }
      this.traffic = this.options.trafficOn && !this.isEmpty ? this.#spawnTraffic() : [];
      this.parked = [];
      this.world.parked = this.parked;
      this.crowd = this.options.pedestrians ? new Crowd(this.world) : null;
      this.world.crowd = this.crowd;
      this.bestCar = this.cars[0];
      this.frame = 0;
      this.world.cars = this.cars;
      this.world.traffic = this.traffic;
      this.world.bestCar = this.bestCar;
   }

   // Brains for the next generation, bred from this one's best cars
   breed() {
      const ranked = [...this.cars].sort((a, b) => b.fitness - a.fitness).map((c) => c.brain);
      return Genetics.nextGeneration(ranked, this.options.populationSize, this.options);
   }

   isOver() {
      return !this.manual && !this.isEmpty &&
         (this.alive == 0 || this.frame > this.options.generationFrames);
   }

   setTrafficOn(on) {
      this.options.trafficOn = on;
      this.traffic = on && !this.isEmpty ? this.#spawnTraffic() : [];
      this.world.traffic = this.traffic;
   }

   // A car's result in human units: meters from the start, or % of the trip
   score(car) {
      return this.trip
         ? Math.min(100, (car.fitness / this.trip.route.length) * 100)
         : car.fitness / Osm.UNITS_PER_METER;
   }

   get scoreUnit() {
      return this.trip ? "%" : "m";
   }

   // ---------- one frame ----------

   step() {
      this.world.update();
      this.frame++;

      // pedestrians cross when there's a gap; traffic stops for them and
      // keeps its distance from a human driver
      const people = this.crowd ? this.crowd.people : [];
      if (this.crowd) {
         this.crowd.update(this.bestCar, [...this.traffic, ...this.parked, ...this.cars], this.trip ? this.trip.route : null);
      }
      const vehicles = this.parked.length > 0 ? [...this.traffic, ...this.parked] : this.traffic;
      const obstacles = people.length > 0 ? [...vehicles, ...people] : vehicles;
      const others = this.manual ? [...obstacles, ...this.cars] : obstacles;
      for (const car of this.traffic) {
         car.update(others);
      }
      // keep traffic around the action: recycle cars that got lost or far away
      if (this.frame % 30 == 0 && this.traffic.length > 0) {
         for (let i = 0; i < this.traffic.length; i++) {
            const t = this.traffic[i];
            if (t.lost || distance(t, this.bestCar) > 3000) {
               const replacement = this.#spawnTrafficCar(this.bestCar, 1000, 2500, this.traffic);
               if (replacement) {
                  this.traffic[i] = replacement;
               }
            }
         }
         // lost cars that couldn't be replaced just leave
         this.traffic = this.traffic.filter((t) => !t.lost);
         this.world.traffic = this.traffic;
      }

      for (const car of this.cars) {
         if (car.damaged || this.isEmpty) {
            continue;
         }
         const borders = [...this.borderGrid.query(SpatialGrid.boundsAround(car, 250))];
         const nearbyTraffic = obstacles.filter(
            (t) => Math.abs(t.x - car.x) < 250 && Math.abs(t.y - car.y) < 250
         );
         car.update(borders, nearbyTraffic);
         if (this.trip) {
            this.#scoreOnRoute(car);
         } else {
            // fitness = how far from the start the car has managed to get
            const d = distance(car, this.start.point);
            if (d > car.fitness + 1) {
               car.fitness = d;
               car.lastImprovement = this.frame;
            } else if (!this.manual && this.frame - car.lastImprovement > this.options.stuckFrames) {
               car.damaged = true; // stuck or going in circles
            }
         }
      }

      this.bestCar = this.cars.reduce((best, car) => (car.fitness > best.fitness ? car : best));
      this.world.bestCar = this.bestCar;
   }

   // Progress along the route is the score. Leaving the route (a wrong turn)
   // or stalling ends the car's run. The GPS inputs tell the brain whether
   // the route ahead bends left or right of where the car is pointing.
   #scoreOnRoute(car) {
      const route = this.trip.route;
      const loc = route.locate(car, car.routeIndex || 0);
      car.routeIndex = loc.index;

      if (loc.progress > car.fitness + 1) {
         car.fitness = loc.progress;
         car.lastImprovement = this.frame;
      } else if (!this.manual && this.frame - car.lastImprovement > this.options.stuckFrames) {
         car.damaged = true;
      }
      if (!this.manual && loc.distance > this.world.roadWidth * 1.2) {
         car.damaged = true; // wrong turn
      }
      if (this.options.autoArrive && loc.progress >= route.length - 40) {
         car.arrived = true;
         car.damaged = true; // done driving
         car.fitness = route.length + (this.options.generationFrames - this.frame); // faster is better
         return;
      }

      const ahead = route.pointAt(loc.progress + 180);
      const desired = -angle(subtract(ahead, car)) - Math.PI / 2;
      let rel = desired - car.angle;
      rel = Math.atan2(Math.sin(rel), Math.cos(rel));
      const clamp = (v) => Math.max(0, Math.min(1, v));
      car.gpsInputs = this.options.gps
         ? [clamp(rel / (Math.PI / 2)), clamp(-rel / (Math.PI / 2))]
         : [0, 0];
   }

   // ---------- trips ----------

   // Route from the home start to `destination` (a graph point). Returns false
   // if it can't be reached. Call startGeneration() afterwards.
   setTrip(destination) {
      const origin = getNearestPoint(this.home.point, this.world.graph.points);
      const path = origin && Pathfinder.shortestPath(this.world.graph, origin, destination, this.adjacency);
      if (!path || path.length < 2) {
         return false;
      }
      const route = new Route(path);
      this.trip = { route };
      this.world.route = route;
      this.world.destination = new Target(destination, new Point(0, -1), this.world.roadWidth / 2, this.world.roadWidth / 2);

      // start on the route's first road, in the right lane, facing along it
      const [a, b] = path;
      const seg = this.world.graph.segments.find((s) => s.includes(a) && s.includes(b));
      this.start = Simulation.#laneStart(this.world, a, b, seg, Math.min(0.5, 60 / distance(a, b)));
      return true;
   }

   // A new route from where `car` is now to the same destination, like a GPS
   // recalculating after a missed turn. Returns false if there's no way.
   reroute(car) {
      if (!this.trip) {
         return false;
      }
      const route = this.trip.route;
      const destination = route.points[route.points.length - 1];
      const heading = new Point(-Math.sin(car.angle), -Math.cos(car.angle));
      const seg = getNearestSegment(car, this.world.graph.segments);
      if (!seg) {
         return false;
      }
      // continue in the direction the car is facing (and that traffic may go)
      const forward = dot(subtract(seg.p2, seg.p1), heading) > 0 ? seg.p2 : seg.p1;
      const backward = forward == seg.p1 ? seg.p2 : seg.p1;
      const canGoForward = !seg.oneWay || forward == seg.p2;
      const start = canGoForward ? forward : backward;
      const path = start == destination
         ? [destination]
         : Pathfinder.shortestPath(this.world.graph, start, destination, this.adjacency);
      if (!path) {
         return false;
      }
      const newRoute = new Route([new Point(car.x, car.y), ...path]);
      this.trip = { route: newRoute };
      this.world.route = newRoute;
      car.routeIndex = 0;
      car.fitness = 0;
      return true;
   }

   clearTrip() {
      this.trip = null;
      this.world.route = null;
      this.world.destination = null;
      this.start = this.home;
   }

   // A reachable destination 150-450 m from the start (if the map allows),
   // inside the area that was picked (not out in the margin around it)
   randomDestination() {
      const points = this.world.graph.points;
      const origin = getNearestPoint(this.home.point, points);
      if (!origin) return null;
      const area = this.world.getAreaRadius() * 0.9;
      const candidates = points.filter((p) => {
         const d = distance(p, origin);
         return d > 1500 && d < 4500 && Math.hypot(p.x, p.y) < area;
      });
      const pool = candidates.length > 0 ? candidates : points;
      for (let tries = 0; tries < 25; tries++) {
         const dest = pool[Math.floor(this.options.random() * pool.length)];
         if (dest != origin && Pathfinder.shortestPath(this.world.graph, origin, dest, this.adjacency)) {
            return dest;
         }
      }
      return null;
   }

   // A vehicle stopped for good at `point`, facing `heading` (radians),
   // e.g. a delivery truck double-parked in the lane, or cars at the curb
   addParked(point, angle, { width = 30, height = 50, color = "#9aa3ad", hazardLights = false } = {}) {
      const car = new Car(point.x, point.y, width, height, "DUMMY", angle, 0, color);
      car.controls.forward = false;
      car.isParked = true;
      car.hazardLights = hazardLights;
      this.parked.push(car);
      this.world.parked = this.parked;
      return car;
   }

   // ---------- traffic ----------

   #spawnTraffic() {
      const list = [];
      for (let i = 0; i < this.options.trafficCount; i++) {
         const car = this.#spawnTrafficCar(this.start.point, 350, 2500, list);
         if (car) {
            list.push(car);
         }
      }
      return list;
   }

   #spawnTrafficCar(around, minDist, maxDist, others) {
      for (let tries = 0; tries < 10; tries++) {
         const edge = this.network.randomEdgeNear(around, minDist, maxDist);
         if (!edge) {
            return null;
         }
         const car = new TrafficCar(this.network, edge);
         if (this.options.trafficSpeed) {
            const [min, max] = this.options.trafficSpeed;
            car.cruiseSpeed = lerp(min, max, Math.random());
            car.maxSpeed = car.cruiseSpeed + 0.5;
            car.speed = car.cruiseSpeed * 0.7;
         }
         if (others.every((o) => distance(o, car) > 90)) {
            return car;
         }
      }
      return null;
   }
}
