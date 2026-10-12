const test = require("node:test");
const assert = require("node:assert/strict");
const { loadApp } = require("./helpers/loadApp");

const { Progress, LESSONS, DrivingCoach } = loadApp({
   globals: { TextEncoder, TextDecoder, btoa, atob, Uint8Array },
});

const lesson = (id) => LESSONS.find((l) => l.id == id);
const summary = (score, rules, passed = score >= 80) => ({
   score, grade: score >= 90 ? "A" : "C", passed, minutes: 1.5, mistakes: rules.map((rule) => ({ rule })),
});

function sampleHistory() {
   let h = [];
   const add = (id, s, ended) => (h = Progress.add(h, Progress.record(lesson(id), s, { ended, city: "Paris", date: 60000 * 28000000 })));
   add("stops", summary(70, ["rolling_stop", "speeding", "rolling_stop"], false), "arrived");
   add("stops", summary(100, []), "arrived");
   add("lights", summary(70, ["red_light"], false), "crash");
   add("signals", summary(94, ["no_signal", "speeding"]), "arrived");
   return h;
}

test("the report counts lessons passed, practice time and clean drives", () => {
   const r = Progress.summarize(sampleHistory(), LESSONS, DrivingCoach.RULES);
   assert.equal(r.drives, 4);
   assert.equal(r.minutes, 6);
   assert.equal(r.lessonsPassed, 2);
   assert.equal(r.cleanDrives, 1);
   const stops = r.lessons.find((l) => l.id == "stops");
   assert.equal(stops.attempts, 2);
   assert.equal(stops.best, 100);
   const lights = r.lessons.find((l) => l.id == "lights");
   assert.equal(lights.best, null, "a crashed drive has no score to show");
   assert.equal(lights.passed, false);
});

test("focus areas are the most frequent mistakes, worst first when tied", () => {
   const r = Progress.summarize(sampleHistory(), LESSONS, DrivingCoach.RULES);
   assert.equal(r.focus.map((f) => f.rule + ":" + f.count).join(), "rolling_stop:2,speeding:2,red_light:1");
   assert.ok(r.focus[0].tip.length > 0);
});

test("a share link round-trips the history", () => {
   const history = sampleHistory();
   const code = Progress.encode("Alex Rivera", history);
   assert.match(code, /^[A-Za-z0-9_-]+$/, "safe to put in a URL");
   const back = Progress.decode(code);
   assert.equal(back.name, "Alex Rivera");
   assert.equal(JSON.stringify(back.history), JSON.stringify(history));
});

test("history is capped", () => {
   let h = [];
   for (let i = 0; i < Progress.MAX_HISTORY + 5; i++) {
      h = Progress.add(h, Progress.record(lesson("basics"), summary(90, []), { ended: "arrived", city: "X", date: i * 60000 }));
   }
   assert.equal(h.length, Progress.MAX_HISTORY);
   assert.equal(h[0].date, 5 * 60000, "oldest drives drop off first");
});
