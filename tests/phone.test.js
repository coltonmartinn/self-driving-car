const test = require("node:test");
const assert = require("node:assert/strict");
const { loadApp } = require("./helpers/loadApp");

const { PhoneBuzz } = loadApp({ seed: 1 });

const moving = { speed: 1.8, damaged: false, arrived: false }; // about 24 mph

function run(phone, frames, onEvent = () => {}) {
   const events = [];
   for (let i = 0; i < frames; i++) {
      const e = phone.update(moving);
      if (e) {
         events.push(e);
         onEvent(e);
      }
   }
   return events;
}

test("the first text makes you glance at it for 2 seconds, and counts how far you drove blind", () => {
   const phone = new PhoneBuzz({ first: 10, random: () => 0 });
   const events = run(phone, 300);
   assert.equal(events[0].type, "buzz");
   assert.equal(events[1].type, "look");
   const up = events.find((e) => e.type == "eyes-up");
   assert.equal(up.forced, true);
   assert.equal(up.seconds, 2);
   assert.ok(Math.abs(up.distance - 1.8 * 120) < 1, "120 frames at 1.8: " + up.distance);
});

test("after that, a text you leave alone just goes away", () => {
   const phone = new PhoneBuzz({ first: 10, gap: [100, 100], random: () => 0 });
   const events = run(phone, 1000).map((e) => e.type);
   assert.ok(events.includes("ignored"));
   assert.equal(phone.replies, 0);
});

test("replying means looking away again, for longer", () => {
   const phone = new PhoneBuzz({ first: 10, gap: [100, 100], forcedFirst: false, random: () => 0 });
   let up = null;
   run(phone, 600, (e) => {
      if (e.type == "buzz") assert.ok(phone.reply());
      if (e.type == "eyes-up" && !up) up = e;
   });
   assert.equal(up.forced, false);
   assert.equal(up.seconds, 2.5);
   assert.ok(phone.replies >= 1);
});

test("no texts while parked or stopped", () => {
   const phone = new PhoneBuzz({ first: 10 });
   for (let i = 0; i < 600; i++) assert.equal(phone.update({ speed: 0, damaged: false, arrived: false }), null);
});
