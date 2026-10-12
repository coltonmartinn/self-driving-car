class Stop extends Marking {
   constructor(center, directionVector, width, height) {
      super(center, directionVector, width, height);
      this.border = this.poly.segments[0];
      this.type = "stop";
   }

   draw(ctx) {
      this.border.draw(ctx, { width: 5, color: "white" });
      this.drawText(ctx, "STOP", 0.3, 2);
   }
}
