// Base class: a rectangle centered on a road, aligned with its direction
class Marking {
   constructor(center, directionVector, width, height) {
      this.center = center;
      this.directionVector = directionVector;
      this.width = width;
      this.height = height;

      this.support = new Segment(
         translate(center, angle(directionVector), height / 2),
         translate(center, angle(directionVector), -height / 2)
      );
      this.poly = new Envelope(this.support, width, 0).poly;

      this.type = "marking";
   }

   static load(info) {
      const point = new Point(info.center.x, info.center.y);
      const dir = new Point(info.directionVector.x, info.directionVector.y);
      switch (info.type) {
         case "crossing":
            return new Crossing(point, dir, info.width, info.height);
         case "light":
            return new Light(point, dir, info.width, info.height);
         case "marking":
            return new Marking(point, dir, info.width, info.height);
         case "parking":
            return new Parking(point, dir, info.width, info.height);
         case "start":
            return new Start(point, dir, info.width, info.height);
         case "stop":
            return new Stop(point, dir, info.width, info.height);
         case "target":
            return new Target(point, dir, info.width, info.height);
         case "yield":
            return new Yield(point, dir, info.width, info.height);
      }
   }

   toJSON() {
      return {
         type: this.type,
         center: this.center,
         directionVector: this.directionVector,
         width: this.width,
         height: this.height,
      };
   }

   // Rotation that makes the canvas "up" point along the driving direction
   getRotation() {
      return angle(this.directionVector) + Math.PI / 2;
   }

   drawText(ctx, text, fontScale, stretch = 1) {
      ctx.save();
      ctx.translate(this.center.x, this.center.y);
      ctx.rotate(this.getRotation());
      ctx.scale(1, stretch);

      ctx.beginPath();
      ctx.textBaseline = "middle";
      ctx.textAlign = "center";
      ctx.fillStyle = "white";
      ctx.font = "bold " + this.height * fontScale + "px Arial";
      ctx.fillText(text, 0, 1);

      ctx.restore();
   }

   draw(ctx) {
      this.poly.draw(ctx);
   }
}
