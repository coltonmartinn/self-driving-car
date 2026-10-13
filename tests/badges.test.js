const test = require("node:test");
const assert = require("node:assert/strict");
const { loadApp } = require("./helpers/loadApp");

const { Badges, BADGES, LESSONS } = loadApp();

const d = (lesson, score, passed, mistakes = [], city = "Paris", ended = "arrived") =>
   ({ lesson, city, date: 0, ended, score, grade: "A", passed, minutes: 2, mistakes });

test("badges come from drives, the quiz and the practice log", () => {
   assert.equal(Badges.earned({ lessons: LESSONS }).length, 0, "nothing yet");
   const history = [
      d("basics", 97, true, ["speeding"]),
      d("stops", 100, true, [], "Tokyo"),
      d("night", 0, false, ["crash"], "Austin", "crash"),
   ];
   const ids = Badges.earned({ history, quiz: { best: 92 }, log: [1, 2, 3, 4, 5], lessons: LESSONS });
   assert.equal(ids.join(), "first,clean,stops,cities,quiz,real");
});

test("every lesson passed earns the collector badge", () => {
   const history = LESSONS.map((l) => d(l.id, 90, true, ["speeding"]));
   const ids = Badges.earned({ history, lessons: LESSONS });
   assert.ok(ids.includes("all") && ids.includes("roadtest") && ids.includes("night") && ids.includes("hazards"));
   assert.ok(!ids.includes("perfect"), "road test wasn't 100");
});

test("newly earned badges are reported once", () => {
   const fresh = Badges.newlyEarned(["first"], ["first", "clean"]);
   assert.equal(fresh.map((b) => b.id).join(), "clean");
   assert.equal(Badges.newlyEarned(["first", "clean"], ["first", "clean"]).length, 0);
   assert.equal(new Set(BADGES.map((b) => b.id)).size, BADGES.length, "ids are unique");
});
