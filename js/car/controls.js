class Controls {
   constructor(type) {
      this.forward = false;
      this.left = false;
      this.right = false;
      this.reverse = false;

      switch (type) {
         case "KEYS":
            this.#addKeyboardListeners();
            break;
         case "DUMMY":
            this.forward = true;
            break;
      }
   }

   #addKeyboardListeners() {
      const keys = {
         ArrowUp: "forward", w: "forward",
         ArrowDown: "reverse", s: "reverse",
         ArrowLeft: "left", a: "left",
         ArrowRight: "right", d: "right",
      };
      document.addEventListener("keydown", (evt) => {
         const key = keys[evt.key];
         if (key) {
            this[key] = true;
            evt.preventDefault();
         }
      });
      document.addEventListener("keyup", (evt) => {
         const key = keys[evt.key];
         if (key) {
            this[key] = false;
         }
      });
   }
}
