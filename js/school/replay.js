// Records a drive so it can be watched again afterwards, like a dash cam,
// with every mistake marked on the timeline. Keeps plain snapshots (where
// each car and person was), not the live objects. Pure logic (tested in Node).
class DriveRecorder {
   // every: keep one snapshot per this many frames
   // maxSnapshots: stop recording after this many (10 minutes at the default)
   constructor({ every = 2, maxSnapshots = 18000 } = {}) {
      this.every = every;
      this.maxSnapshots = maxSnapshots;
      this.snapshots = [];
      this.count = 0;
   }

   get length() {
      return this.snapshots.length;
   }

   // Seconds of driving the recording covers
   get seconds() {
      return (this.snapshots.length * this.every) / 60;
   }

   // Call once per frame. coachFrame: the coach's frame number (events use it).
   capture({ coachFrame, worldFrame, car, traffic = [], people = [], route = null, extra = null }) {
      if (this.count++ % this.every != 0 || this.snapshots.length >= this.maxSnapshots) {
         return;
      }
      this.snapshots.push({
         coachFrame,
         worldFrame,
         route,
         car: DriveRecorder.#pose(car),
         traffic: traffic.map((t) => DriveRecorder.#pose(t)),
         people: people.map((p) => ({
            crossing: p.crossing, side: p.side, t: p.t, state: p.state, shirt: p.shirt, skin: p.skin, x: p.x, y: p.y,
         })),
         extra,
      });
   }

   static #pose(c) {
      return {
         x: c.x, y: c.y, angle: c.angle, speed: c.speed, color: c.color,
         braking: !!(c.controls && c.controls.reverse && c.speed > 0),
         signal: (c.controls && c.controls.signal) || null,
         damaged: !!c.damaged, arrived: !!c.arrived,
         width: c.width, height: c.height, siren: !!c.siren,
      };
   }

   // The snapshot closest to a coach frame
   indexOfFrame(coachFrame) {
      let lo = 0;
      let hi = this.snapshots.length - 1;
      if (hi < 0) return -1;
      while (lo < hi) {
         const mid = (lo + hi) >> 1;
         if (this.snapshots[mid].coachFrame < coachFrame) lo = mid + 1;
         else hi = mid;
      }
      return lo;
   }

   // Timeline marks for the coach's events: where (0-1) each one happened
   markers(events) {
      const last = Math.max(1, this.snapshots.length - 1);
      return events
         .filter((e) => e.frame != null)
         .map((e) => {
            const index = this.indexOfFrame(e.frame);
            return { index, at: index / last, severity: e.severity, title: e.title, rule: e.rule, event: e };
         });
   }

   // Where to start watching a mistake: a couple of seconds before it
   leadIn(index, seconds = 2) {
      return Math.max(0, index - Math.round((seconds * 60) / this.every));
   }
}
