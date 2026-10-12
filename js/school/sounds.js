// Small sound cues, synthesized with the Web Audio API (no audio files):
// the turn signal's tick-tock, a chime for good driving, a low tone for
// mistakes. Browsers only allow sound after the user interacts with the page.
class Sounds {
   constructor() {
      this.ctx = null;
      this.muted = false;
      this.lastTick = 0;
   }

   #audio() {
      if (this.muted) return null;
      if (!this.ctx) {
         const Ctx = window.AudioContext || window["webkitAudioContext"];
         if (!Ctx) return null;
         this.ctx = new Ctx();
      }
      if (this.ctx.state == "suspended") {
         this.ctx.resume();
      }
      return this.ctx;
   }

   #tone(freq, duration, { type = "sine", volume = 0.15, delay = 0 } = {}) {
      const ctx = this.#audio();
      if (!ctx) return;
      const t = ctx.currentTime + delay;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type;
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(volume, t + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + duration);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t);
      osc.stop(t + duration + 0.02);
   }

   // call every frame with whether the blinker light is on
   signal(lampOn) {
      if (lampOn != this.lastTick) {
         this.lastTick = lampOn;
         this.#tone(lampOn ? 1800 : 1400, 0.03, { type: "square", volume: 0.04 });
      }
   }

   good() {
      this.#tone(880, 0.18, { volume: 0.1 });
      this.#tone(1320, 0.25, { volume: 0.08, delay: 0.09 });
   }

   mistake(severity) {
      const low = severity == "critical" ? 160 : 220;
      this.#tone(low, 0.35, { type: "triangle", volume: 0.18 });
      if (severity != "minor") {
         this.#tone(low * 0.8, 0.4, { type: "triangle", volume: 0.15, delay: 0.18 });
      }
   }

   finish(passed) {
      const notes = passed ? [523, 659, 784, 1047] : [392, 330];
      notes.forEach((f, i) => this.#tone(f, 0.3, { volume: 0.1, delay: i * 0.12 }));
   }
}
