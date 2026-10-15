const test = require("node:test");
const assert = require("node:assert/strict");
const { loadApp } = require("./helpers/loadApp");

const { Quiz, QUIZ_BANK, SIGNS, StateQuiz, STATE_LAWS, PracticeLog } = loadApp({ seed: 5 });

test("every question is well-formed", () => {
   const ids = new Set();
   for (const q of QUIZ_BANK) {
      assert.ok(!ids.has(q.id), "duplicate id " + q.id);
      ids.add(q.id);
      assert.equal(q.options.length, 4, q.id);
      assert.equal(new Set(q.options).size, 4, q.id + ": options must differ");
      assert.ok(q.q.length > 10 && q.why.length > 10 && q.topic, q.id);
      if (q.sign) assert.ok(SIGNS[q.sign], q.id + ": unknown sign " + q.sign);
   }
   assert.ok(QUIZ_BANK.length >= 30);
});

test("a practice test shuffles answers but keeps track of the right one", () => {
   const questions = Quiz.create(QUIZ_BANK, 20);
   assert.equal(questions.length, 20);
   assert.equal(new Set(questions.map((q) => q.id)).size, 20, "no repeats");
   for (const q of questions) {
      const original = QUIZ_BANK.find((b) => b.id == q.id);
      assert.equal(q.options[q.answer], original.options[0]);
   }
   // the right answer isn't always in the same place
   assert.ok(new Set(questions.map((q) => q.answer)).size > 1);
});

test("grading counts correct answers and the topics that were missed", () => {
   const questions = Quiz.create(QUIZ_BANK, 10);
   const answers = questions.map((q) => q.answer);
   assert.equal(Quiz.grade(questions, answers).percent, 100);
   answers[0] = (questions[0].answer + 1) % 4;
   answers[1] = null; // unanswered counts as wrong
   const r = Quiz.grade(questions, answers);
   assert.equal(r.correct, 8);
   assert.equal(r.passed, true, "80% passes");
   const missed = Object.values(r.missedTopics).reduce((a, b) => a + b, 0);
   assert.equal(missed, 2);
});

test("every state and DC has questions on its own laws, and they're well-formed", () => {
   assert.deepEqual(Object.keys(STATE_LAWS).sort(), Object.keys(PracticeLog.STATES).sort());
   const ids = new Set(QUIZ_BANK.map((q) => q.id));
   for (const code of Object.keys(STATE_LAWS)) {
      const questions = StateQuiz.questionsFor(code);
      assert.ok(questions.length >= 3, code);
      for (const q of questions) {
         assert.ok(!ids.has(q.id), "duplicate id " + q.id);
         ids.add(q.id);
         assert.equal(q.state, code);
         assert.equal(q.topic, StateQuiz.TOPIC);
         assert.match(q.q, /\{state\}/);
         assert.equal(q.options.length, 4, q.id);
         assert.equal(new Set(q.options).size, 4, q.id + ": options must differ");
         // no wrong answer is just a shorter version of the right one
         for (const wrong of q.options.slice(1)) {
            assert.ok(!wrong.startsWith(q.options[0]) && !q.options[0].startsWith(wrong), q.id + ": " + wrong);
         }
         assert.ok(q.why.startsWith(PracticeLog.STATES[code].name + ": " + q.options[0]), q.id);
      }
   }
   assert.equal(StateQuiz.questionsFor("XX").length, 0);
});

test("state questions only ever talk about the student's own state", () => {
   const names = Object.values(PracticeLog.STATES).map((s) => s.name);
   for (const [code, state] of Object.entries(PracticeLog.STATES)) {
      const text = StateQuiz.questionsFor(code).map((q) => [q.q, ...q.options, q.why].join(" ").replace(/\{state\}/g, state.name)).join(" ");
      // (names inside its own, like Virginia in West Virginia, are fine;
      // so is "New York City", in New York's)
      const others = names.filter((n) => n != state.name && !state.name.includes(n));
      for (const other of others) {
         assert.ok(!new RegExp("\b" + other + "\b").test(text), code + " mentions " + other);
      }
   }
   // spot checks against the IIHS table
   const answer = (code, kind) => StateQuiz.questionsFor(code).find((q) => q.id.endsWith("-" + kind)).options[0];
   assert.equal(answer("CA", "permit"), "15 years, 6 months old");
   assert.equal(answer("NY", "hours"), "50 hours, 15 of them at night");
   assert.equal(answer("WY", "hold"), "10 days");
   assert.equal(answer("NC", "night"), "9 p.m. to 5 a.m.");
   assert.equal(answer("FL", "passengers"), "No limit set by state law");
   assert.equal(answer("AR", "hours"), "No state minimum");
});

test("a practice test mixes in a few questions on the student's state", () => {
   const own = StateQuiz.questionsFor("OH");
   const test20 = StateQuiz.mix(QUIZ_BANK, own, 20);
   assert.equal(test20.length, 20);
   assert.equal(new Set(test20.map((q) => q.id)).size, 20);
   assert.equal(test20.filter((q) => q.state == "OH").length, 3);
   assert.ok(test20.every((q) => !q.state || q.state == "OH"));
   for (const q of test20) {
      const original = [...QUIZ_BANK, ...own].find((b) => b.id == q.id);
      assert.equal(q.options[q.answer], original.options[0]);
   }
   // everything: all of the state's questions
   const all = StateQuiz.mix(QUIZ_BANK, own, QUIZ_BANK.length + own.length, own.length);
   assert.equal(all.filter((q) => q.state == "OH").length, own.length);
   // no state picked: general questions only
   assert.ok(StateQuiz.mix(QUIZ_BANK, [], 20).every((q) => !q.state));
});
