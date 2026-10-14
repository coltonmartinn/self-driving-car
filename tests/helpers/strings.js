// Finds the English text a page shows: tr("...") calls, and the text and
// title / aria-label / placeholder attributes in the page's HTML. Used to
// check that every visible string has a translation.
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.join(__dirname, "..", "..");
const key = (s) => s.replace(/\s+/g, " ").trim();

// Things that read the same in any language: names, numbers, symbols, emoji,
// and the English on US road signs drawn in the app
const SAME = new Set([
   "Self-Driving City", "MPH", "mph", "Beverly Hills", "San Francisco", "Times Square", "Paris", "Shibuya",
   "GitHub", "OpenStreetMap", "Nominatim", "Photon", "Overpass", "Google Fonts", "GitHub Pages", "IIHS",
   "SPEED", "LIMIT", "SCHOOL", "MIT", "CSV", "Esc",
]);

function needsTranslation(text) {
   return /[a-z]{2,}/.test(text) && !SAME.has(text) && !text.startsWith("https://");
}

function trCalls(code) {
   const found = [];
   const re = /\btr\(\s*("(?:[^"\\]|\\.)*")/g;
   let m;
   while ((m = re.exec(code))) found.push(JSON.parse(m[1]));
   return found;
}

// Text between tags (outside scripts and styles), and translatable attributes
function htmlText(html) {
   const body = html
      .replace(/<script[\s\S]*?<\/script>/g, "")
      .replace(/<style[\s\S]*?<\/style>/g, "")
      .replace(/<!--[\s\S]*?-->/g, "")
      .replace(/<head>[\s\S]*?<\/head>/, "");
   const found = [];
   // a paragraph translated as a whole (data-i18n="html") counts as one string
   const whole = /<(\w+)[^>]*data-i18n="html"[^>]*>([\s\S]*?)<\/\1>/g;
   for (const m of body.matchAll(whole)) found.push(key(m[2]));
   const rest = body.replace(whole, "");
   for (const m of rest.matchAll(/>([^<]+)</g)) {
      const t = key(m[1].replace(/&amp;/g, "&").replace(/&nbsp;/g, " "));
      if (t && needsTranslation(t)) found.push(t);
   }
   for (const m of rest.matchAll(/\s(?:title|aria-label|placeholder)="([^"]+)"/g)) {
      const t = key(m[1]);
      if (needsTranslation(t)) found.push(t);
   }
   const title = html.match(/<title>([^<]+)<\/title>/);
   if (title) found.push(key(title[1]));
   return found;
}

function pageStrings(page) {
   const html = fs.readFileSync(path.join(ROOT, page), "utf8");
   const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]).join("\n");
   return { text: htmlText(html), calls: trCalls(scripts) };
}

module.exports = { pageStrings, trCalls, htmlText, key, ROOT };
