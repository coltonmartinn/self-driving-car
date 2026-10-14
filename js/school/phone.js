// The "Phone down" lesson: texts arrive while you drive. The first time,
// you glance at it (2 seconds), so you can see how far the car goes while
// you're not looking. After that, replying means looking away again; leaving
// it is the right call. Pure logic (tested in Node); drive.html shows it.
class PhoneBuzz {
   static MESSAGES = [
      { from: "Mom", text: "Where are you?? Text me back" },
      { from: "Jordan", text: "yo did u see what happened 😂" },
      { from: "Group chat (6)", text: "who's coming tonight??" },
      { from: "Coach Davis", text: "Practice moved to 4:30, reply if you can't make it" },
      { from: "Sam", text: "call me when u get this" },
      { from: "Riley", text: "omg you HAVE to see this" },
   ];

   // forcedFirst: the first text makes you glance (not in a demo drive)
   constructor({ first = 360, gap = [540, 780], forcedFirst = true, random = Math.random } = {}) {
      this.random = random;
      this.gap = gap;
      this.forcedFirst = forcedFirst;
      this.frame = 0;
      this.next = first;
      this.count = 0;
      this.message = null; // { from, text, shown (frame), forced }
      this.blind = 0; // frames left looking at the phone
      this.blindFrames = 0;
      this.blindDistance = 0; // world units the car went, unseen, this glance
      this.totalBlindDistance = 0;
      this.totalBlindFrames = 0;
      this.replies = 0;
      this.lookForced = false; // the glance now is the lesson's first, forced one
      this.ignored = 0;
   }

   get looking() {
      return this.blind > 0;
   }

   // A glance at the phone: you can't see the road for `seconds`
   #glance(seconds) {
      this.blind = Math.round(seconds * 60);
      this.blindFrames = this.blind;
      this.blindDistance = 0;
   }

   // Tap Reply on the text that's showing
   reply() {
      if (!this.message || this.looking) return false;
      this.replies++;
      this.message.replied = true;
      this.#glance(2.5);
      this.lookForced = false;
      return true;
   }

   // One frame. Returns what happened, or null:
   // { type: "buzz", message } a text arrives
   // { type: "look", forced } eyes go to the phone
   // { type: "eyes-up", seconds, distance, forced } eyes back on the road
   // { type: "ignored" } the text went away unanswered
   update(car) {
      this.frame++;
      if (this.looking) {
         this.blind--;
         const step = Math.abs(car.speed);
         this.blindDistance += step;
         this.totalBlindDistance += step;
         this.totalBlindFrames++;
         if (this.blind == 0) {
            this.message = null;
            this.next = this.frame + this.#gap();
            return { type: "eyes-up", seconds: this.blindFrames / 60, distance: this.blindDistance, forced: this.lookForced };
         }
         return null;
      }
      if (this.message) {
         const age = this.frame - this.message.shown;
         if (this.message.forced && age == 45) {
            this.#glance(2);
            this.lookForced = true;
            return { type: "look", forced: true };
         }
         if (!this.message.forced && age > 6 * 60) {
            this.message = null;
            this.ignored++;
            this.next = this.frame + this.#gap();
            return { type: "ignored" };
         }
         return null;
      }
      if (this.frame >= this.next && Math.abs(car.speed) > 0.6 && !car.damaged && !car.arrived) {
         const message = PhoneBuzz.MESSAGES[this.count % PhoneBuzz.MESSAGES.length];
         this.message = { ...message, shown: this.frame, forced: this.forcedFirst && this.count == 0, replied: false };
         this.count++;
         return { type: "buzz", message: this.message };
      }
      return null;
   }

   #gap() {
      return this.gap[0] + Math.floor(this.random() * (this.gap[1] - this.gap[0]));
   }
}
