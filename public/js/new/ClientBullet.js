// ClientBullet.js
import { ClientEntity } from "./ClientEntity.js";

export class ClientBullet extends ClientEntity {
  constructor(id, position, direction, speed = 480) {
    super(id, position, 0, direction);
    this.speed = speed;
    this.radius = 4;
    this.life = 1.5; // seconds
    this.alive = true;
  }

  update(deltaTime) {
    if (!this.alive) return;
    super.update(deltaTime);
    this.life -= deltaTime;
    if (this.life <= 0) this.destroy();
  }

  destroy() {
    this.alive = false;
    if (this.spriteRef) this.spriteRef.destroy();
  }

  getSpriteComponents() {
    const self = this;
    return [
      circle(this.radius),
      color(255, 230, 120),
      pos(this.position.x, this.position.y),
      anchor("center"),
      z(1),
      {
        id: "bulletSync",
        update() {
          this.pos = vec2(self.position.x, self.position.y);
          if (!self.alive) this.destroy();
        }
      },
      "bullet"
    ];
  }
}
