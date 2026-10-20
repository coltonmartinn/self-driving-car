// A student's driving history, summarized for a parent or teacher: lessons
// passed, practice time, and the mistakes that keep coming up. Pure logic
// (no page access), so it is tested in Node.
const Progress = {
   MAX_HISTORY: 200,

   // One finished (or abandoned) drive, as stored in the history
   // (assignment: the id of the teacher's assignment it was for, if any)
   record(lesson, summary, { ended, city, date = Date.now(), assignment = null }) {
      return {
         ...(assignment ? { assignment } : {}),
         lesson: lesson.id,
         city,
         date,
         ended, // "arrived", "crash" or "quit"
         score: summary.score,
         grade: summary.grade,
         passed: ended == "arrived" && summary.passed,
         minutes: Math.round(summary.minutes * 10) / 10,
         mistakes: summary.mistakes.map((m) => m.rule),
      };
   },

   // The lesson that practices the skill behind each mistake
   PRACTICE: {
      rolling_stop: "stops", ran_stop: "stops",
      red_light: "lights",
      no_signal: "signals", wrong_signal: "signals",
      tailgating: "gapdrill", uneven_gap: "gapdrill", fell_behind: "gapdrill",
      overshot_mark: "stopdrill", short_of_mark: "stopdrill", missed_mark: "stopdrill", slow_approach: "stopdrill",
      pedestrian_yield: "pedestrians", hit_pedestrian: "pedestrians",
      school_zone_speeding: "school",
      speeding: "basics", reckless_speed: "basics", wrong_side: "basics", curb: "basics", wrong_way: "signals",
      missed_spot: "pullover", crooked_park: "pullover", pullover_signal: "pullover",
      far_from_curb: "parallel", too_many_moves: "parallel", park_signal: "parallel",
      pass_no_signal: "passing", pass_return_signal: "passing", unsafe_pass: "passing", no_blind_spot_check: "passing",
      merge_slow: "highway", merge_signal: "highway", unsafe_merge: "highway", lane_change_signal: "highway",
      unsafe_lane_change: "highway", straddling: "highway", too_slow_highway: "highway", exit_signal: "highway",
      roundabout_no_yield: "roundabouts", roundabout_wrong_way: "roundabouts", roundabout_exit_signal: "roundabouts", fast_yield: "roundabouts",
      emergency_yield: "emergency",
      phone_use: "phone",
      crash: "hazards",
   },

   // What to practice next: the lesson for the skill that slipped most in the
   // latest drives (recent and serious mistakes count more), or, with nothing
   // to work on, the next lesson not passed yet. Returns { lesson, rule,
   // count, reason: "mistake" | "next" }, or null when everything's passed
   // and clean.
   recommend(history, lessons, rules, recent = 10) {
      const drives = history.slice(-recent);
      const weight = { critical: 3, major: 2, minor: 1 };
      const scores = new Map();
      const counts = new Map();
      drives.forEach((d, i) => {
         const fresh = 0.5 + (0.5 * (i + 1)) / drives.length; // the latest count most
         for (const rule of d.mistakes) {
            const info = rules[rule];
            const lesson = lessons.find((l) => l.id == Progress.PRACTICE[rule]);
            if (!info || !lesson) continue;
            scores.set(rule, (scores.get(rule) || 0) + (weight[info.severity] || 0) * fresh);
            counts.set(rule, (counts.get(rule) || 0) + 1);
         }
      });
      // one minor slip isn't a pattern: it takes a few, or something serious
      const best = [...scores].filter(([, score]) => score >= 2).sort((a, b) => b[1] - a[1])[0];
      if (best) {
         const [rule] = best;
         return { lesson: lessons.find((l) => l.id == Progress.PRACTICE[rule]), rule, count: counts.get(rule), reason: "mistake" };
      }
      const passed = new Set(history.filter((d) => d.passed).map((d) => d.lesson));
      const next = lessons.find((l) => !passed.has(l.id));
      return next ? { lesson: next, rule: null, count: 0, reason: "next" } : null;
   },

   add(history, drive) {
      return [...history, drive].slice(-Progress.MAX_HISTORY);
   },

   summarize(history, lessons, rules) {
      const perLesson = lessons.map((l) => {
         const drives = history.filter((d) => d.lesson == l.id);
         const finished = drives.filter((d) => d.ended == "arrived");
         return {
            id: l.id,
            emoji: l.emoji,
            title: l.title,
            attempts: drives.length,
            best: finished.length > 0 ? Math.max(...finished.map((d) => d.score)) : null,
            passed: drives.some((d) => d.passed),
         };
      });

      // the most frequent mistakes, worst first when tied
      const rank = { critical: 0, major: 1, minor: 2 };
      const counts = new Map();
      for (const d of history) {
         for (const rule of d.mistakes) {
            counts.set(rule, (counts.get(rule) || 0) + 1);
         }
      }
      const focus = [...counts]
         .filter(([rule]) => rules[rule])
         .map(([rule, count]) => ({ rule, count, ...rules[rule] }))
         .sort((a, b) => b.count - a.count || rank[a.severity] - rank[b.severity])
         .slice(0, 3);

      const finished = history.filter((d) => d.ended == "arrived");
      return {
         drives: history.length,
         minutes: Math.round(history.reduce((t, d) => t + d.minutes, 0)),
         lessonsPassed: perLesson.filter((l) => l.passed).length,
         lessonCount: lessons.length,
         roadTestPassed: perLesson.some((l) => l.id == "roadtest" && l.passed),
         cleanDrives: finished.filter((d) => d.mistakes.length == 0).length,
         lessons: perLesson,
         focus,
         recent: history.slice(-8).reverse(),
      };
   },

   // A whole class at once, from the students' shared reports.
   // students: [{ name, history, quiz }]
   classSummary(students, lessons, rules) {
      const rows = students.map((s) => {
         const r = Progress.summarize(s.history, lessons, rules);
         const last = s.history.length > 0 ? Math.max(...s.history.map((d) => d.date)) : null;
         // improvement: average score of the first and the latest 3 finished drives
         const finished = [...s.history].filter((d) => d.ended == "arrived").sort((a, b) => a.date - b.date);
         const avg = (ds) => (ds.length ? Math.round(ds.reduce((t, d) => t + d.score, 0) / ds.length) : null);
         const roadTests = finished.filter((d) => d.lesson == "roadtest");
         return {
            name: s.name || "Unnamed student",
            lessonsPassed: r.lessonsPassed,
            lessonCount: r.lessonCount,
            roadTestPassed: r.roadTestPassed,
            quizBest: s.quiz ? s.quiz.best : null,
            drives: r.drives,
            minutes: r.minutes,
            lastActive: last,
            focus: r.focus[0] || null,
            firstScore: avg(finished.slice(0, 3)),
            latestScore: finished.length > 3 ? avg(finished.slice(-3)) : null,
            roadTestBest: roadTests.length ? Math.max(...roadTests.map((d) => d.score)) : null,
         };
      });
      rows.sort((a, b) => a.name.localeCompare(b.name));

      // mistakes across the class: how many students make each one
      const studentsWith = new Map();
      for (const s of students) {
         for (const rule of new Set(s.history.flatMap((d) => d.mistakes))) {
            studentsWith.set(rule, (studentsWith.get(rule) || 0) + 1);
         }
      }
      const focus = [...studentsWith]
         .filter(([rule]) => rules[rule])
         .map(([rule, count]) => ({ rule, students: count, ...rules[rule] }))
         .sort((a, b) => b.students - a.students)
         .slice(0, 5);
      return { rows, focus };
   },

   // The class as a spreadsheet (CSV), e.g. to compare before and after in a pilot
   classCsv(rows) {
      const cell = (v) => {
         const s = v == null ? "" : String(v);
         return /[",\n]/.test(s) ? "\"" + s.replace(/"/g, "\"\"") + "\"" : s;
      };
      const header = ["Student", "Lessons passed", "Road test passed", "Road test best", "Permit quiz best %", "Drives",
         "Practice minutes", "Avg score, first 3 drives", "Avg score, latest 3 drives", "Most common mistake", "Last active"];
      const lines = rows.map((r) => [
         r.name, r.lessonsPassed + "/" + r.lessonCount, r.roadTestPassed ? "yes" : "no", r.roadTestBest, r.quizBest, r.drives,
         r.minutes, r.firstScore, r.latestScore, r.focus ? r.focus.title : "",
         r.lastActive ? new Date(r.lastActive).toISOString().slice(0, 10) : "",
      ]);
      return [header, ...lines].map((l) => l.map(cell).join(",")).join("\n") + "\n";
   },

   // ---------- assignments ----------

   // A link a teacher sends: a lesson in a city, with a note for the class
   assignmentLink(base, { id, lesson, city, note = "" }) {
      return base + "?city=" + encodeURIComponent(city) + "&lesson=" + encodeURIComponent(lesson) + "&assign=" + encodeURIComponent(id) +
         (note ? "&note=" + encodeURIComponent(note.slice(0, 120)) : "");
   },

   // A short id for a new assignment
   assignmentId(random = Math.random) {
      return Math.floor(random() * 36 ** 6).toString(36).padStart(6, "0");
   },

   // Who has done each assignment, from the students' reports: passed it,
   // tried it, or not started. assignments: [{ id, ... }]
   assignmentStatus(students, assignments) {
      return assignments.map((a) => {
         const drives = (s) => s.history.filter((d) => d.assignment == a.id);
         const done = students.filter((s) => drives(s).some((d) => d.passed));
         const tried = students.filter((s) => !done.includes(s) && drives(s).length > 0);
         const name = (s) => s.name || "Unnamed student";
         return {
            ...a,
            done: done.map(name),
            tried: tried.map(name),
            notYet: students.filter((s) => !done.includes(s) && !tried.includes(s)).map(name),
         };
      });
   },

   // Pulls the report data out of a pasted share link (or the bare code)
   fromLink(text) {
      const match = text.trim().match(/#report=([A-Za-z0-9_-]+)/) || text.trim().match(/^([A-Za-z0-9_-]{20,})$/);
      return match ? Progress.decode(match[1]) : null;
   },

   // Compact, URL-safe encoding, for a link a student can send.
   // quiz: the permit quiz results ({ best, passedFull }), if any
   encode(name, history, quiz = null) {
      const rows = history.slice(-60).map((d) => [
         d.lesson, d.city, Math.round(d.date / 60000), d.ended[0], d.score, d.grade, d.passed ? 1 : 0, d.minutes, d.mistakes,
         ...(d.assignment ? [d.assignment] : []),
      ]);
      const json = JSON.stringify({ v: 1, n: name, h: rows, q: quiz ? [quiz.best, quiz.passedFull ? 1 : 0] : null });
      const bytes = new TextEncoder().encode(json);
      let binary = "";
      for (const b of bytes) binary += String.fromCharCode(b);
      return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
   },

   decode(text) {
      const binary = atob(text.replace(/-/g, "+").replace(/_/g, "/"));
      const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
      const data = JSON.parse(new TextDecoder().decode(bytes));
      const ended = { a: "arrived", c: "crash", q: "quit" };
      return {
         name: data.n || "",
         quiz: data.q ? { best: data.q[0], passedFull: data.q[1] == 1 } : null,
         history: data.h.map(([lesson, city, minute, end, score, grade, passed, minutes, mistakes, assignment]) => ({
            lesson, city, date: minute * 60000, ended: ended[end], score, grade, passed: passed == 1, minutes, mistakes,
            ...(assignment ? { assignment } : {}),
         })),
      };
   },
};
