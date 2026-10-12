class Yield extends Marking {
   constructor(center, directionVector, width, height) {
      super(center, directionVector, width, height);
      this.border = this.poly.segments[0];
      this.type = "yield";
   }

   draw(ctx) {
      this.border.draw(ctx, { width: 5, color: "white", dash: [8, 6] });
      this.drawText(ctx, "YIELD", 0.24, 2);
   }
}
