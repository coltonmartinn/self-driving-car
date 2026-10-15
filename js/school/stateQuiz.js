// Permit quiz questions about one state's teen driving laws: the youngest
// age for a learner's permit, how long to hold it, the supervised practice
// hours, and the night and passenger limits on a new license. Only the
// student's own state is ever asked about.
// From the IIHS graduated licensing table, October 2026
// (https://www.iihs.org/research-areas/teenagers/graduated-licensing-laws-table).
// Laws change, so every explanation says to check the state's manual.
// Pure logic (tested in Node); supervised hours come from PracticeLog.STATES.

// permit: youngest age for a learner's permit, in months (180 = 15 years)
// hold: how long the permit must be held, in months (or "10 days"); null = no simple answer
// night: hours a new (intermediate) license can't be used; null = no simple answer
// passengers: the limit on a new license (family members are usually exempt); null = no simple answer
// notes: { permit, hold, night, passengers } caveats, added to the explanation
const STATE_LAWS = {
   AL: { permit: 180, hold: 6, night: "Midnight to 6 a.m.", passengers: "No more than 1 passenger" },
   AK: { permit: 168, hold: 6, night: "1 a.m. to 5 a.m.", passengers: "No passengers under 21" },
   AZ: { permit: 186, hold: 6, night: "Midnight to 5 a.m.", passengers: "No more than 1 passenger under 18" },
   AR: { permit: 168, hold: 6, night: "11 p.m. to 4 a.m.", passengers: "No more than 1 passenger under 21",
      notes: { permit: "At 14 it's an instruction permit; you still drive only with a supervisor." } },
   CA: { permit: 186, hold: 6, night: "11 p.m. to 5 a.m.", passengers: "No passengers under 20" },
   CO: { permit: 180, hold: 12, night: "Midnight to 5 a.m.", passengers: "None for the first 6 months, then no more than 1" },
   CT: { permit: 192, hold: 6, night: "11 p.m. to 5 a.m.", passengers: "Only parents or a driving instructor for the first 6 months",
      notes: { hold: "It's 4 months if you take driver education." } },
   DE: { permit: 192, hold: null, night: "10 p.m. to 6 a.m.", passengers: "No more than 1 passenger" },
   DC: { permit: 192, hold: 6, night: null, passengers: "No passengers" },
   FL: { permit: 180, hold: 12, night: "11 p.m. to 6 a.m. at 16; 1 a.m. to 5 a.m. at 17", passengers: "No limit set by state law" },
   GA: { permit: 180, hold: 12, night: "Midnight to 5 a.m.", passengers: "None for the first 6 months, then no more than 1 under 21" },
   HI: { permit: 186, hold: 6, night: "11 p.m. to 5 a.m.", passengers: "No more than 1 passenger under 18" },
   ID: { permit: 174, hold: 6, night: "10 p.m. to 5 a.m.", passengers: "No more than 1 passenger under 17",
      notes: { permit: "At 14 and a half it's a training permit for students in driver education." } },
   IL: { permit: 180, hold: 9, night: "10 p.m. to 6 a.m. Sunday to Thursday, 11 p.m. to 6 a.m. Friday and Saturday",
      passengers: "No more than 1 passenger under 20 for the first year",
      notes: { permit: "You must be enrolled in driver education." } },
   IN: { permit: 180, hold: 6, night: null, passengers: "No passengers",
      notes: { permit: "That's with driver education; without it, the youngest age is 16." } },
   IA: { permit: 168, hold: 12, night: "12:30 a.m. to 5 a.m.", passengers: null },
   KS: { permit: 168, hold: 12, night: "9 p.m. to 5 a.m.", passengers: "No more than 1 passenger under 18" },
   KY: { permit: 180, hold: 6, night: "Midnight to 6 a.m.", passengers: "No more than 1 passenger under 20" },
   LA: { permit: 180, hold: 6, night: "11 p.m. to 5 a.m.", passengers: "No more than 1 passenger under 21 from 6 p.m. to 5 a.m." },
   ME: { permit: 180, hold: 6, night: "Midnight to 5 a.m.", passengers: "No passengers" },
   MD: { permit: 189, hold: 9, night: "Midnight to 5 a.m.", passengers: "No passengers under 18" },
   MA: { permit: 192, hold: 6, night: "12:30 a.m. to 5 a.m.", passengers: "No passengers under 18" },
   MI: { permit: 174, hold: 6, night: "10 p.m. to 5 a.m.", passengers: "No more than 1 passenger under 21",
      notes: { permit: "You must have finished the first part (Segment 1) of driver education." } },
   MN: { permit: 180, hold: 6, night: "Midnight to 5 a.m.", passengers: "No more than 1 passenger under 20 for the first 6 months" },
   MS: { permit: 180, hold: 12, night: "10 p.m. to 6 a.m. Sunday to Thursday, 11:30 p.m. to 6 a.m. Friday and Saturday",
      passengers: "No limit set by state law" },
   MO: { permit: 180, hold: 6, night: "1 a.m. to 5 a.m.", passengers: "No more than 1 passenger under 19 for the first 6 months" },
   MT: { permit: 174, hold: 6, night: "11 p.m. to 5 a.m.", passengers: "No more than 1 passenger under 18 for the first 6 months",
      notes: { permit: "Under 15, you must be enrolled in or have finished driver education." } },
   NE: { permit: 180, hold: 6, night: "Midnight to 6 a.m.", passengers: "No more than 1 passenger under 19" },
   NV: { permit: 186, hold: 6, night: "10 p.m. to 5 a.m.", passengers: "No passengers under 18" },
   NH: { permit: 186, hold: null, night: "1 a.m. to 4 a.m.", passengers: "No more than 1 passenger under 25", noPermit: true,
      notes: { permit: "New Hampshire has no learner's permit: from this age you can drive with a licensed driver 25 or older." } },
   NJ: { permit: 192, hold: 6, night: "11 p.m. to 5 a.m.", passengers: "No more than 1 passenger",
      notes: { permit: "That's with driver education; without it, the youngest age is 17." } },
   NM: { permit: 180, hold: 6, night: "Midnight to 5 a.m.", passengers: "No more than 1 passenger under 21" },
   NY: { permit: 192, hold: 6, night: "9 p.m. to 5 a.m. (in most of the state)", passengers: "No more than 1 passenger under 21",
      notes: { night: "New York City and Long Island have stricter rules for junior licenses." } },
   NC: { permit: 180, hold: 9, night: "9 p.m. to 5 a.m.", passengers: "No more than 1 passenger under 21" },
   ND: { permit: 168, hold: null, night: null, passengers: "No limit set by state law" },
   OH: { permit: 186, hold: 6, night: "Midnight to 6 a.m. for the first year, then 1 a.m. to 5 a.m.", passengers: "No more than 1 passenger for the first year" },
   OK: { permit: 180, hold: 6, night: "10 p.m. to 5 a.m.", passengers: "No more than 1 passenger" },
   OR: { permit: 180, hold: 6, night: "Midnight to 5 a.m.", passengers: "No passengers under 20 for the first 6 months" },
   PA: { permit: 192, hold: 6, night: "11 p.m. to 5 a.m.", passengers: "No more than 1 passenger under 18 for the first 6 months" },
   RI: { permit: 192, hold: 6, night: "1 a.m. to 5 a.m.", passengers: "No more than 1 passenger under 21" },
   SC: { permit: 180, hold: 6, night: "6 p.m. to 6 a.m. (8 p.m. to 6 a.m. during daylight saving time)", passengers: "No more than 2 passengers under 21" },
   SD: { permit: 168, hold: 9, night: "10 p.m. to 6 a.m.", passengers: "No passengers for the first 6 months",
      notes: { hold: "It's 6 months if you take driver education." } },
   TN: { permit: 180, hold: 6, night: "11 p.m. to 6 a.m.", passengers: "No more than 1 passenger" },
   TX: { permit: 180, hold: 6, night: "Midnight to 5 a.m.", passengers: "No more than 1 passenger under 21",
      notes: { permit: "You must pass the classroom part of driver education first." } },
   UT: { permit: 180, hold: 6, night: "Midnight to 5 a.m.", passengers: "No passengers for the first 6 months" },
   VT: { permit: 180, hold: 12, night: "No night limit", passengers: "No passengers for the first 3 months" },
   VA: { permit: 186, hold: 9, night: "Midnight to 4 a.m.", passengers: "No more than 1 passenger under 21 for the first year" },
   WA: { permit: 180, hold: 6, night: "1 a.m. to 5 a.m.", passengers: "No passengers under 20 for the first 6 months",
      notes: { permit: "That's if you're enrolled in driver education; otherwise it's 15 and a half." } },
   WV: { permit: 180, hold: 6, night: "10 p.m. to 5 a.m.", passengers: "No passengers under 20 for the first 6 months" },
   WI: { permit: 180, hold: 6, night: "Midnight to 5 a.m.", passengers: "No more than 1 passenger" },
   WY: { permit: 180, hold: "10 days", night: "11 p.m. to 5 a.m.", passengers: "No more than 1 passenger under 18" },
};

