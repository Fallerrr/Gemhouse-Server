// ClientEntity.js
import { angleValueToRad, radToDeg } from "./utils.js";

export class ClientEntity {
  constructor(id, position = { x: 0, y: 0 }, angle = 0, vector = { x: 0, y: 0 }) {
    this.id = id;
    this.position = { ...position };
    this.angle = angleValueToRad(angle); // radians
    this.vector = { ...vector };        // unit vector (vx, vy)
    this.speed = 0;                     // pixels/sec (subclasses set this)
    this.spriteRef = null;              // kaboom game obj
  }

  update(deltaTime) {
    // base movement: position += vector * speed * dt
    if (this.speed && Number.isFinite(this.vector.x) && Number.isFinite(this.vector.y) && (this.vector.x || this.vector.y)) {
      this.position.x += this.vector.x * this.speed * deltaTime;
      this.position.y += this.vector.y * this.speed * deltaTime;
    }
    // sprite sync (if exists)
    if (this.spriteRef) {
      this.spriteRef.pos = vec2(this.position.x, this.position.y);
      this.spriteRef.angle = radToDeg(this.angle);
    }
  }

  // kaboom components for rendering a rectangle
  getSpriteComponents() {
    // override in subclasses
    return null;
  }

  getState() {
    return {
      id: this.id,
      position: { ...this.position },
      angle: this.angle,
      vector: { ...this.vector },
    };
  }
}
