const test = require("node:test");
const assert = require("node:assert/strict");
const { loadApp } = require("./helpers/loadApp");

const { Quiz, QUIZ_BANK, SIGNS } = loadApp({ seed: 5 });

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
