// Small overview of the whole road network, centered on the view point
class MiniMap {
   constructor(canvas, graph, size) {
      this.canvas = canvas;
      this.graph = graph;
      this.size = size;

      canvas.width = size;
      canvas.height = size;
      this.ctx = canvas.getContext("2d");
   }

   update(viewPoint, cars = []) {
      this.ctx.clearRect(0, 0, this.size, this.size);

      const scaler = 0.05;
      const scaledViewPoint = scale(viewPoint, -scaler);
      this.ctx.save();
      this.ctx.translate(
         scaledViewPoint.x + this.size / 2,
         scaledViewPoint.y + this.size / 2
      );
      this.ctx.scale(scaler, scaler);
      for (const seg of this.graph.segments) {
         seg.draw(this.ctx, { width: 3 / scaler, color: "white" });
      }
      for (const car of cars) {
         if (!car.damaged) {
            new Point(car.x, car.y).draw(this.ctx, {
               size: 4 / scaler,
               color: "rgba(255,255,0,0.6)",
            });
         }
      }
      this.ctx.restore();

      new Point(this.size / 2, this.size / 2).draw(this.ctx, {
         color: "blue",
         outline: true,
      });
   }
}
