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
      this.brakePower = this.acceleration; // how fast the brake slows the car
      this.turnRate = 0.03; // radians per frame at full steering
      this.speedSteering = false; // true = steering gets gentler at low speed, like a real car
      this.angle = angle; // 0 = facing up (-y)
      this.damaged = false;
      this.fitness = 0; // scored by the simulator (how far the car got)
      this.arrived = false; // reached the trip's destination
      this.lastImprovement = 0; // frame when the fitness last went up
      this.routeIndex = 0; // which piece of the trip's route the car is on
      this.color = color;
      this.isPlayer = false; // driven by a person (traffic gives it room)

      this.useBrain = controlType == "AI";

      // DUMMY and AUTO (traffic) cars don't need sensors or a brain
      if (controlType == "AI" || controlType == "KEYS") {
         this.sensor = new Sensor(this);
         // inputs: the sensor rays, the car's speed, and 2 GPS signals
         // ("the route bends left / right"); outputs: gas, left, right, brake
         this.gpsInputs = [0, 0];
         this.brain = new NeuralNetwork([this.sensor.rayCount + 1 + this.gpsInputs.length, 8, 4]);
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
         this.polygon = this.#createPolygon();
         this.damaged = this.#assessDamage(nearby, traffic);
      }
      if (this.sensor) {
         this.sensor.update(nearby, traffic);
         // closer obstacle = stronger signal (0 means nothing seen)
         const offsets = this.sensor.readings.map((s) => (s == null ? 0 : 1 - s.offset));
         const speed = this.speed / this.maxSpeed;
         const outputs = NeuralNetwork.feedForward([...offsets, speed, ...this.gpsInputs], this.brain);

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
         this.speed -= this.speed > 0 ? this.brakePower : this.acceleration;
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
         const rate = this.speedSteering
            ? Math.min(this.turnRate, Math.abs(this.speed) * 0.025)
            : this.turnRate;
         if (this.controls.left) {
            this.angle += rate * flip;
         }
         if (this.controls.right) {
            this.angle -= rate * flip;
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
      const along = (a, b, t) => ({ x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t) });

      // soft shadow, then the body
      ctx.beginPath();
      ctx.fillStyle = "rgba(0,0,0,0.22)";
      for (const q of p) {
         ctx.lineTo(q.x + 4, q.y + 5);
      }
      ctx.fill();

      ctx.beginPath();
      ctx.fillStyle = this.arrived ? "#2ecc71" : this.damaged ? "gray" : this.color;
      ctx.moveTo(p[0].x, p[0].y);
      for (let i = 1; i < p.length; i++) {
         ctx.lineTo(p[i].x, p[i].y);
      }
      ctx.fill();

      // lights: p[0] front-right, p[1] front-left, p[2] back-left, p[3] back-right
      const lamp = (a, b, c, color, size) => {
         const at = along(along(a, b, 0.1), c, 0.06);
         ctx.beginPath();
         ctx.fillStyle = color;
         ctx.arc(at.x, at.y, size, 0, Math.PI * 2);
         ctx.fill();
      };
      if (!this.damaged) {
         const braking = this.controls.reverse && this.speed > 0;
         const brake = braking ? "#ff2b2b" : "rgba(150,20,20,0.9)";
         lamp(p[2], p[3], p[1], brake, braking ? 5 : 3.5);
         lamp(p[3], p[2], p[0], brake, braking ? 5 : 3.5);
         const signal = this.controls.signal;
         if (signal && Math.floor(Date.now() / 350) % 2 == 0) {
            const amber = "#ffb020";
            if (signal == "left") {
               lamp(p[1], p[0], p[2], amber, 5);
               lamp(p[2], p[3], p[1], amber, 5);
            } else {
               lamp(p[0], p[1], p[3], amber, 5);
               lamp(p[3], p[2], p[0], amber, 5);
            }
         }
      }

      // windshield, between the front and the middle of the car
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
