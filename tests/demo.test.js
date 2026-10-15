// The "Show me" demo driver takes real lessons, on real city maps with
// traffic and pedestrians, and should drive them perfectly
const test = require("node:test");
const assert = require("node:assert/strict");
const { runLesson } = require("./helpers/lessonRunner");

function clean(lessonId, city, seed) {
   const r = runLesson(lessonId, { city, seed });
   const problems = r.coach.events.filter((e) => e.severity != "good").map((e) => e.rule);
   assert.ok(r.car.arrived, lessonId + " in " + city + ": didn't finish (" + problems.join() + ")");
   assert.equal(problems.join(), "", lessonId + " in " + city);
   assert.equal(r.coach.score, 100);
   return r;
}

test("the demo driver stops at every stop sign, and says why", () => {
   const r = clean("stops", "beverly-hills", 1);
   assert.ok(r.coach.stats.fullStops >= 1);
   assert.ok(r.said.some((s) => /Stop sign/.test(s)));
   assert.ok(r.said.some((s) => /Full stop/.test(s)));
});

test("the demo driver waits for people in crosswalks", () => {
   clean("pedestrians", "beverly-hills", 2);
});

test("the demo driver pulls over neatly into the marked space", () => {
   const r = clean("pullover", "san-francisco", 1);
   assert.ok(r.coach.events.some((e) => e.rule == "parked_well"));
});

test("the demo driver passes the road test in a busy downtown", () => {
   const r = clean("roadtest", "shibuya", 3);
   assert.ok(r.coach.stats.turns >= 2 && r.coach.stats.signaledTurns == r.coach.stats.turns);
});

test("the demo driver slows to 15 in a school zone", () => {
   const r = clean("school", "beverly-hills", 1);
   assert.ok(r.extras.zones.length == 1);
   assert.ok(r.said.some((s) => /School zone/.test(s)));
});

test("the demo driver passes a double-parked truck: signal, blind spot, clear lane, signal back", () => {
   const r = clean("passing", "beverly-hills", 1);
   assert.ok(r.coach.events.some((e) => e.rule == "clean_pass"));
});

test("the demo driver pulls over for an ambulance, coming towards it or from behind", () => {
   const towards = clean("emergency", "beverly-hills", 2);
   assert.ok(towards.coach.events.some((e) => e.rule == "yielded_emergency"));
   const behind = clean("emergency", "san-francisco", 1); // one-way streets: it comes up from behind
   assert.ok(behind.coach.events.some((e) => e.rule == "yielded_emergency"));
});

test("the demo driver yields at roundabouts, goes round the right way and signals its exit", () => {
   const r = clean("roundabouts", "beverly-hills", 1);
   assert.ok(r.coach.events.filter((e) => e.rule == "roundabout_good").length >= 1);
   assert.ok(r.said.some((s) => /waiting at the yield line/.test(s)), "it met a car coming round");
});

test("the demo driver leaves the phone alone", () => {
   clean("phone", "beverly-hills", 1);
});

test("the demo driver parallel parks, backing in on two arcs", () => {
   const r = clean("parallel", "times-square", 1);
   assert.ok(r.coach.events.some((e) => e.rule == "parallel_parked"));
   assert.ok(r.coach.stats.moves >= 1 && r.coach.stats.moves <= 3, "moves " + r.coach.stats.moves);
});
