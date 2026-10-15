// Badges for milestones, from the drive history, permit quiz and practice
// log. Pure logic (tested in Node).
const BADGES = [
   { id: "first", emoji: "🚗", title: "First drive", about: "Finish any lesson",
      earned: ({ finished }) => finished.length > 0 },
   { id: "clean", emoji: "✨", title: "Clean drive", about: "Finish a drive with no mistakes",
      earned: ({ finished }) => finished.some((d) => d.mistakes.length == 0) },
   { id: "stops", emoji: "🛑", title: "Stop sign star", about: "Score 100 in Stop signs",
      earned: ({ finished }) => finished.some((d) => d.lesson == "stops" && d.score == 100) },
   { id: "hazards", emoji: "⚠️", title: "Eyes up", about: "Pass the Hazards lesson",
      earned: ({ passed }) => passed.has("hazards") },
   { id: "night", emoji: "🌙", title: "Night owl", about: "Pass Night & rain",
      earned: ({ passed }) => passed.has("night") },
   { id: "parallel", emoji: "🅿️", title: "Parallel pro", about: "Pass Parallel parking",
      earned: ({ passed }) => passed.has("parallel") },
   { id: "roundabouts", emoji: "🔄", title: "Round and round", about: "Pass Roundabouts",
      earned: ({ passed }) => passed.has("roundabouts") },
   { id: "phone", emoji: "📵", title: "Phone down", about: "Pass Phone down without touching your phone",
      earned: ({ finished }) => finished.some((d) => d.lesson == "phone" && d.passed && !d.mistakes.includes("phone_use")) },
   { id: "roadtest", emoji: "🎓", title: "Road ready", about: "Pass the road test",
      earned: ({ passed }) => passed.has("roadtest") },
   { id: "perfect", emoji: "🏆", title: "Flawless", about: "Score 100 on the road test",
      earned: ({ finished }) => finished.some((d) => d.lesson == "roadtest" && d.score == 100) },
   { id: "all", emoji: "📚", title: "Every lesson", about: "Pass every lesson",
      earned: ({ passed, lessons }) => lessons.every((l) => passed.has(l.id)) },
   { id: "ten", emoji: "🔁", title: "Keep at it", about: "Take 10 drives",
      earned: ({ history }) => history.length >= 10 },
   { id: "cities", emoji: "🌍", title: "Globetrotter", about: "Drive in 3 different places",
      earned: ({ history }) => new Set(history.map((d) => d.city)).size >= 3 },
   { id: "quiz", emoji: "📝", title: "Permit pro", about: "Score 90%+ on a full practice permit test",
      earned: ({ quiz }) => !!quiz && quiz.best >= 90 },
   { id: "real", emoji: "🗒️", title: "Real-world rookie", about: "Log 5 real practice drives",
      earned: ({ log }) => log.length >= 5 },
];

const Badges = {
   // The badges earned so far, in display order
   earned({ history = [], quiz = null, log = [], lessons = [] }) {
      const finished = history.filter((d) => d.ended == "arrived");
      const passed = new Set(history.filter((d) => d.passed).map((d) => d.lesson));
      const facts = { history, finished, passed, quiz, log, lessons };
      return BADGES.filter((b) => b.earned(facts)).map((b) => b.id);
   },

   // Which badges are new since `before` (lists of ids)
   newlyEarned(before, after) {
      const had = new Set(before);
      return after.filter((id) => !had.has(id)).map((id) => BADGES.find((b) => b.id == id));
   },
};
