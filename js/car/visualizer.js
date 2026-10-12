// Draws the best car's neural network: inputs at the bottom, outputs on top.
// Yellow = positive weight/bias, blue = negative; brightness = strength.
class Visualizer {
   static drawNetwork(ctx, network, inputLabels = []) {
      const margin = 50;
      const sideMargin = 24; // narrower, so 7 inputs fit side by side
      const left = sideMargin;
      const top = margin;
      const width = ctx.canvas.width - sideMargin * 2;
      const height = ctx.canvas.height - margin * 2;

      const levelHeight = height / network.levels.length;

      for (let i = network.levels.length - 1; i >= 0; i--) {
         const levelTop =
            top +
            lerp(
               height - levelHeight,
               0,
               network.levels.length == 1 ? 0.5 : i / (network.levels.length - 1)
            );

         ctx.setLineDash([7, 3]);
         Visualizer.drawLevel(
            ctx,
            network.levels[i],
            left,
            levelTop,
            width,
            levelHeight,
            i == network.levels.length - 1 ? ["↑", "←", "→", "↓"] : [],
            i == 0 ? inputLabels : []
         );
      }
      ctx.setLineDash([]);
   }

   static drawLevel(ctx, level, left, top, width, height, outputLabels, inputLabels = []) {
      const right = left + width;
      const bottom = top + height;

      const { inputs, outputs, weights, biases } = level;

      for (let i = 0; i < inputs.length; i++) {
         for (let j = 0; j < outputs.length; j++) {
            ctx.beginPath();
            ctx.moveTo(Visualizer.#getNodeX(inputs, i, left, right), bottom);
            ctx.lineTo(Visualizer.#getNodeX(outputs, j, left, right), top);
            ctx.lineWidth = 2;
            ctx.strokeStyle = getRGBA(weights[i][j]);
            ctx.stroke();
         }
      }

      // shrink the circles when there are many inputs side by side
      const spacing = width / Math.max(1, Math.max(inputs.length, outputs.length) - 1);
      const nodeRadius = Math.min(18, spacing * 0.42);
      for (let i = 0; i < inputs.length; i++) {
         const x = Visualizer.#getNodeX(inputs, i, left, right);
         ctx.beginPath();
         ctx.arc(x, bottom, nodeRadius, 0, Math.PI * 2);
         ctx.fillStyle = "black";
         ctx.fill();
         ctx.beginPath();
         ctx.arc(x, bottom, nodeRadius * 0.6, 0, Math.PI * 2);
         ctx.fillStyle = getRGBA(inputs[i] || 0);
         ctx.fill();

         if (inputLabels[i]) {
            ctx.textAlign = "center";
            ctx.textBaseline = "top";
            ctx.fillStyle = "#aaa";
            ctx.font = "10px Arial";
            ctx.fillText(inputLabels[i], x, bottom + nodeRadius + 4);
         }
      }

      for (let i = 0; i < outputs.length; i++) {
         const x = Visualizer.#getNodeX(outputs, i, left, right);
         ctx.beginPath();
         ctx.arc(x, top, nodeRadius, 0, Math.PI * 2);
         ctx.fillStyle = "black";
         ctx.fill();
         ctx.beginPath();
         ctx.arc(x, top, nodeRadius * 0.6, 0, Math.PI * 2);
         ctx.fillStyle = getRGBA(outputs[i] || 0);
         ctx.fill();

         ctx.beginPath();
         ctx.lineWidth = 2;
         ctx.arc(x, top, nodeRadius * 0.8, 0, Math.PI * 2);
         ctx.strokeStyle = getRGBA(biases[i]);
         ctx.setLineDash([3, 3]);
         ctx.stroke();
         ctx.setLineDash([]);

         if (outputLabels[i]) {
            ctx.beginPath();
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillStyle = "black";
            ctx.strokeStyle = "white";
            ctx.font = "bold " + nodeRadius * 1.2 + "px Arial";
            ctx.lineWidth = 3;
            ctx.strokeText(outputLabels[i], x, top + 1);
            ctx.fillText(outputLabels[i], x, top + 1);
         }
      }
   }

   static #getNodeX(nodes, index, left, right) {
      return lerp(left, right, nodes.length == 1 ? 0.5 : index / (nodes.length - 1));
   }
}
