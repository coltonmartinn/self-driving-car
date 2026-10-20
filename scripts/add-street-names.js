// Adds street names (and posted speed limits) to the bundled cities in
// data/cities, without changing their roads: each road piece still knows the
// OpenStreetMap nodes at its ends, so it gets the name and limit of the
// street both of them are on.
// (Cities bundled from now on get names straight from the import.)
//
//   node scripts/add-street-names.js
//
// Map downloads cached by server.js (./cache) are used first; the map
// servers are only asked about cities those don't cover.

const fs = require("node:fs");
const path = require("node:path");
const { loadApp } = require("../tests/helpers/loadApp");

const { Osm } = loadApp();

const DIR = path.join(__dirname, "..", "data", "cities");
const SERVERS = [
   "https://overpass-api.de/api/interpreter",
   "https://overpass.private.coffee/api/interpreter",
   "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
   "https://overpass.kumi.systems/api/interpreter",
];

// node id -> the streets it's on ({ name, limit }), from Overpass ways
function addNames(names, elements) {
   for (const way of elements) {
      if (way.type != "way" || !way.tags || !way.tags.highway) continue;
      const name = way.tags.name || way.tags.ref || null;
      const limit = Osm.speedLimit(way.tags.maxspeed);
      if (!name && !limit) continue;
      const street = { id: way.id, name, limit };
      for (const node of way.nodes) {
         if (!names.has(node)) names.set(node, new Map());
         names.get(node).set(way.id, street);
      }
   }
   return names;
}

function cachedNames() {
   const names = new Map();
   const dir = path.join(__dirname, "..", "cache");
   if (!fs.existsSync(dir)) return names;
   for (const file of fs.readdirSync(dir).filter((f) => f.endsWith(".json"))) {
      try {
         addNames(names, JSON.parse(fs.readFileSync(path.join(dir, file), "utf8")).elements || []);
      } catch (e) {
         // not a map download
      }
   }
   return names;
}

async function namesAround(place) {
   const around = "(around:" + (place.loadRadius || place.radius) + "," + place.lat + "," + place.lon + ")";
   const query = '[out:json][timeout:60];way["highway"]["name"]' + around + ';way["highway"]["ref"]' + around + ';way["highway"]["maxspeed"]' + around + ";out body;";
   for (let attempt = 0; attempt < 8; attempt++) {
      const server = SERVERS[attempt % SERVERS.length];
      const res = await fetch(server, {
         method: "POST",
         headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            "User-Agent": "self-driving-city/1.0 (bundling street names)",
         },
         body: "data=" + encodeURIComponent(query),
      });
      // (a busy server can answer "OK" with nothing in it)
      const json = res.ok ? await res.json().catch(() => null) : null;
      if (json && json.elements.length > 0) {
         return addNames(new Map(), json.elements);
      }
      console.log("  " + new URL(server).host + " busy (" + res.status + "), trying another in 10 s…");
      await new Promise((r) => setTimeout(r, 10000));
   }
   throw new Error("map download failed");
}

async function main() {
   const index = JSON.parse(fs.readFileSync(path.join(DIR, "index.json"), "utf8"));
   const cached = cachedNames();
   for (const city of index) {
      const file = path.join(DIR, city.file);
      const info = JSON.parse(fs.readFileSync(file, "utf8"));
      const covered = info.graph.points.filter((p) => cached.has(p.id)).length > info.graph.points.length * 0.5;
      const names = covered ? cached : await namesAround(info.place);
      const idAt = new Map(info.graph.points.map((p) => [p.x + "," + p.y, p.id]));
      let named = 0;
      let limited = 0;
      for (const seg of info.graph.segments) {
         const a = idAt.get(seg.p1.x + "," + seg.p1.y);
         const b = idAt.get(seg.p2.x + "," + seg.p2.y);
         // the street (OSM way) both ends are on
         const shared = names.has(a) && names.has(b) ? [...names.get(a).values()].filter((w) => names.get(b).has(w.id)) : [];
         const names1 = new Set(shared.map((w) => w.name).filter(Boolean));
         const limits = new Set(shared.map((w) => w.limit).filter(Boolean));
         delete seg.name;
         delete seg.speedLimit;
         if (names1.size == 1) {
            seg.name = [...names1][0];
            named++;
         }
         if (limits.size == 1) {
            seg.speedLimit = [...limits][0];
            limited++;
         }
      }
      if (named == 0) throw new Error("no street names matched for " + city.label);
      fs.writeFileSync(file, JSON.stringify(info));
      console.log(city.label.padEnd(14), named + " of " + info.graph.segments.length + " road pieces named, " + limited + " with a posted limit");
      await new Promise((r) => setTimeout(r, 2000)); // be gentle with the free map server
   }
}

main().catch((e) => {
   console.error(e.message);
   process.exit(1);
});
