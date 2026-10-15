// The Spanish version: every string a student, parent or teacher sees must
// have a translation, with the same {placeholders}
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { loadApp } = require("./helpers/loadApp");
const { pageStrings, ROOT } = require("./helpers/strings");

const app = loadApp();
const { I18N, LESSONS, DrivingCoach, QUIZ_BANK, BADGES, PracticeLog, PhoneBuzz } = app;
const es = I18N.dictionaries.es;
const missing = (strings) => [...new Set(strings)].filter((s) => !(I18N.key(s) in es));

test("every lesson, coach rule and tip is translated", () => {
   const strings = [];
   for (const l of LESSONS) strings.push(l.title, l.summary, ...l.learn);
   for (const r of Object.values(DrivingCoach.RULES)) strings.push(r.title, ...(r.tip ? [r.tip] : []));
   assert.deepEqual(missing(strings), []);
});

test("every permit quiz question, answer and explanation is translated", () => {
   const strings = [];
   for (const q of QUIZ_BANK) strings.push(q.topic, q.q, ...q.options, q.why);
   assert.deepEqual(missing(strings), []);
});

test("badges, the practice log and the phone lesson's texts are translated", () => {
   const strings = [];
   for (const b of BADGES) strings.push(b.title, b.about);
   strings.push(...PracticeLog.CONDITIONS, ...Object.values(PracticeLog.SUGGESTIONS));
   for (const s of Object.values(PracticeLog.STATES)) if (s.note) strings.push(s.note);
   for (const m of PhoneBuzz.MESSAGES) strings.push(m.text);
   assert.deepEqual(missing(strings), []);
});

test("everything the demo driver says is translated", () => {
   const code = fs.readFileSync(path.join(ROOT, "js/school/autopilot.js"), "utf8");
   // the sentences it says: string literals that start with a capital letter
   const said = [...code.matchAll(/"([A-Z][^"]{8,})"/g)].map((m) => m[1]);
   assert.ok(said.length > 30);
   assert.deepEqual(missing(said), []);
});

test("every page's own text, and every tr() in its script, is translated", () => {
   for (const page of ["index.html", "drive.html", "quiz.html", "log.html", "class.html", "privacy.html"]) {
      const { text, calls } = pageStrings(page);
      assert.deepEqual(missing([...text, ...calls]), [], page);
   }
});

test("a translation keeps the same {placeholders}", () => {
   const names = (s) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join();
   for (const [english, spanish] of Object.entries(es)) {
      assert.equal(names(spanish), names(english), english);
   }
});

test("tr() fills in placeholders and falls back to English", () => {
   I18N.lang = "es";
   try {
      assert.equal(I18N.tr("Stop signs"), "Señales de alto");
      assert.equal(I18N.tr("{mph} mph in a {limit}", { mph: 22, limit: 15 }), "22 mph en zona de 15");
      assert.equal(I18N.tr("Not translated, so English"), "Not translated, so English");
      const d = DrivingCoach.detail("slowest {mph} mph", { mph: 4 });
      assert.equal(d.detail, "slowest 4 mph");
      assert.equal(I18N.tr(d.detailKey, d.detailVars), "lo más lento: 4 mph");
   } finally {
      I18N.lang = "en";
   }
   assert.equal(I18N.tr("Stop signs"), "Stop signs");
});

test("every state-law question, answer and explanation is translated", () => {
   const { StateQuiz, STATE_LAWS } = app;
   const strings = [StateQuiz.TOPIC, "{state} laws"];
   for (const code of Object.keys(STATE_LAWS)) {
      for (const q of StateQuiz.questionsFor(code)) {
         strings.push(q.q, ...q.options, ...q.whyParts.map(([text]) => text));
      }
   }
   assert.deepEqual(missing(strings), []);
});
