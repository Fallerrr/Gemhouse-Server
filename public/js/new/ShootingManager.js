// ShootingManager.js
import Net from "./Net.js";

export function handleShoot(entityManager, shooter) {
  const dir = vec2(Math.cos(shooter.angle), Math.sin(shooter.angle)).unit();
  const bulletId = `b_${Date.now()}_${Math.floor(Math.random()*9999)}`;

  // local visual
  const bullet = entityManager.spawn("bullet", bulletId, {
    position: { ...shooter.position },
    direction: { x: dir.x, y: dir.y },
  });

  // server notify
  Net.send("shoot", {
    position: { ...shooter.position },
    direction: { x: dir.x, y: dir.y },
  });
}
