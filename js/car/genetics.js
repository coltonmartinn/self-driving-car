// Builds the next generation of brains from the best ones of this generation.
//
// "mutation": the original approach from the course. Every car gets a copy
//             of the single best brain, slightly mutated (except one exact copy).
// "crossover": elitism + crossover. The best brain survives unchanged, and
//             the other cars are children of two parents picked from the top
//             performers, mixing their weights before mutating.
const Genetics = {
   clone(brain) {
      return JSON.parse(JSON.stringify(brain));
   },

   // Uniform crossover: each weight and bias comes from one parent or the other
   crossover(a, b, random = Math.random) {
      const child = Genetics.clone(a);
      child.levels.forEach((level, l) => {
         const other = b.levels[l];
         for (let i = 0; i < level.biases.length; i++) {
            if (random() < 0.5) level.biases[i] = other.biases[i];
         }
         for (let i = 0; i < level.weights.length; i++) {
            for (let j = 0; j < level.weights[i].length; j++) {
               if (random() < 0.5) level.weights[i][j] = other.weights[i][j];
            }
         }
      });
      return child;
   },

   // rankedBrains: best first. Returns `count` brains for the next generation.
   nextGeneration(rankedBrains, count, { strategy = "crossover", mutation = 0.1, parents = 10, random = Math.random } = {}) {
      const best = rankedBrains[0];
      const brains = [Genetics.clone(best)]; // elitism: the champion survives as-is

      if (strategy == "mutation") {
         while (brains.length < count) {
            const brain = Genetics.clone(best);
            NeuralNetwork.mutate(brain, mutation);
            brains.push(brain);
         }
         return brains;
      }

      const pool = rankedBrains.slice(0, Math.max(2, Math.min(parents, rankedBrains.length)));
      // rank-weighted pick: the best parent is chosen most often
      const pick = () => pool[Math.floor(Math.pow(random(), 2) * pool.length)];
      while (brains.length < count) {
         const child = Genetics.crossover(pick(), pick(), random);
         NeuralNetwork.mutate(child, mutation);
         brains.push(child);
      }
      return brains;
   },
};
