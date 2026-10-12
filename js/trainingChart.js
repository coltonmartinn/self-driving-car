// Line chart of how each generation did: the best car and the average car.
// Canvas-drawn, with a legend, direct end labels, a hover crosshair/tooltip,
// and a hidden table so the numbers are available to screen readers too.
class TrainingChart {
   // dark chart surface + two categorical slots, validated together
   // (lightness band, chroma, colorblind separation, contrast)
   static COLORS = {
      surface: "#1a1a19",
      textPrimary: "#ffffff",
      textSecondary: "#c3c2b7",
      grid: "rgba(255,255,255,0.08)",
      best: "#3987e5",
      average: "#d95926",
   };

   constructor(canvas, table) {
      this.canvas = canvas;
      this.table = table;
      this.ctx = canvas.getContext("2d");
      this.history = [];
      this.unit = "m";
      this.hoverIndex = null;

      // crisp lines on high-DPI screens
      const dpr = window.devicePixelRatio || 1;
      this.width = canvas.clientWidth || 280;
      this.height = canvas.clientHeight || 150;
      canvas.width = this.width * dpr;
      canvas.height = this.height * dpr;
      this.ctx.scale(dpr, dpr);

      this.plot = { left: 40, right: this.width - 46, top: 34, bottom: this.height - 22 };

      canvas.addEventListener("mousemove", (evt) => {
         this.hoverIndex = this.#indexAt(evt.offsetX);
         this.draw();
      });
      canvas.addEventListener("mouseleave", () => {
         this.hoverIndex = null;
         this.draw();
      });
      this.draw();
   }

   reset(unit) {
      this.history = [];
      this.unit = unit;
      this.hoverIndex = null;
      this.draw();
   }

   add(generation, best, average) {
      this.history.push({ generation, best, average });
      this.draw();
   }

