// A log of real, supervised practice drives (behind a real wheel, with a
// parent or instructor), like the hour logs most states ask learners to
// keep. Pure logic (tested in Node); log.html stores it in the browser.
const PracticeLog = {
   CONDITIONS: ["Residential", "City", "Highway", "Rain", "Parking", "Rural"],

   // Real-world practice ideas for each simulator mistake
   SUGGESTIONS: {
      rolling_stop: "Practice full stops in a quiet neighborhood: stop behind the line, count \"one-thousand-one\", then go.",
      ran_stop: "Practice full stops in a quiet neighborhood: stop behind the line, count \"one-thousand-one\", then go.",
      red_light: "On a city drive, have the supervisor call out each light early: green, yellow (stop if you can), red.",
      speeding: "Ask your supervisor to quiz you on the speed limit every few blocks, and check the speedometer each time.",
      reckless_speed: "Ask your supervisor to quiz you on the speed limit every few blocks, and check the speedometer each time.",
      tailgating: "Practice the 2-3 second rule on a multi-lane road: count out loud when the car ahead passes a sign.",
      no_signal: "Say each turn out loud before signaling (\"signal, mirror, shoulder, turn\") until it's automatic.",
      wrong_signal: "Say each turn out loud before signaling (\"signal, mirror, shoulder, turn\") until it's automatic.",
      wrong_side: "Practice lane position on a quiet two-lane road: keep the car centered in your lane.",
      curb: "Practice slow, wide turns in an empty parking lot, looking through the turn.",
      crash: "Spend a drive narrating hazards out loud: cars pulling out, brake lights, people near the road.",
      pedestrian_yield: "Drive near a school or downtown at a quiet time and point out every crosswalk and person nearby.",
      missed_spot: "Practice pulling over to the curb on a quiet street, aiming for a spot between two driveways.",
      crooked_park: "Practice pulling over to the curb on a quiet street, aiming for a spot between two driveways.",
      pullover_signal: "Practice pulling over to the curb on a quiet street, signaling first every time.",
   },

   // fields: date (YYYY-MM-DD), minutes, night, conditions [], notes, supervisor
   entry({ date, minutes, night = false, conditions = [], notes = "", supervisor = "" }) {
      const m = Math.round(Number(minutes));
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date || "")) throw new Error("Pick the date of the drive.");
      if (!(m > 0 && m <= 600)) throw new Error("Enter how long you drove, in minutes (1 to 600).");
      return {
         id: date + "-" + Math.random().toString(36).slice(2, 8),
         date, minutes: m, night: !!night,
         conditions: conditions.filter((c) => PracticeLog.CONDITIONS.includes(c)),
         notes: String(notes).slice(0, 300),
         supervisor: String(supervisor).slice(0, 60),
      };
   },

   totals(entries, goal = { hours: 50, nightHours: 10 }) {
      const minutes = entries.reduce((t, e) => t + e.minutes, 0);
      const nightMinutes = entries.filter((e) => e.night).reduce((t, e) => t + e.minutes, 0);
      const byCondition = Object.fromEntries(PracticeLog.CONDITIONS.map((c) => [c, 0]));
      for (const e of entries) {
         for (const c of e.conditions) byCondition[c] += e.minutes;
      }
      return {
         sessions: entries.length,
         hours: minutes / 60,
         nightHours: nightMinutes / 60,
         percent: Math.min(100, Math.round((minutes / 60 / goal.hours) * 100)),
         nightPercent: goal.nightHours > 0 ? Math.min(100, Math.round((nightMinutes / 60 / goal.nightHours) * 100)) : 100,
         done: minutes / 60 >= goal.hours && nightMinutes / 60 >= goal.nightHours,
         byCondition,
      };
   },

   // What to practice next, from the simulator's most frequent mistakes
   suggestions(focus) {
      const seen = new Set();
      const out = [];
      for (const f of focus) {
         const idea = PracticeLog.SUGGESTIONS[f.rule];
         if (idea && !seen.has(idea)) {
            seen.add(idea);
            out.push({ title: f.title, idea });
         }
      }
      return out;
   },

   toCsv(entries) {
      const cell = (v) => {
         const s = String(v);
         return /[",\n]/.test(s) ? "\"" + s.replace(/"/g, "\"\"") + "\"" : s;
      };
      const rows = [["Date", "Minutes", "Night", "Conditions", "Supervisor", "Notes"]];
      for (const e of [...entries].sort((a, b) => a.date.localeCompare(b.date))) {
         rows.push([e.date, e.minutes, e.night ? "yes" : "no", e.conditions.join("; "), e.supervisor, e.notes]);
      }
      return rows.map((r) => r.map(cell).join(",")).join("\n") + "\n";
   },
};
