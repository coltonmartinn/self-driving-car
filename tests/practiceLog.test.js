const test = require("node:test");
const assert = require("node:assert/strict");
const { loadApp } = require("./helpers/loadApp");

const { PracticeLog, DrivingCoach } = loadApp();

const drive = (date, minutes, night, conditions = []) => PracticeLog.entry({ date, minutes, night, conditions });

test("entries are checked before they are logged", () => {
   assert.throws(() => drive("", 30), /date/);
   assert.throws(() => drive("2026-10-01", 0), /minutes/);
   assert.throws(() => drive("2026-10-01", "abc"), /minutes/);
   const e = PracticeLog.entry({ date: "2026-10-01", minutes: "44.6", conditions: ["Rain", "Moon"], notes: "x".repeat(500) });
   assert.equal(e.minutes, 45);
   assert.equal(e.conditions.join(), "Rain", "unknown conditions are dropped");
   assert.equal(e.notes.length, 300);
});

test("totals track hours, night hours and the goal", () => {
   const log = [drive("2026-10-01", 90, false, ["City"]), drive("2026-10-02", 60, true, ["City", "Rain"])];
   const t = PracticeLog.totals(log, { hours: 5, nightHours: 2 });
   assert.equal(t.sessions, 2);
   assert.equal(t.hours, 2.5);
   assert.equal(t.nightHours, 1);
   assert.equal(t.percent, 50);
   assert.equal(t.nightPercent, 50);
   assert.equal(t.done, false);
   assert.equal(t.byCondition.City, 150);
   assert.equal(t.byCondition.Rain, 60);
   assert.equal(PracticeLog.totals(log, { hours: 2, nightHours: 1 }).done, true);
});

test("simulator mistakes turn into real-world practice ideas, without repeats", () => {
   const R = DrivingCoach.RULES;
   const focus = ["rolling_stop", "ran_stop", "speeding", "full_stop"].map((rule) => ({ rule, title: R[rule].title }));
   const ideas = PracticeLog.suggestions(focus);
   assert.equal(ideas.length, 2, "stop-sign ideas are merged; praise has none");
   assert.match(ideas[0].idea, /full stops/);
});

test("CSV export is sorted by date and quotes tricky text", () => {
   const log = [
      PracticeLog.entry({ date: "2026-10-05", minutes: 30, notes: 'said "great", then left' }),
      PracticeLog.entry({ date: "2026-10-01", minutes: 20, night: true, conditions: ["Highway", "Rain"] }),
   ];
   const lines = PracticeLog.toCsv(log).trim().split("\n");
   assert.equal(lines[0], "Date,Minutes,Night,Conditions,Supervisor,Notes");
   assert.equal(lines[1], "2026-10-01,20,yes,Highway; Rain,,");
   assert.equal(lines[2], '2026-10-05,30,no,,,"said ""great"", then left"');
});

test("every state and DC has its supervised hours, and picking one sets the goal", () => {
   assert.equal(Object.keys(PracticeLog.STATES).length, 51);
   for (const s of Object.values(PracticeLog.STATES)) {
      assert.ok(s.hours >= 0 && s.night >= 0 && s.night <= s.hours && s.name);
   }
   const ca = PracticeLog.goalFor("CA");
   assert.equal(ca.hours + "/" + ca.nightHours, "50/10");
   const ms = PracticeLog.goalFor("MS"); // no state minimum: the usual advice
   assert.equal(ms.hours + "/" + ms.nightHours, "50/10");
   assert.equal(PracticeLog.goalFor("XX"), null);
});
