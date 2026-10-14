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

   // A phone buzzing (two short, low pulses)
   buzz() {
      this.#tone(140, 0.16, { type: "square", volume: 0.07 });
      this.#tone(140, 0.16, { type: "square", volume: 0.07, delay: 0.24 });
   }

   // An ambulance's wail; loudness 0 (silent) to 1 (right here). Call every frame.
   siren(loudness) {
      const ctx = loudness > 0.02 ? this.#audio() : null;
      if (!ctx) {
         if (this.sirenGain) {
            this.sirenGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.1);
         }
         return;
      }
      if (!this.sirenOsc) {
         this.sirenOsc = ctx.createOscillator();
         this.sirenOsc.type = "sawtooth";
         const wobble = ctx.createOscillator();
         wobble.frequency.value = 0.6; // up and down, a bit more than once a second
         const depth = ctx.createGain();
         depth.gain.value = 260;
         wobble.connect(depth).connect(this.sirenOsc.frequency);
         this.sirenOsc.frequency.value = 900;
         this.sirenGain = ctx.createGain();
         this.sirenGain.gain.value = 0;
         const soften = ctx.createBiquadFilter();
         soften.frequency.value = 1800;
         this.sirenOsc.connect(soften).connect(this.sirenGain).connect(ctx.destination);
         this.sirenOsc.start();
         wobble.start();
      }
      this.sirenGain.gain.setTargetAtTime(0.06 * loudness, ctx.currentTime, 0.1);
   }

   finish(passed) {
      const notes = passed ? [523, 659, 784, 1047] : [392, 330];
      notes.forEach((f, i) => this.#tone(f, 0.3, { volume: 0.1, delay: i * 0.12 }));
   }
}
