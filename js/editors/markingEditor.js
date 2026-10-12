// Shared logic for placing markings: snap to the nearest target segment,
// preview the marking there, click to place it, right-click to remove one.
class MarkingEditor {
   constructor(viewport, world, getTargetSegments) {
      this.viewport = viewport;
      this.world = world;
      this.getTargetSegments = getTargetSegments;

      this.canvas = viewport.canvas;
      this.ctx = this.canvas.getContext("2d");

      this.mouse = null;
      this.intent = null;

      this.boundMouseDown = this.#handleMouseDown.bind(this);
      this.boundMouseMove = this.#handleMouseMove.bind(this);
      this.boundContextMenu = (evt) => evt.preventDefault();
   }

   // to be overwritten by subclasses
   createMarking(center, directionVector) {
      return center;
   }

   enable() {
      this.#addEventListeners();
   }

   disable() {
      this.#removeEventListeners();
      this.intent = null;
   }

   #addEventListeners() {
      this.canvas.addEventListener("mousedown", this.boundMouseDown);
      this.canvas.addEventListener("mousemove", this.boundMouseMove);
      this.canvas.addEventListener("contextmenu", this.boundContextMenu);
   }

   #removeEventListeners() {
      this.canvas.removeEventListener("mousedown", this.boundMouseDown);
      this.canvas.removeEventListener("mousemove", this.boundMouseMove);
      this.canvas.removeEventListener("contextmenu", this.boundContextMenu);
   }

   #handleMouseMove(evt) {
      this.mouse = this.viewport.getMouse(evt, true);
      const seg = getNearestSegment(
         this.mouse,
         this.getTargetSegments(),
         10 * this.viewport.zoom
      );
      if (seg) {
         const proj = seg.projectPoint(this.mouse);
         if (proj.offset >= 0 && proj.offset <= 1) {
            let dir = seg.directionVector();
            if (evt.shiftKey) {
               dir = scale(dir, -1); // Shift flips the marking around
            }
            this.intent = this.createMarking(proj.point, dir);
         } else {
            this.intent = null;
         }
      } else {
         this.intent = null;
      }
   }

   #handleMouseDown(evt) {
      if (evt.button == 0 && !evt.altKey) { // left click
         if (this.intent) {
            this.world.markings.push(this.intent);
            this.intent = null;
         }
      }
      if (evt.button == 2) { // right click
         const markings = this.world.markings;
         for (let i = 0; i < markings.length; i++) {
            if (markings[i].poly.containsPoint(this.mouse)) {
               markings.splice(i, 1);
               return;
            }
         }
      }
   }

   display() {
      for (const seg of this.getTargetSegments()) {
         seg.draw(this.ctx, { color: "rgba(255,255,0,0.4)", width: 2, dash: [4, 6] });
      }
      if (this.intent) {
         this.ctx.globalAlpha = 0.6;
         this.intent.draw(this.ctx);
         this.ctx.globalAlpha = 1;
      }
   }
}
