// Controls for a student driver: keyboard (arrows / WASD, Q and E for turn
// signals, Z and C to look over a shoulder), on-screen pedals and buttons
// for touch screens, and game controllers or steering wheels.
class PlayerControls {
   constructor() {
      this.forward = false;
      this.left = false;
      this.right = false;
      this.reverse = false;
      this.signal = null; // "left", "right" or null
      this.enabled = true;
      // analog controls, from a game controller (null = use the keys)
      this.steer = null; // -1 (right) to 1 (left)
      this.throttle = null; // 0 to 1
      this.brake = null; // 0 to 1
      this.gamepad = null; // the controller's name, once it's been used
      this.padButtons = []; // last frame's buttons, to catch presses
      // shoulder checks: which side, and a count that goes up each time
      this.looked = null;
      this.lookCount = 0;
      this.onAction = null; // (name) => {}: a controller's pause button, etc.

      this.keys = new Set();
      this.touches = new Set();
      this.#addKeyboardListeners();
   }

   // A glance over the shoulder, at the blind spot on that side
   // (force: even while the student isn't driving, e.g. in a demo drive)
   lookOver(side, force = false) {
      if (!this.enabled && !force) return;
      this.looked = side;
      this.lookCount++;
   }

   // Read a game controller or wheel (call once per frame). Standard
   // layout: left stick or wheel steers, right trigger is gas, left
   // trigger is brake, bumpers signal, D-pad left/right look over a shoulder.
   pollGamepad() {
      const pads = typeof navigator != "undefined" && navigator.getGamepads ? navigator.getGamepads() : [];
      const pad = [...pads].find((p) => p && p.connected);
      if (!pad || !this.enabled) {
         this.steer = this.throttle = this.brake = null;
         return;
      }
      const value = (i) => (pad.buttons[i] ? pad.buttons[i].value || (pad.buttons[i].pressed ? 1 : 0) : 0);
      const dead = (v, d) => (Math.abs(v) < d ? 0 : (v - Math.sign(v) * d) / (1 - d));
      const steer = -dead(pad.axes[0] || 0, 0.08);
      const gas = Math.max(value(7), value(0)); // right trigger, or A
      const brake = Math.max(value(6), value(1)); // left trigger, or B
      const pressed = (i) => value(i) > 0.5 && !(this.padButtons[i] > 0.5);
      if (pressed(4)) this.toggleSignal("left");
      if (pressed(5)) this.toggleSignal("right");
      if (pressed(14)) this.lookOver("left");
      if (pressed(15)) this.lookOver("right");
      if (pressed(9) && this.onAction) this.onAction("pause");
      this.padButtons = pad.buttons.map((b) => b.value || (b.pressed ? 1 : 0));

      const active = steer != 0 || gas > 0.02 || brake > 0.02;
      if (!active && this.gamepad == null) return; // plugged in, not used yet
      this.gamepad = pad.id;
      this.steer = steer;
      this.throttle = gas;
      this.brake = brake;
      // the on/off versions, for brake lights and the coach
      this.forward = gas > 0.1 || this.keys.has("forward") || this.touches.has("forward");
      this.reverse = brake > 0.1 || this.keys.has("reverse") || this.touches.has("reverse");
      this.left = steer > 0.2;
      this.right = steer < -0.2;
      if (!active && (this.keys.size > 0 || this.touches.size > 0)) {
         this.steer = this.throttle = this.brake = null; // the keys take over
         this.#apply();
      }
   }

   toggleSignal(side) {
      this.signal = this.signal == side ? null : side;
   }

   cancelSignal() {
      this.signal = null;
   }

   reset() {
      this.keys.clear();
      this.touches.clear();
      this.signal = null;
      this.looked = null;
      this.steer = this.throttle = this.brake = null;
      this.#apply();
   }

   #apply() {
      const on = (name) => this.enabled && (this.keys.has(name) || this.touches.has(name));
      this.forward = on("forward");
      this.reverse = on("reverse");
      this.left = on("left");
      this.right = on("right");
   }

   #addKeyboardListeners() {
      const keys = {
         ArrowUp: "forward", w: "forward", W: "forward",
         ArrowDown: "reverse", s: "reverse", S: "reverse",
         ArrowLeft: "left", a: "left", A: "left",
         ArrowRight: "right", d: "right", D: "right",
      };
      document.addEventListener("keydown", (evt) => {
         if (evt.target instanceof HTMLInputElement) return;
         if (evt.key == "q" || evt.key == "Q") {
            if (!evt.repeat && this.enabled) this.toggleSignal("left");
            return;
         }
         if (evt.key == "e" || evt.key == "E") {
            if (!evt.repeat && this.enabled) this.toggleSignal("right");
            return;
         }
         if (evt.key == "z" || evt.key == "Z" || evt.key == "c" || evt.key == "C") {
            if (!evt.repeat) this.lookOver(evt.key.toLowerCase() == "z" ? "left" : "right");
            return;
         }
         const key = keys[evt.key];
         if (key) {
            this.keys.add(key);
            this.#apply();
            evt.preventDefault();
         }
      });
      document.addEventListener("keyup", (evt) => {
         const key = keys[evt.key];
         if (key) {
            this.keys.delete(key);
            this.#apply();
         }
      });
      window.addEventListener("blur", () => {
         this.keys.clear();
         this.#apply();
      });
   }

   // Hold-to-press buttons: <button data-control="forward">
   bindButton(button) {
      const name = button.dataset.control;
      const press = (evt) => {
         evt.preventDefault();
         this.touches.add(name);
         button.classList.add("pressed");
         this.#apply();
      };
      const release = () => {
         this.touches.delete(name);
         button.classList.remove("pressed");
         this.#apply();
      };
      button.addEventListener("pointerdown", press);
      button.addEventListener("pointerup", release);
      button.addEventListener("pointerleave", release);
      button.addEventListener("pointercancel", release);
      button.addEventListener("contextmenu", (evt) => evt.preventDefault());
   }
}
