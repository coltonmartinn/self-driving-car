// Traffic light. World cycles the state of every light at an intersection.
class Light extends Marking {
   // shapes on the lit lamp, so color isn't the only clue (for colorblind
   // drivers): a square for red, a triangle for yellow, a circle for green
   static shapes = false;

   constructor(center, directionVector, width, height) {
      super(center, directionVector, width, 18);
      this.state = "off";
      this.border = this.poly.segments[0];
      this.type = "light";
   }

   draw(ctx) {
      const perp = perpendicular(this.directionVector);
      const line = new Segment(
         add(this.center, scale(perp, this.width / 2)),
         add(this.center, scale(perp, -this.width / 2))
      );

      const green = lerp2D(line.p1, line.p2, 0.2);
      const yellow = lerp2D(line.p1, line.p2, 0.5);
      const red = lerp2D(line.p1, line.p2, 0.8);

      new Segment(red, green).draw(ctx, { width: this.height, cap: "round" });

      green.draw(ctx, { size: this.height * 0.6, color: "#060" });
      yellow.draw(ctx, { size: this.height * 0.6, color: "#660" });
      red.draw(ctx, { size: this.height * 0.6, color: "#600" });

      switch (this.state) {
         case "green":
            green.draw(ctx, { size: this.height * 0.6, color: "#0F0" });
            break;
         case "yellow":
            yellow.draw(ctx, { size: this.height * 0.6, color: "#FF0" });
            break;
         case "red":
            red.draw(ctx, { size: this.height * 0.6, color: "#F00" });
            break;
      }

      if (Light.shapes && this.state != "off") {
         const at = this.state == "green" ? green : this.state == "yellow" ? yellow : red;
         const r = this.height * 0.32;
         ctx.save();
         ctx.fillStyle = "#111";
         ctx.beginPath();
         if (this.state == "red") {
            ctx.rect(at.x - r * 0.8, at.y - r * 0.8, r * 1.6, r * 1.6);
         } else if (this.state == "yellow") {
            ctx.moveTo(at.x, at.y - r);
            ctx.lineTo(at.x + r, at.y + r * 0.8);
            ctx.lineTo(at.x - r, at.y + r * 0.8);
            ctx.closePath();
         } else {
            ctx.arc(at.x, at.y, r * 0.9, 0, Math.PI * 2);
         }
         ctx.fill();
         ctx.restore();
      }

      if (this.state != "off") {
         this.border.draw(ctx, { width: 5, color: "white" });
      }
   }
}
