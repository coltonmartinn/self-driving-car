// Summarizes the training experiments in docs/experiments/*.csv into
// docs/experiments/README.md, with a chart (light + dark SVG).
//
//   node scripts/analyze-experiments.js

const fs = require("node:fs");
const path = require("node:path");

const DIR = path.join(__dirname, "..", "docs", "experiments");

// color slots validated together for both themes (contrast + colorblind)
const SETUPS = [
   { key: "multitrip-gps", label: "Crossover, 3 trips/gen", short: "3 trips/gen", light: "#2a78d6", dark: "#3987e5" },
   { key: "crossover-gps", label: "Crossover, 1 trip/gen", short: "1 trip/gen", light: "#eb6834", dark: "#d95926" },
   { key: "mutation-gps", label: "Mutation only (course method)", short: "mutation only", light: "#1baf7a", dark: "#199e70" },
   { key: "crossover-nogps", label: "No GPS inputs", short: "no GPS", light: "#eda100", dark: "#c98500" },
];

const THEMES = {
   light: { surface: "#fcfcfb", text: "#0b0b0b", muted: "#52514e", grid: "#e6e5e0" },
   dark: { surface: "#1a1a19", text: "#ffffff", muted: "#c3c2b7", grid: "#333331" },
};

function readCsv(file) {
   const [header, ...lines] = fs.readFileSync(file, "utf8").trim().split(/\r?\n/);
   const cols = header.split(",");
   return lines.map((line) => {
      const values = line.split(",");
      return Object.fromEntries(cols.map((c, i) => [c, values[i]]));
   });
}

const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;

function loadSetup(setup) {
   const files = fs.readdirSync(DIR).filter((f) => f.startsWith(setup.key + "-seed") && f.endsWith(".csv"));
   const runs = files.map((f) => readCsv(path.join(DIR, f)));
   if (runs.length == 0) return null;
   const generations = Math.min(...runs.map((r) => r.length));

   // evaluation points (every 10 generations), averaged across seeds
   const evalGens = runs[0]
      .filter((row, i) => i < generations && row.eval_completion_pct !== "")
      .map((row) => Number(row.generation));
   const points = evalGens.map((gen) => {
      const rows = runs.map((r) => r.find((row) => Number(row.generation) == gen));
      return {
         gen,
         completion: mean(rows.map((r) => Number(r.eval_completion_pct))),
         arrival: mean(rows.map((r) => Number(r.eval_arrival_pct))),
      };
   });
   const last3 = points.slice(-3);
   // the checkpoint each run would ship: most arrivals, then most completion
   const checkpoints = runs.map((r) => {
      const evals = r.filter((row) => row.eval_completion_pct !== "");
      return evals.reduce((best, row) => {
         const a = Number(row.eval_arrival_pct);
         const c = Number(row.eval_completion_pct);
         return a > best.arrival || (a == best.arrival && c > best.completion) ? { arrival: a, completion: c } : best;
      }, { arrival: -1, completion: -1 });
   });
   return {
      ...setup,
      seeds: runs.length,
      generations,
      points,
      final: {
         completion: mean(last3.map((p) => p.completion)),
         arrival: mean(last3.map((p) => p.arrival)),
      },
      checkpoint: {
         arrival: mean(checkpoints.map((c) => c.arrival)),
         completion: mean(checkpoints.map((c) => c.completion)),
         perSeed: checkpoints.map((c) => c.arrival.toFixed(0) + "%").join(" / "),
      },
   };
}