   #x(i) {
      const n = this.history.length;
      const { left, right } = this.plot;
      return n <= 1 ? (left + right) / 2 : left + ((right - left) * i) / (n - 1);
   }

   #y(value) {
      const { top, bottom } = this.plot;
      return bottom - (value / this.#maxValue()) * (bottom - top);
   }

   #maxValue() {
      const max = Math.max(1, ...this.history.map((h) => h.best));
      // round up to a tidy number so gridlines land on clean values
      const magnitude = Math.pow(10, Math.floor(Math.log10(max)));
      const steps = [1, 2, 2.5, 5, 10];
      return steps.map((s) => s * magnitude).find((v) => v >= max);
   }

   #indexAt(px) {
      if (this.history.length == 0) return null;
      let best = 0;
      for (let i = 1; i < this.history.length; i++) {
         if (Math.abs(this.#x(i) - px) < Math.abs(this.#x(best) - px)) best = i;
      }
      return best;
   }

   #format(value) {
      return Math.round(value) + (this.unit == "%" ? "%" : " m");
   }

   draw() {
      const ctx = this.ctx;
      const C = TrainingChart.COLORS;
      const { left, right, top, bottom } = this.plot;

      ctx.clearRect(0, 0, this.width, this.height);
      ctx.fillStyle = C.surface;
      ctx.beginPath();
      ctx.roundRect(0, 0, this.width, this.height, 10);
      ctx.fill();

      // title + legend
      ctx.textBaseline = "alphabetic";
      ctx.textAlign = "left";
      ctx.fillStyle = C.textPrimary;
      ctx.font = "600 12px sans-serif";
      ctx.fillText("Training progress", 10, 18);
      this.#legendItem(this.width - 118, 14, C.best, "best");
      this.#legendItem(this.width - 70, 14, C.average, "average");

      if (this.history.length == 0) {
         ctx.fillStyle = C.textSecondary;
         ctx.font = "12px sans-serif";
         ctx.textAlign = "center";
         ctx.fillText("Appears after the first generation", this.width / 2, (top + bottom) / 2 + 4);
         this.#updateTable();
         return;
      }

      // recessive gridlines + y labels
      const max = this.#maxValue();
      ctx.font = "10px sans-serif";
      ctx.textAlign = "right";
      ctx.textBaseline = "middle";
      for (let k = 0; k <= 2; k++) {
         const value = (max * k) / 2;
         const y = this.#y(value);
         ctx.strokeStyle = C.grid;
         ctx.lineWidth = 1;
         ctx.beginPath();
         ctx.moveTo(left, y);
         ctx.lineTo(right, y);
         ctx.stroke();
         ctx.fillStyle = C.textSecondary;
         ctx.fillText(this.#format(value), left - 4, y);
      }

      // x labels: first and last generation
      ctx.textBaseline = "top";
      ctx.textAlign = "left";
      ctx.fillText("gen " + this.history[0].generation, left, bottom + 6);
      if (this.history.length > 1) {
         ctx.textAlign = "right";
         ctx.fillText("gen " + this.history[this.history.length - 1].generation, right, bottom + 6);
      }

      this.#line("average", C.average);
      this.#line("best", C.best);

      // direct labels at the line ends (text in text color, mark carries identity)
      const last = this.history.length - 1;
      const yBest = this.#y(this.history[last].best);
      let yAvg = this.#y(this.history[last].average);
      if (Math.abs(yAvg - yBest) < 12) yAvg = yBest + 12; // keep labels apart
      ctx.font = "10px sans-serif";
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      ctx.fillStyle = C.textPrimary;
      ctx.fillText(this.#format(this.history[last].best), right + 7, yBest);
      ctx.fillStyle = C.textSecondary;
      ctx.fillText(this.#format(this.history[last].average), right + 7, yAvg);

      if (this.hoverIndex != null) {
         this.#tooltip(this.hoverIndex);
      }
      this.#updateTable();
   }

   #legendItem(x, y, color, label) {
      const ctx = this.ctx;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(x, y - 4, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = TrainingChart.COLORS.textSecondary;
      ctx.font = "11px sans-serif";
      ctx.textAlign = "left";
      ctx.fillText(label, x + 8, y);
   }

   #line(key, color) {
      const ctx = this.ctx;
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.lineJoin = "round";
      ctx.lineCap = "round";
      ctx.beginPath();
      this.history.forEach((h, i) => {
         const x = this.#x(i);
         const y = this.#y(h[key]);
         if (i == 0) ctx.moveTo(x, y);
         else ctx.lineTo(x, y);
      });
      ctx.stroke();

      // end marker with a surface ring so it stands off the other line
      const last = this.history.length - 1;
      ctx.beginPath();
      ctx.arc(this.#x(last), this.#y(this.history[last][key]), 4, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = TrainingChart.COLORS.surface;
      ctx.stroke();
   }

   #tooltip(i) {
      const ctx = this.ctx;
      const C = TrainingChart.COLORS;
      const h = this.history[i];
      const x = this.#x(i);

      ctx.strokeStyle = "rgba(255,255,255,0.35)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x, this.plot.top);
      ctx.lineTo(x, this.plot.bottom);
      ctx.stroke();

      const lines = [
         ["Generation " + h.generation, null],
         ["best " + this.#format(h.best), C.best],
         ["average " + this.#format(h.average), C.average],
      ];
      const boxW = 118;
      const boxH = 50;
      const boxX = x + boxW + 8 > this.width ? x - boxW - 8 : x + 8;
      const boxY = this.plot.top;
      ctx.fillStyle = "rgba(10,10,10,0.92)";
      ctx.strokeStyle = "#444";
      ctx.beginPath();
      ctx.roundRect(boxX, boxY, boxW, boxH, 6);
      ctx.fill();
      ctx.stroke();
      ctx.font = "11px sans-serif";
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      lines.forEach(([text, color], k) => {
         const ly = boxY + 10 + k * 15;
         if (color) {
            ctx.fillStyle = color;
            ctx.beginPath();
            ctx.arc(boxX + 10, ly, 3.5, 0, Math.PI * 2);
            ctx.fill();
         }
         ctx.fillStyle = k == 0 ? C.textPrimary : C.textSecondary;
         ctx.fillText(text, boxX + (color ? 18 : 8), ly);
      });
   }

   #updateTable() {
      if (!this.table) return;
      const rows = this.history
         .map((h) => "<tr><td>" + h.generation + "</td><td>" + this.#format(h.best) + "</td><td>" + this.#format(h.average) + "</td></tr>")
         .join("");
      this.table.innerHTML =
         "<caption>Training progress per generation</caption>" +
         "<tr><th>Generation</th><th>Best</th><th>Average</th></tr>" + rows;
   }
}
