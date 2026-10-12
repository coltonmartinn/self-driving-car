class Tree {
   constructor(center, size, height = 200) {
      this.center = center;
      this.size = size;
      this.height = height;
      this.base = this.#generateLevel(center, size);
   }

   static load(info) {
      return new Tree(new Point(info.center.x, info.center.y), info.size, info.height);
   }

   // the base polygon is regenerated from the center, no need to save it
   toJSON() {
      return { center: this.center, size: this.size, height: this.height };
   }

   // A wobbly circle; the noise is seeded by the tree's position so it
   // doesn't flicker between frames
   #generateLevel(point, size) {
      const points = [];
      const rad = size / 2;
      for (let a = 0; a < Math.PI * 2; a += Math.PI / 16) {
         const kindOfRandom = Math.cos(((a + this.center.x) * size) % 17) ** 2;
         const noisyRadius = rad * lerp(0.5, 1, kindOfRandom);
         points.push(translate(point, a, noisyRadius));
      }
      return new Polygon(points);
   }

   draw(ctx, viewPoint) {
      const top = getFake3dPoint(this.center, viewPoint, this.height);

      const levelCount = 7;
      for (let level = 0; level < levelCount; level++) {
         const t = level / (levelCount - 1);
         const point = lerp2D(this.center, top, t);
         const color = "rgb(30," + lerp(50, 200, t) + ",70)";
         const size = lerp(this.size, 40, t);
         const poly = this.#generateLevel(point, size);
         poly.draw(ctx, { fill: color, stroke: "rgba(0,0,0,0)" });
      }
   }
}
