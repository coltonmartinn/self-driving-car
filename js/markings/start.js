// Where the self-driving cars spawn, facing the arrow
class Start extends Marking {
   constructor(center, directionVector, width, height) {
      super(center, directionVector, width, height);
      this.type = "start";
   }

   draw(ctx) {
      ctx.save();
      ctx.translate(this.center.x, this.center.y);
      ctx.rotate(this.getRotation());

      // car body
      ctx.beginPath();
      ctx.fillStyle = "#2266dd";
      ctx.roundRect(-15, -25, 30, 50, 6);
      ctx.fill();
      // windshield
      ctx.beginPath();
      ctx.fillStyle = "#9cd";
      ctx.fillRect(-11, -14, 22, 9);
      // direction arrow
      ctx.beginPath();
      ctx.fillStyle = "white";
      ctx.moveTo(0, -this.height / 2 - 12);
      ctx.lineTo(-8, -this.height / 2 + 2);
      ctx.lineTo(8, -this.height / 2 + 2);
      ctx.fill();

      ctx.restore();
   }
}
