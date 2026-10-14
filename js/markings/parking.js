class Parking extends Marking {
   constructor(center, directionVector, width, height) {
      super(center, directionVector, width, height);
      this.borders = [this.poly.segments[0], this.poly.segments[2]];
      this.type = "parking";
      this.parallel = false; // a space between two parked cars (Driving School)
   }

   draw(ctx) {
      for (const border of this.borders) {
         border.draw(ctx, { width: 5, color: "white" });
      }
      this.drawText(ctx, "P", 0.9);
   }
}
