// Downloads a few real places and saves them as ready-to-drive worlds in
// data/cities/, so the live demo and the trainer work without map servers.
//
//   node server.js            (in another terminal; it does the downloading)
//   node scripts/bundle-cities.js

const fs = require("node:fs");
const path = require("node:path");
const { loadApp } = require("../tests/helpers/loadApp");

const { Places } = loadApp();
const SERVER = process.env.SERVER || "http://localhost:8080";
const OUT = path.join(__dirname, "..", "data", "cities");

const CITIES = [
   { slug: "times-square", query: "Times Square, New York", label: "Times Square", emoji: "🗽" },
   { slug: "paris", query: "Louvre, Paris", label: "Paris", emoji: "🥐" },
   { slug: "beverly-hills", query: "90210", label: "Beverly Hills", emoji: "🌴" },
   { slug: "shibuya", query: "Shibuya Crossing, Tokyo", label: "Shibuya", emoji: "🗼" },
   { slug: "san-francisco", query: "Union Square, San Francisco", label: "San Francisco", emoji: "🌉" },
];
const RADIUS = Places.SIZES.medium;

async function main() {
   fs.mkdirSync(OUT, { recursive: true });
   const index = [];
   for (const city of CITIES) {
      const results = await (await fetch(SERVER + "/api/search?q=" + encodeURIComponent(city.query))).json();
      if (!results.length) throw new Error("no results for " + city.query);
      const place = {
         name: results[0].display_name,
         lat: Number(results[0].lat),
         lon: Number(results[0].lon),
         radius: RADIUS,
      };
      const body = "data=" + encodeURIComponent(Places.buildQuery(place.lat, place.lon, place.radius));
      let data = null;
      for (let attempt = 1; attempt <= 4 && !data; attempt++) {
         const res = await fetch(SERVER + "/api/overpass", {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body,
         });
         if (res.ok) {
            data = await res.json();
         } else {
            console.log("  map servers busy for " + city.label + ", retrying in 30 s…");
            await new Promise((r) => setTimeout(r, 30000));
         }
      }
      if (!data) throw new Error("map download failed for " + city.query);
      const world = Places.buildWorld(data, place);

      const file = city.slug + ".json";
      const json = JSON.stringify(world);
      fs.writeFileSync(path.join(OUT, file), json);
      index.push({ slug: city.slug, label: city.label, emoji: city.emoji, name: place.name, file });
      console.log(
         city.label.padEnd(14),
         (json.length / 1024).toFixed(0).padStart(5) + " KB",
         world.graph.segments.length + " roads,",
         world.buildings.length + " buildings,",
         world.markings.length + " signs/signals"
      );
      // be gentle with the free geocoding service
      await new Promise((r) => setTimeout(r, 1100));
   }
   fs.writeFileSync(path.join(OUT, "index.json"), JSON.stringify(index, null, 2));
}

main().catch((e) => {
   console.error(e.message);
   process.exit(1);
});
