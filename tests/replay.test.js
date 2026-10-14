const test = require("node:test");
const assert = require("node:assert/strict");
const { loadApp } = require("./helpers/loadApp");

const { DriveRecorder, Car } = loadApp({ seed: 1 });

function driveStraight(recorder, frames) {
   const car = new Car(0, 0, 30, 50, "DUMMY", 0, 2);
   const other = new Car(40, -300, 30, 50, "DUMMY", 0, 1);
   for (let f = 1; f <= frames; f++) {
      car.update([], []);
      other.update([], []);
      recorder.capture({ coachFrame: f, worldFrame: 100 + f, car, traffic: [other] });
   }
   return car;
}

test("the recorder keeps one snapshot every few frames, as plain data", () => {
   const recorder = new DriveRecorder({ every: 2 });
   const car = driveStraight(recorder, 120);
   assert.equal(recorder.length, 60);
   assert.equal(recorder.seconds, 2);
   const last = recorder.snapshots[recorder.length - 1];
   assert.ok(last.car.y < -100, "the car moved forward");
   assert.ok(last.car.y > car.y - 5, "and the snapshot is where it was, not a live reference");
   assert.equal(last.traffic.length, 1);
   assert.equal(typeof last.traffic[0].x, "number");
});

test("snapshots stop at the limit, so a long drive can't use up memory", () => {
   const recorder = new DriveRecorder({ every: 1, maxSnapshots: 50 });
   driveStraight(recorder, 200);
   assert.equal(recorder.length, 50);
});

test("mistakes are placed on the timeline where they happened", () => {
   const recorder = new DriveRecorder({ every: 2 });
   driveStraight(recorder, 600);
   const marks = recorder.markers([
      { frame: 1, severity: "good", title: "start" },
      { frame: 301, severity: "major", title: "half way" },
      { frame: 599, severity: "minor", title: "end" },
   ]);
   assert.equal(marks.length, 3);
   assert.equal(marks[0].at, 0);
   assert.ok(Math.abs(marks[1].at - 0.5) < 0.01, "a mistake half way is half way along: " + marks[1].at);
   assert.ok(marks[2].at > 0.99);
   assert.equal(recorder.snapshots[marks[1].index].coachFrame, 301);
});

test("watching a mistake starts a couple of seconds before it", () => {
   const recorder = new DriveRecorder({ every: 2 });
   driveStraight(recorder, 600);
   const index = recorder.indexOfFrame(401);
   const start = recorder.leadIn(index, 2);
   const seconds = (recorder.snapshots[index].coachFrame - recorder.snapshots[start].coachFrame) / 60;
   assert.equal(seconds, 2);
   assert.equal(recorder.leadIn(3, 2), 0, "never before the start of the drive");
});

test("a car can be placed without driving it there", () => {
   const car = new Car(0, 0, 30, 50, "DUMMY", 0, 2);
   car.place(500, -200, Math.PI / 2);
   const xs = car.polygon.map((p) => p.x);
   assert.ok(Math.min(...xs) > 470 && Math.max(...xs) < 530, "the outline moved with it");
   assert.equal(car.speed, 0);
});
