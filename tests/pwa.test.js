// The offline app must save every file the pages load, or it breaks offline
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.join(__dirname, "..");
const sw = fs.readFileSync(path.join(ROOT, "sw.js"), "utf8");
const listed = new Set([...sw.matchAll(/^\s+"([^"]+)",$/gm)].map((m) => m[1]));
const PAGES = fs.readdirSync(ROOT).filter((f) => f.endsWith(".html"));

test("every file in the offline list exists", () => {
   assert.ok(listed.size > 20);
   for (const file of listed) {
      if (file == "./") continue;
      assert.ok(fs.existsSync(path.join(ROOT, file)), file + " is listed in sw.js but missing");
   }
});

test("every page and every local file a page loads is saved for offline use", () => {
   for (const page of PAGES) {
      assert.ok(listed.has(page), page + " is not in sw.js");
      const html = fs.readFileSync(path.join(ROOT, page), "utf8");
      const refs = [...html.matchAll(/(?:src|href)="([^"#?:]+\.(?:js|css|png|json|webmanifest))"/g)].map((m) => m[1]);
      for (const ref of refs) {
         assert.ok(listed.has(ref), page + " loads " + ref + ", which sw.js doesn't save");
      }
   }
});

test("the background city builder's scripts are saved too", () => {
   const worker = fs.readFileSync(path.join(ROOT, "js/worldWorker.js"), "utf8");
   const imported = [...worker.matchAll(/"((?:\.\.\/)?[\w/]+\.js)"/g)].map((m) => path.posix.normalize("js/" + m[1]));
   assert.ok(imported.length > 0);
   for (const file of imported) {
      assert.ok(listed.has(file), "worker imports " + file + ", which sw.js doesn't save");
   }
});

test("the manifest's icons exist", () => {
   const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, "manifest.webmanifest"), "utf8"));
   for (const icon of manifest.icons) {
      assert.ok(fs.existsSync(path.join(ROOT, icon.src)), icon.src);
   }
});
