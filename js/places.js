// Find real places and turn them into worlds, using free OpenStreetMap services:
//  - Nominatim (or Photon as a backup) to turn "city / zip / address" into lat, lon
//  - Overpass to download the roads, buildings and signs around that point
// When the page is served by server.js, requests go through it (it can send a
// proper User-Agent and caches downloads); otherwise (e.g. the GitHub Pages
// demo) we call the services directly.
const Places = {
   // workers need http(s); browsers block them on file:// pages
   canUseWorker: typeof location != "undefined" && location.protocol.startsWith("http"),
   serverCheck: null,

   // Is server.js behind this page? (asked once)
   hasServer() {
      if (!Places.serverCheck) {
         Places.serverCheck = Places.canUseWorker
            ? Places.fetchWithTimeout("api/health", {}, 3000)
                 .then((res) => res.ok)
                 .catch(() => false)
            : Promise.resolve(false);
      }
      return Places.serverCheck;
   },

   OVERPASS_SERVERS: [
      "https://overpass-api.de/api/interpreter",
      "https://overpass.private.coffee/api/interpreter",
      "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
      "https://overpass.kumi.systems/api/interpreter",
   ],

   SIZES: {
      small: 300, // radius in meters
      medium: 500,
      large: 800,
   },

   async search(query) {
      if (await Places.hasServer()) {
         try {
            const res = await Places.fetchWithTimeout("api/search?q=" + encodeURIComponent(query), {}, 20000);
            if (res.ok) {
               const results = await res.json();
               return results.map((r) => ({
                  name: r.display_name,
                  lat: Number(r.lat),
                  lon: Number(r.lon),
               }));
            }
         } catch (e) {
            // fall through to calling the services directly
         }
      }
      try {
         const url =
            "https://nominatim.openstreetmap.org/search?format=jsonv2&limit=6&q=" +
            encodeURIComponent(query);
         const res = await Places.fetchWithTimeout(url, {}, 15000);
         if (!res.ok) throw new Error("Nominatim " + res.status);
         const results = await res.json();
         return results.map((r) => ({
            name: r.display_name,
            lat: Number(r.lat),
            lon: Number(r.lon),
         }));
      } catch (e) {
         // backup geocoder
         const url = "https://photon.komoot.io/api/?limit=6&q=" + encodeURIComponent(query);
         const res = await Places.fetchWithTimeout(url, {}, 15000);
         if (!res.ok) throw new Error("Could not reach the place search service");
         const json = await res.json();
         return json.features.map((f) => {
            const p = f.properties;
            const parts = [p.name, p.street, p.city, p.state, p.postcode, p.country];
            return {
               name: [...new Set(parts.filter(Boolean))].join(", "),
               lat: f.geometry.coordinates[1],
               lon: f.geometry.coordinates[0],
            };
         });
      }
   },

   buildQuery(lat, lon, radius) {
      const around = "(around:" + radius + "," + lat + "," + lon + ")";
      const drivable = [...Osm.DRIVABLE].join("|");
      return (
         "[out:json][timeout:60];" +
         "(" +
         'way["highway"~"^(' + drivable + ')$"]' + around + ";" +
         'way["building"]' + around + ";" +
         ");" +
         "out body;>;out body qt;"
      );
   },

   async fetchMapData(lat, lon, radius, onStatus = () => {}) {
      const body = "data=" + encodeURIComponent(Places.buildQuery(lat, lon, radius));
      if (await Places.hasServer()) {
         // the server tries every map server in turn, so allow plenty of time
         const res = await Places.fetchWithTimeout(
            "api/overpass",
            {
               method: "POST",
               headers: { "Content-Type": "application/x-www-form-urlencoded" },
               body,
            },
            6 * 60000
         );
         if (!res.ok) {
            let message = "Map download failed (" + res.status + ")";
            try {
               message = (await res.json()).error;
            } catch (e) {}
            throw new Error(message + ". Try again in a minute.");
         }
         return await res.json();
      }
      let lastError = null;
      for (let i = 0; i < Places.OVERPASS_SERVERS.length; i++) {
         const url = Places.OVERPASS_SERVERS[i];
         if (i > 0) {
            onStatus("Map server busy, trying another one (" + (i + 1) + "/" + Places.OVERPASS_SERVERS.length + ")…");
         }
         try {
            const res = await Places.fetchWithTimeout(
               url,
               {
                  method: "POST",
                  headers: { "Content-Type": "application/x-www-form-urlencoded" },
                  body,
               },
               90000
            );
            if (!res.ok) throw new Error(url + " answered " + res.status);
            return await res.json();
         } catch (e) {
            lastError = e;
         }
      }
      throw new Error(
         "Couldn't download the map (" + lastError.message + "). " +
            "Map servers often refuse requests straight from a browser: start the app with " +
            "'node server.js' (or double-click start.bat) and open http://localhost:8080."
      );
   },

   // place = { name, lat, lon, radius }
   buildWorld(data, place) {
      const parsed = Osm.parse(data, {
         lat0: place.lat,
         lon0: place.lon,
         radius: place.radius,
      });
      if (parsed.segments.length == 0) {
         throw new Error("No drivable roads found there. Try a different place or a bigger area.");
      }

      const world = new World(new Graph());
      world.graph = new Graph(parsed.points, parsed.segments);
      world.source = "osm";
      world.place = place;
      world.buildings = parsed.buildings;
      world.generateRoads();
      world.generateItems();
      world.markings = Osm.createMarkings(world, parsed.features);
      world.zoom = 2;
      world.offset = new Point(0, 0);
      return world;
   },

   async loadPlace(place, onStatus = () => {}) {
      onStatus("Downloading roads and buildings around " + Places.shortName(place.name) + "…");
      const data = await Places.fetchMapData(place.lat, place.lon, place.radius, onStatus);
      onStatus("Building the city…");
      return Places.buildWorldInBackground(data, place);
   },

   // Runs buildWorld in a Web Worker so the page stays smooth. Browsers don't
   // allow workers on file:// pages, so then it falls back to the main thread.
   async buildWorldInBackground(data, place) {
      return Places.inBackground({ data, place }, () => Places.buildWorld(data, place));
   },

   // Loads one of the ready-made cities in data/cities (no map servers needed)
   async loadBundledCity(file) {
      const res = await Places.fetchWithTimeout("data/cities/" + file, {}, 30000);
      if (!res.ok) throw new Error("Couldn't load " + file + " (" + res.status + ")");
      const info = await res.json();
      return Places.inBackground({ info }, () => World.load(info));
   },

   async inBackground(message, fallback) {
      if (typeof Worker != "undefined" && Places.canUseWorker) {
         try {
            const info = await new Promise((resolve, reject) => {
               const worker = new Worker("js/worldWorker.js");
               worker.onmessage = (evt) => {
                  worker.terminate();
                  if (evt.data.ok) resolve(evt.data.info);
                  else reject(new Error(evt.data.error));
               };
               worker.onerror = (evt) => {
                  worker.terminate();
                  reject(new Error(evt.message || "worker failed"));
               };
               worker.postMessage(message);
            });
            Places.lastBuildUsedWorker = true;
            return World.load(info);
         } catch (e) {
            if (e.message.startsWith("No drivable roads")) throw e;
            console.warn("Background build failed, building on the page instead:", e);
         }
      }
      Places.lastBuildUsedWorker = false;
      // let the browser paint the loading message before the heavy work
      await new Promise((resolve) => setTimeout(resolve, 50));
      return fallback();
   },

   shortName(name) {
      return name.split(",").slice(0, 2).join(",");
   },

   async fetchWithTimeout(url, options, ms) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), ms);
      try {
         return await fetch(url, { ...options, signal: controller.signal });
      } finally {
         clearTimeout(timer);
      }
   },
};
