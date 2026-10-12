const test = require("node:test");
const assert = require("node:assert/strict");
const { loadApp } = require("./helpers/loadApp");

test("map download asks all servers at once and keeps the first good answer", async () => {
   const aborted = [];
   // server 0 fails fast, server 1 answers after 50 ms, the rest hang until aborted
   const fakeFetch = (url, options) =>
      new Promise((resolve, reject) => {
         const i = calls.push(url) - 1;
         let settled = false;
         const finish = (value) => {
            settled = true;
            resolve(value);
         };
         // like real fetch: cancelling a request that already finished does nothing
         options.signal.addEventListener("abort", () => {
            if (settled) return;
            aborted.push(i);
            reject(new Error("aborted"));
         });
         if (i == 0) {
            finish({ ok: false, status: 504 });
         } else if (i == 1) {
            setTimeout(() => finish({ ok: true, status: 200, json: async () => ({ elements: ["from server 1"] }) }), 50);
         }
      });
   const calls = [];
   const { Places } = loadApp({ globals: { fetch: fakeFetch, AbortController, setTimeout, clearTimeout, URL, Promise } });

   const statuses = [];
   const data = await Places.fetchMapData(40, -75, 300, (s) => statuses.push(s));
   assert.equal(data.elements[0], "from server 1");
   assert.equal(calls.length, Places.OVERPASS_SERVERS.length); // all asked at once
   // the hanging servers were cancelled once server 1 answered
   const hanging = calls.map((_, i) => i).filter((i) => i > 1);
   assert.deepEqual([...aborted].sort(), hanging);
   assert.ok(statuses.some((s) => s.includes("busy")));
});

test("map download explains what to do when every server fails", async () => {
   const fakeFetch = async () => ({ ok: false, status: 504 });
   const { Places } = loadApp({ globals: { fetch: fakeFetch, AbortController, setTimeout, clearTimeout, URL, Promise } });
   await assert.rejects(Places.fetchMapData(40, -75, 300), /node server\.js.*featured cities/s);
});