function chartSvg(results, themeName) {
   const T = THEMES[themeName];
   const W = 760;
   const H = 380;
   const plot = { left: 56, right: W - 150, top: 76, bottom: H - 48 };
   const maxGen = Math.max(...results.map((r) => r.points[r.points.length - 1].gen));
   const maxY = Math.max(10, Math.ceil(Math.max(...results.flatMap((r) => r.points.map((p) => p.completion))) / 10) * 10);
   const x = (g) => plot.left + (g / maxGen) * (plot.right - plot.left);
   const y = (v) => plot.bottom - (v / maxY) * (plot.bottom - plot.top);
   const parts = [];

   parts.push(`<rect width="${W}" height="${H}" rx="12" fill="${T.surface}"/>`);
   parts.push(`<text x="24" y="30" font-size="16" font-weight="600" fill="${T.text}">Held-out route completion during training</text>`);
   parts.push(`<text x="24" y="48" font-size="12" fill="${T.muted}">Champion brain on 15 fixed trips it never trained on · mean of ${results[0].seeds} seeds</text>`);

   for (let v = 0; v <= maxY; v += 10) {
      parts.push(`<line x1="${plot.left}" x2="${plot.right}" y1="${y(v)}" y2="${y(v)}" stroke="${T.grid}" stroke-width="1"/>`);
      parts.push(`<text x="${plot.left - 8}" y="${y(v) + 4}" font-size="11" text-anchor="end" fill="${T.muted}">${v}%</text>`);
   }
   for (let g = 0; g <= maxGen; g += 50) {
      parts.push(`<text x="${x(g)}" y="${plot.bottom + 18}" font-size="11" text-anchor="middle" fill="${T.muted}">${g}</text>`);
   }
   parts.push(`<text x="${(plot.left + plot.right) / 2}" y="${H - 10}" font-size="12" text-anchor="middle" fill="${T.muted}">generation</text>`);

   // lines, then end labels nudged apart so they don't collide
   const ends = [];
   for (const r of results) {
      const color = r[themeName];
      const d = r.points.map((p, i) => (i ? "L" : "M") + x(p.gen).toFixed(1) + " " + y(p.completion).toFixed(1)).join(" ");
      parts.push(`<path d="${d}" fill="none" stroke="${color}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>`);
      const last = r.points[r.points.length - 1];
      parts.push(`<circle cx="${x(last.gen)}" cy="${y(last.completion)}" r="4" fill="${color}" stroke="${T.surface}" stroke-width="2"/>`);
      ends.push({ r, yy: y(last.completion), value: last.completion });
   }
   ends.sort((a, b) => a.yy - b.yy);
   for (let i = 1; i < ends.length; i++) {
      ends[i].yy = Math.max(ends[i].yy, ends[i - 1].yy + 15);
   }
   for (const e of ends) {
      parts.push(`<circle cx="${plot.right + 14}" cy="${e.yy - 4}" r="4" fill="${e.r[themeName]}"/>`);
      parts.push(`<text x="${plot.right + 22}" y="${e.yy}" font-size="11" fill="${T.text}">${e.r.short} ${e.value.toFixed(0)}%</text>`);
   }

   return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" font-family="-apple-system, Segoe UI, Helvetica, Arial, sans-serif" role="img" aria-label="Line chart of held-out route completion per generation for each training setup">\n${parts.join("\n")}\n</svg>\n`;
}

const results = SETUPS.map(loadSetup).filter(Boolean);
fs.writeFileSync(path.join(DIR, "chart-light.svg"), chartSvg(results, "light"));
fs.writeFileSync(path.join(DIR, "chart-dark.svg"), chartSvg(results, "dark"));

const table = [
   "| Setup | Seeds | Gens | Route completed, mean of last 3 evals | Arrived, mean of last 3 evals | Best checkpoint: arrived | Best checkpoint: route | Best checkpoint arrivals per seed |",
   "| --- | --- | --- | --- | --- | --- | --- | --- |",
   ...results.map((r) =>
      `| ${r.label} | ${r.seeds} | ${r.generations} | ${r.final.completion.toFixed(0)}% | ${r.final.arrival.toFixed(0)}% | ` +
      `${r.checkpoint.arrival.toFixed(0)}% | ${r.checkpoint.completion.toFixed(0)}% | ${r.checkpoint.perSeed} |`
   ),
].join("\n");

console.log(table);
fs.writeFileSync(path.join(DIR, "results-table.md"), table + "\n");
