// A student's driving history, summarized for a parent or teacher: lessons
// passed, practice time, and the mistakes that keep coming up. Pure logic
// (no page access), so it is tested in Node.
const Progress = {
   MAX_HISTORY: 200,

   // One finished (or abandoned) drive, as stored in the history
   record(lesson, summary, { ended, city, date = Date.now() }) {
      return {
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

   // Compact, URL-safe encoding, for a link a student can send
   encode(name, history) {
      const rows = history.slice(-60).map((d) => [
         d.lesson, d.city, Math.round(d.date / 60000), d.ended[0], d.score, d.grade, d.passed ? 1 : 0, d.minutes, d.mistakes,
      ]);
      const json = JSON.stringify({ v: 1, n: name, h: rows });
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
         history: data.h.map(([lesson, city, minute, end, score, grade, passed, minutes, mistakes]) => ({
            lesson, city, date: minute * 60000, ended: ended[end], score, grade, passed: passed == 1, minutes, mistakes,
         })),
      };
   },
};
