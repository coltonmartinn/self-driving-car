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
   assert.equal(back.quiz, null);
   const withQuiz = Progress.decode(Progress.encode("Sam", history, { best: 85, passedFull: true, tests: 3 }));
   assert.equal(JSON.stringify(withQuiz.quiz), JSON.stringify({ best: 85, passedFull: true }));
});

test("history is capped", () => {
   let h = [];
   for (let i = 0; i < Progress.MAX_HISTORY + 5; i++) {
      h = Progress.add(h, Progress.record(lesson("basics"), summary(90, []), { ended: "arrived", city: "X", date: i * 60000 }));
   }
   assert.equal(h.length, Progress.MAX_HISTORY);
   assert.equal(h[0].date, 5 * 60000, "oldest drives drop off first");
});

test("a class view combines several students' links", () => {
   const alex = sampleHistory();
   let sam = [];
   sam = Progress.add(sam, Progress.record(lesson("basics"), summary(97, ["speeding"]), { ended: "arrived", city: "X", date: 60000 * 28000100 }));
   const links = [
      "https://example.com/drive.html#report=" + Progress.encode("Sam Lee", sam, { best: 90, passedFull: true }),
      "  " + Progress.encode("Alex Rivera", alex) + "  ",
   ];
   const students = links.map((l) => Progress.fromLink(l));
   assert.equal(Progress.fromLink("not a link"), null);
   const c = Progress.classSummary(students, LESSONS, DrivingCoach.RULES);
   assert.equal(c.rows.map((r) => r.name).join(), "Alex Rivera,Sam Lee", "sorted by name");
   assert.equal(c.rows[1].quizBest, 90);
   assert.equal(c.rows[0].focus.rule, "rolling_stop");
   const speeding = c.focus.find((f) => f.rule == "speeding");
   assert.equal(speeding.students, 2, "both students speed");
   assert.equal(c.focus[0].rule, "speeding");
});

test("the class spreadsheet shows each student's first and latest scores, for measuring progress", () => {
   const drive = (score, date, lesson = "stops") => ({ lesson, city: "x", date, ended: "arrived", score, grade: "B", passed: score >= 80, minutes: 2, mistakes: [] });
   const history = [drive(60, 1), drive(70, 2), drive(80, 3), drive(85, 4), drive(90, 5), drive(95, 6, "roadtest")];
   const c = Progress.classSummary([{ name: "Ana, R.", history, quiz: { best: 85 } }], LESSONS, DrivingCoach.RULES);
   assert.equal(c.rows[0].firstScore, 70);
   assert.equal(c.rows[0].latestScore, 90);
   assert.equal(c.rows[0].roadTestBest, 95);
   const csv = Progress.classCsv(c.rows).trim().split("\n");
   assert.equal(csv.length, 2);
   assert.ok(csv[0].startsWith("Student,Lessons passed"));
   assert.ok(csv[1].startsWith("\"Ana, R.\","), "names with commas are quoted: " + csv[1]);
   assert.ok(csv[1].includes(",70,90,"));
});

test("practice suggestions follow the mistakes that keep coming up", () => {
   const R = DrivingCoach.RULES;
   // every mistake points at a real lesson
   for (const [rule, id] of Object.entries(Progress.PRACTICE)) {
      assert.ok(R[rule], "unknown rule " + rule);
      assert.ok(LESSONS.some((l) => l.id == id), rule + ": unknown lesson " + id);
   }
   let h = [];
   const add = (id, rules, passed = rules.length == 0) => (h = Progress.add(h, Progress.record(lesson(id), summary(passed ? 95 : 70, rules, passed), { ended: "arrived", city: "Paris" })));
   // nothing driven yet: start at the beginning
   assert.equal(Progress.recommend(h, LESSONS, R).lesson.id, "basics");
   add("basics", []);
   assert.equal(Progress.recommend(h, LESSONS, R).lesson.id, "stops", "then the next lesson not passed");
   // one minor slip isn't a pattern...
   add("signals", ["no_signal"], true);
   assert.equal(Progress.recommend(h, LESSONS, R).reason, "next");
   // ...but rolling stops twice is, even in another lesson
   add("roadtest", ["rolling_stop", "speeding"], false);
   add("lights", ["rolling_stop"], true);
   const r = Progress.recommend(h, LESSONS, R);
   assert.equal(r.lesson.id, "stops");
   assert.equal(r.rule, "rolling_stop");
   assert.equal(r.count, 2);
   // crashes in the latest drives come first
   add("following", ["crash"], false);
   add("following", ["crash"], false);
   const crash = Progress.recommend(h, LESSONS, R);
   assert.equal(crash.rule, "crash");
   assert.equal(crash.lesson.id, "hazards");
});

test("assignments: a link with the lesson and city, and who has done it", () => {
   const link = Progress.assignmentLink("https://x/drive.html", { id: "abc123", lesson: "stops", city: "paris", note: "Due Friday & aim for 90" });
   assert.equal(link, "https://x/drive.html?city=paris&lesson=stops&assign=abc123&note=Due%20Friday%20%26%20aim%20for%2090");
   assert.match(Progress.assignmentId(), /^[0-9a-z]{6}$/);
   const drive = (passed, assignment) => Progress.record(lesson("stops"), summary(passed ? 95 : 60, [], passed), { ended: "arrived", city: "Paris", assignment });
   const students = [
      { name: "Ana", history: [drive(false, "abc123"), drive(true, "abc123")] },
      { name: "Ben", history: [drive(false, "abc123")] },
      { name: "Cy", history: [drive(true, null)] }, // passed, but not from the assignment link
   ];
   const [status] = Progress.assignmentStatus(students, [{ id: "abc123", lesson: "stops" }]);
   assert.deepEqual([status.done, status.tried, status.notYet].map((x) => x.join()), ["Ana", "Ben", "Cy"]);
   // the assignment survives the student's share link
   const back = Progress.decode(Progress.encode("Ana", students[0].history));
   assert.equal(back.history.map((d) => d.assignment).join(), "abc123,abc123");
   assert.equal(Progress.decode(Progress.encode("Cy", students[2].history)).history[0].assignment, undefined);
});
