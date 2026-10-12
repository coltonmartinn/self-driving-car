// Controls for a student driver: keyboard (arrows / WASD, Q and E for turn
// signals) plus on-screen pedals and buttons for touch screens.
class PlayerControls {
   constructor() {
      this.forward = false;
      this.left = false;
      this.right = false;
      this.reverse = false;
      this.signal = null; // "left", "right" or null
      this.enabled = true;

      this.keys = new Set();
      this.touches = new Set();
      this.#addKeyboardListeners();
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
