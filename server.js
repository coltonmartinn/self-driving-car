// Tiny local server for Self-Driving City (no dependencies, just Node.js).
//
//   node server.js            then open http://localhost:8080
//
// Besides serving the files, it forwards map requests to OpenStreetMap
// services with a proper User-Agent (some servers refuse browser requests),
// and caches downloaded areas in ./cache so reloading a place is instant.

const http = require("http");
const https = require("https");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const PORT = Number(process.env.PORT) || 8080;
const HOST = process.env.HOST || "127.0.0.1"; // set HOST=0.0.0.0 to allow other devices
const ROOT = __dirname;
const CACHE_DIR = path.join(ROOT, "cache");
const USER_AGENT = "SelfDrivingCity/1.0 (educational driving simulator; https://github.com/coltonmartinn/self-driving-car)";

const OVERPASS_SERVERS = [
   "https://overpass-api.de/api/interpreter",
   "https://overpass.private.coffee/api/interpreter",
   "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
   "https://overpass.kumi.systems/api/interpreter",
];

const MIME = {
   ".html": "text/html; charset=utf-8",
   ".js": "text/javascript; charset=utf-8",
   ".css": "text/css; charset=utf-8",
   ".json": "application/json",
   ".png": "image/png",
   ".svg": "image/svg+xml",
   ".ico": "image/x-icon",
};

function request(url, { method = "GET", body = null, timeout = 90000 } = {}) {
   return new Promise((resolve, reject) => {
      const headers = { "User-Agent": USER_AGENT, Accept: "application/json" };
      if (body) {
         headers["Content-Type"] = "application/x-www-form-urlencoded";
         headers["Content-Length"] = Buffer.byteLength(body);
      }
      const req = https.request(url, { method, headers, timeout }, (res) => {
         const chunks = [];
         res.on("data", (c) => chunks.push(c));
         res.on("end", () =>
            resolve({ status: res.statusCode, body: Buffer.concat(chunks) })
         );
      });
      req.on("timeout", () => req.destroy(new Error("timed out")));
      req.on("error", reject);
      if (body) req.write(body);
      req.end();
   });
}

function send(res, status, body, type = "application/json") {
   res.writeHead(status, { "Content-Type": type, "Cache-Control": "no-store" });
   res.end(body);
}

function readBody(req) {
   return new Promise((resolve) => {
      const chunks = [];
      req.on("data", (c) => chunks.push(c));
      req.on("end", () => resolve(Buffer.concat(chunks).toString()));
   });
}

async function handleOverpass(req, res) {
   const body = await readBody(req);
   const key = crypto.createHash("sha1").update(body).digest("hex");
   const cacheFile = path.join(CACHE_DIR, key + ".json");
   if (fs.existsSync(cacheFile)) {
      console.log("map data: from cache");
      return send(res, 200, fs.readFileSync(cacheFile));
   }

   const errors = [];
   for (const url of OVERPASS_SERVERS) {
      const started = Date.now();
      try {
         const r = await request(url, { method: "POST", body });
         const text = r.body.toString();
         if (r.status == 200 && text.trimStart().startsWith("{")) {
            console.log("map data: " + url + " (" + (Date.now() - started) + " ms)");
            fs.mkdirSync(CACHE_DIR, { recursive: true });
            fs.writeFileSync(cacheFile, r.body);
            return send(res, 200, r.body);
         }
         errors.push(new URL(url).host + " " + r.status);
      } catch (e) {
         errors.push(new URL(url).host + " " + e.message);
      }
      console.log("map data: " + errors[errors.length - 1] + ", trying next server");
   }
   send(res, 502, JSON.stringify({ error: "All map servers failed: " + errors.join("; ") }));
}

async function handleSearch(req, res, query) {
   try {
      const url =
         "https://nominatim.openstreetmap.org/search?format=jsonv2&limit=6&q=" +
         encodeURIComponent(query);
      const r = await request(url, { timeout: 15000 });
      send(res, r.status, r.body);
   } catch (e) {
      send(res, 502, JSON.stringify({ error: e.message }));
   }
}

function serveFile(req, res, pathname) {
   if (pathname == "/") pathname = "/index.html";
   const file = path.normalize(path.join(ROOT, decodeURIComponent(pathname)));
   if (!file.startsWith(ROOT) || file.startsWith(CACHE_DIR)) {
      return send(res, 403, "Forbidden", "text/plain");
   }
   fs.readFile(file, (err, data) => {
      if (err) return send(res, 404, "Not found", "text/plain");
      send(res, 200, data, MIME[path.extname(file)] || "application/octet-stream");
   });
}

http
   .createServer(async (req, res) => {
      const url = new URL(req.url, "http://localhost");
      try {
         if (url.pathname == "/api/overpass" && req.method == "POST") {
            return await handleOverpass(req, res);
         }
         if (url.pathname == "/api/health") {
            return send(res, 200, JSON.stringify({ ok: true }));
         }
         if (url.pathname == "/api/search") {
            return await handleSearch(req, res, url.searchParams.get("q") || "");
         }
         serveFile(req, res, url.pathname);
      } catch (e) {
         send(res, 500, JSON.stringify({ error: e.message }));
      }
   })
   .listen(PORT, HOST, () => {
      console.log("Self-Driving City running at http://localhost:" + PORT);
   });
