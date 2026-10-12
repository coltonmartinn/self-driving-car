class Car {
   constructor(x, y, width, height, controlType, angle = 0, maxSpeed = 3, color = "blue") {
      this.x = x;
      this.y = y;
      this.width = width;
      this.height = height;

      this.speed = 0;
      this.acceleration = 0.2;
      this.maxSpeed = maxSpeed;
      this.friction = 0.05;
      this.angle = angle; // 0 = facing up (-y)
      this.damaged = false;
      this.fitness = 0;
      this.color = color;

      this.useBrain = controlType == "AI";

      if (controlType != "DUMMY") {
         this.sensor = new Sensor(this);
         this.brain = new NeuralNetwork([this.sensor.rayCount, 6, 4]);
      }
      this.controls = new Controls(controlType);
      this.polygon = this.#createPolygon();
   }

   update(roadBorders, traffic) {
      // only borders near the car can be seen or hit
      const r = (this.sensor ? this.sensor.rayLength : 0) + this.height;
      const nearby = roadBorders.filter(
         ([a, b]) =>
            Math.max(a.x, b.x) > this.x - r &&
            Math.min(a.x, b.x) < this.x + r &&
            Math.max(a.y, b.y) > this.y - r &&
            Math.min(a.y, b.y) < this.y + r
      );

      if (!this.damaged) {
         this.#move();
         this.fitness += this.speed;
         this.polygon = this.#createPolygon();
         this.damaged = this.#assessDamage(nearby, traffic);
      }
      if (this.sensor) {
         this.sensor.update(nearby, traffic);
         // closer obstacle = stronger signal (0 means nothing seen)
         const offsets = this.sensor.readings.map((s) => (s == null ? 0 : 1 - s.offset));
         const outputs = NeuralNetwork.feedForward(offsets, this.brain);

         if (this.useBrain) {
            this.controls.forward = outputs[0];
            this.controls.left = outputs[1];
            this.controls.right = outputs[2];
            this.controls.reverse = outputs[3];
         }
      }
   }

   #assessDamage(roadBorders, traffic) {
      for (const border of roadBorders) {
         if (polysIntersect(this.polygon, border)) {
            return true;
         }
      }
      for (const other of traffic) {
         if (polysIntersect(this.polygon, other.polygon)) {
            return true;
         }
      }
      return false;
   }

   #createPolygon() {
      const points = [];
      const rad = Math.hypot(this.width, this.height) / 2;
      const alpha = Math.atan2(this.width, this.height);
      // front-right, front-left, back-left, back-right
      points.push({
         x: this.x - Math.sin(this.angle - alpha) * rad,
         y: this.y - Math.cos(this.angle - alpha) * rad,
      });
      points.push({
         x: this.x - Math.sin(this.angle + alpha) * rad,
         y: this.y - Math.cos(this.angle + alpha) * rad,
      });
      points.push({
         x: this.x - Math.sin(Math.PI + this.angle - alpha) * rad,
         y: this.y - Math.cos(Math.PI + this.angle - alpha) * rad,
      });
      points.push({
         x: this.x - Math.sin(Math.PI + this.angle + alpha) * rad,
         y: this.y - Math.cos(Math.PI + this.angle + alpha) * rad,
      });
      return points;
   }

   #move() {
      if (this.controls.forward) {
         this.speed += this.acceleration;
      }
      if (this.controls.reverse) {
         this.speed -= this.acceleration;
      }

      if (this.speed > this.maxSpeed) {
         this.speed = this.maxSpeed;
      }
      if (this.speed < -this.maxSpeed / 2) {
         this.speed = -this.maxSpeed / 2;
      }

      if (this.speed > 0) {
         this.speed -= this.friction;
      }
      if (this.speed < 0) {
         this.speed += this.friction;
      }
      if (Math.abs(this.speed) < this.friction) {
         this.speed = 0;
      }

      if (this.speed != 0) {
         const flip = this.speed > 0 ? 1 : -1; // steering reverses when backing up
         if (this.controls.left) {
            this.angle += 0.03 * flip;
         }
         if (this.controls.right) {
            this.angle -= 0.03 * flip;
         }
      }

      this.x -= Math.sin(this.angle) * this.speed;
      this.y -= Math.cos(this.angle) * this.speed;
   }

   draw(ctx, drawSensor = false) {
      if (this.sensor && drawSensor) {
         this.sensor.draw(ctx);
      }

      const p = this.polygon;
      ctx.beginPath();
      ctx.fillStyle = this.damaged ? "gray" : this.color;
      ctx.moveTo(p[0].x, p[0].y);
      for (let i = 1; i < p.length; i++) {
         ctx.lineTo(p[i].x, p[i].y);
      }
      ctx.fill();

      // windshield, between the front and the middle of the car
      const along = (a, b, t) => ({ x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t) });
      const w = [
         along(p[0], p[3], 0.2),
         along(p[1], p[2], 0.2),
         along(p[1], p[2], 0.4),
         along(p[0], p[3], 0.4),
      ];
      ctx.beginPath();
      ctx.fillStyle = this.damaged ? "#555" : "rgba(180,220,255,0.9)";
      ctx.moveTo(w[0].x, w[0].y);
      for (let i = 1; i < w.length; i++) {
         ctx.lineTo(w[i].x, w[i].y);
      }
      ctx.fill();
   }
}