const StateQuiz = {
   TOPIC: "Your state",
   SOURCE: "IIHS, October 2026",
   AGES: [168, 174, 180, 186, 192, 198, 204], // months
   HOLDS: [3, 6, 9, 12], // months
   HOURS: [20, 30, 40, 45, 50, 60, 65, 70, 100],

   // "15 years old", "15 years, 6 months old"
   age(months) {
      const years = Math.floor(months / 12);
      const rest = months % 12;
      return rest ? years + " years, " + rest + " months old" : years + " years old";
   },

   hold(value) {
      return typeof value == "string" ? value : value + " months";
   },

   hours(hours, night) {
      if (!hours) return "No state minimum";
      return night ? hours + " hours, " + night + " of them at night" : hours + " hours";
   },

   // The questions for one state (code like "OH"), or [] for an unknown one.
   // Each has q and why with {state} in them (vars.state is the state's name),
   // and whyParts: [[text, vars], ...] to show the explanation in any language.
   questionsFor(code) {
      const law = STATE_LAWS[code];
      const hours = PracticeLog.STATES[code];
      if (!law || !hours) return [];
      const name = hours.name;
      const notes = law.notes || {};
      const questions = [];
      const add = (kind, q, right, wrong, reminder, note = notes[kind]) => {
         /** @type {[string, Object<string, string>][]} */
         const parts = [["{state}: {answer}.", { state: name, answer: right }]];
         if (note) parts.push([note, {}]);
         parts.push([reminder, {}], ["Laws change, so check {state}'s driver's manual too.", { state: name }]);
         questions.push({
            id: "state-" + code + "-" + kind,
            topic: StateQuiz.TOPIC,
            state: code,
            vars: { state: name },
            q,
            options: [right, ...wrong],
            whyParts: parts,
            why: parts.map(([text, vars]) => text.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? vars[k] : m))).join(" "),
         });
      };
      const nearest = (list, value) => list.filter((v) => v != value).sort((a, b) => Math.abs(a - value) - Math.abs(b - value) || a - b).slice(0, 3);

      add("permit",
         law.noPermit ? "In {state}, what's the youngest age you can start driving with a supervisor?" : "In {state}, what's the youngest age you can get a learner's permit?",
         StateQuiz.age(law.permit), nearest(StateQuiz.AGES, law.permit).map(StateQuiz.age),
         "Most states also ask for a vision test and a written test like this one.");
      if (law.hold != null) {
         const wrong = typeof law.hold == "string" ? [3, 6, 12] : StateQuiz.HOLDS.filter((h) => h != law.hold);
         add("hold", "In {state}, how long must you hold your learner's permit before you can get a license?",
            StateQuiz.hold(law.hold), wrong.map(StateQuiz.hold),
            "The time counts from the day your permit is issued.");
      }
      const wrongHours = hours.hours
         ? nearest(StateQuiz.HOURS, hours.hours).map((h) => StateQuiz.hours(h, hours.night))
         : [StateQuiz.hours(30, 0), StateQuiz.hours(40, 0), StateQuiz.hours(50, 10)];
      add("hours", "In {state}, how many hours of supervised driving practice must a teen log before getting a license?",
         StateQuiz.hours(hours.hours, hours.night), wrongHours,
         "A parent or guardian usually signs off on the hours, so keep a practice log.", hours.note);
      // night and passenger limits: the other answers are other states' rules
      // (never one that starts the same way, like "No passengers" and "No passengers under 18")
      const others = (field) => {
         const right = law[field];
         const seen = new Set();
         return Object.entries(STATE_LAWS)
            .map(([c, l]) => l[field])
            .filter((v) => v && !seen.has(v) && seen.add(v) && !v.startsWith(right) && !right.startsWith(v))
            .sort((a, b) => StateQuiz.hash(code + a) - StateQuiz.hash(code + b))
            .slice(0, 3);
      };
      if (law.night) {
         add("night", "In {state}, during which hours can a newly licensed teen not drive without a licensed adult?",
            law.night, others("night"),
            "Most states make exceptions, for example for driving to or from work or school.");
      }
      if (law.passengers) {
         add("passengers", "In {state}, what's the passenger limit for a newly licensed teen driver?",
            law.passengers, others("passengers"),
            "Family members usually don't count, and the limit ends after a while or at a certain age.");
      }
      return questions;
   },

   // A practice test (like Quiz.create): `count` questions, up to `fromState`
   // of them about the student's state and the rest general
   mix(general, state, count, fromState = 3, random = Math.random) {
      const pick = (list, n) => Quiz.create(list, n, random).map((q) => list.find((item) => item.id == q.id));
      const mine = pick(state, Math.min(fromState, count, state.length));
      const chosen = [...mine, ...pick(general, Math.min(general.length, count - mine.length))];
      return Quiz.create(chosen, chosen.length, random);
   },

   // A repeatable number for a piece of text (to pick wrong answers)
   hash(text) {
      let h = 0;
      for (const ch of text) h = (h * 31 + ch.charCodeAt(0)) | 0;
      return h;
   },
};
