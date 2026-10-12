// Builds random road networks and decorates them with sensible markings
const WorldGenerator = {
   // A jittered grid of intersections. A random spanning tree guarantees every
   // road is reachable; extra grid roads (and a few diagonals) make loops.
   generateGraph({
      minSize = 3,
      maxSize = 5,
      spacing = 600,
      jitter = 100,
      extraRoadChance = 0.55,
      diagonalChance = 0.1,
   } = {}) {
      const randInt = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
      const rand = (a, b) => lerp(a, b, Math.random());

      const cols = randInt(minSize, maxSize);
      const rows = randInt(minSize, maxSize);

      const grid = [];
      const points = [];
      for (let r = 0; r < rows; r++) {
         grid[r] = [];
         for (let c = 0; c < cols; c++) {
            const p = new Point(
               Math.round(c * spacing + rand(-jitter, jitter)),
               Math.round(r * spacing + rand(-jitter, jitter))
            );
            grid[r][c] = p;
            points.push(p);
         }
      }

      const candidates = [];
      const diagonals = [];
      for (let r = 0; r < rows; r++) {
         for (let c = 0; c < cols; c++) {
            if (c + 1 < cols) candidates.push([grid[r][c], grid[r][c + 1]]);
            if (r + 1 < rows) candidates.push([grid[r][c], grid[r + 1][c]]);
            // at most one diagonal per cell, so diagonals never cross each other
            if (r + 1 < rows && c + 1 < cols && Math.random() < diagonalChance) {
               diagonals.push(
                  Math.random() < 0.5
                     ? [grid[r][c], grid[r + 1][c + 1]]
                     : [grid[r][c + 1], grid[r + 1][c]]
               );
            }
         }
      }

      // Randomized Kruskal: union-find over points
      const parent = new Map(points.map((p) => [p, p]));
      const find = (p) => {
         while (parent.get(p) != p) {
            parent.set(p, parent.get(parent.get(p)));
            p = parent.get(p);
         }
         return p;
      };

      WorldGenerator.shuffle(candidates);
      const segments = [];
      for (const [a, b] of candidates) {
         const rootA = find(a);
         const rootB = find(b);
         if (rootA != rootB) {
            parent.set(rootA, rootB);
            segments.push(new Segment(a, b));
         } else if (Math.random() < extraRoadChance) {
            segments.push(new Segment(a, b));
         }
      }
      for (const [a, b] of diagonals) {
         segments.push(new Segment(a, b));
      }

      return { points, segments };
   },

   // Needs world.generate() to have run first
   generateMarkings(world) {
      const graph = world.graph;
      const rw = world.roadWidth;
      const lane = rw / 2;
      const markings = [];

      // shift from the road center into the right-hand lane
      const toLane = (center, dir) => add(center, scale(perpendicular(dir), rw / 4));

      const neighbors = WorldGenerator.getNeighbors(graph);

      // Signs / lights on every road entering an intersection
      for (const p of graph.points) {
         const ns = neighbors.get(p) || [];
         if (ns.length < 3) {
            continue;
         }
         let kind;
         if (ns.length >= 4) {
            kind = Math.random() < 0.6 ? "light" : "stop";
         } else {
            kind = Math.random() < 0.5 ? "stop" : "yield";
         }
         for (const { point: q, seg } of ns) {
            const marking = WorldGenerator.approachMarking(world, p, q, seg, kind);
            if (marking) {
               markings.push(marking);
            }
         }
      }

      // Mid-block markings, each on its own road
      const roads = WorldGenerator.shuffle(
         graph.segments.filter((s) => s.length() > rw * 3)
      );
      if (roads.length == 0) {
         return markings;
      }

      const startRoad = roads.shift();
      const startDir = startRoad.directionVector();
      const startCenter = average(startRoad.p1, startRoad.p2);
      markings.push(new Start(toLane(startCenter, startDir), startDir, lane, lane));

      if (roads.length > 0) {
         // target on the road farthest from the start
         let targetIndex = 0;
         for (let i = 1; i < roads.length; i++) {
            const d = (s) => distance(average(s.p1, s.p2), startCenter);
            if (d(roads[i]) > d(roads[targetIndex])) {
               targetIndex = i;
            }
         }
         const targetRoad = roads.splice(targetIndex, 1)[0];
         const targetDir = targetRoad.directionVector();
         markings.push(
            new Target(toLane(average(targetRoad.p1, targetRoad.p2), targetDir), targetDir, lane, lane)
         );
      }

      for (const road of roads) {
         const dir = road.directionVector();
         const roll = Math.random();
         if (roll < 0.3 && road.length() > rw * 4) {
            markings.push(new Crossing(average(road.p1, road.p2), dir, rw, rw / 2));
         } else if (roll < 0.5) {
            const spot = lerp2D(road.p1, road.p2, 0.5);
            markings.push(new Parking(toLane(spot, dir), dir, lane, lane));
         }
      }

      return markings;
   },

   // point -> [{ point: neighbor, seg }]
   getNeighbors(graph) {
      const neighbors = new Map();
      for (const seg of graph.segments) {
         if (!neighbors.has(seg.p1)) neighbors.set(seg.p1, []);
         if (!neighbors.has(seg.p2)) neighbors.set(seg.p2, []);
         neighbors.get(seg.p1).push({ point: seg.p2, seg });
         neighbors.get(seg.p2).push({ point: seg.p1, seg });
      }
      return neighbors;
   },

   // A sign or light for traffic driving from q towards intersection p.
   // Returns null if the road is too short or one-way in the other direction.
   approachMarking(world, p, q, seg, kind) {
      const rw = world.roadWidth;
      const lane = rw / 2;
      if (distance(p, q) < rw * 2.5) {
         return null;
      }
      if (seg.oneWay && seg.p2 != p) {
         return null; // nobody drives this way on a one-way street
      }
      const dir = normalize(subtract(p, q)); // driving towards p
      let center = subtract(p, scale(dir, rw / 2 + 30));
      if (!seg.oneWay) {
         center = add(center, scale(perpendicular(dir), rw / 4)); // right lane
      }
      switch (kind) {
         case "light":
            return new Light(center, dir, lane, lane);
         case "stop":
            return new Stop(center, dir, lane, lane);
         case "yield":
            return new Yield(center, dir, lane, lane);
      }
      return null;
   },

   shuffle(array) {
      for (let i = array.length - 1; i > 0; i--) {
         const j = Math.floor(Math.random() * (i + 1));
         [array[i], array[j]] = [array[j], array[i]];
      }
      return array;
   },
};
