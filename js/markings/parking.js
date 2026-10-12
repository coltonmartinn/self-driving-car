class Parking extends Marking {
   constructor(center, directionVector, width, height) {
      super(center, directionVector, width, height);
      this.borders = [this.poly.segments[0], this.poly.segments[2]];
      this.type = "parking";
   }

   draw(ctx) {
      for (const border of this.borders) {
         border.draw(ctx, { width: 5, color: "white" });
      }
      this.drawText(ctx, "P", 0.9);
   }
}
