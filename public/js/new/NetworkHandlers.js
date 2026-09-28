// NetworkHandlers.js
import Net from "./Net.js";

function getResolvedLocalId(localIdOrGetter) {
  return typeof localIdOrGetter === "function" ? localIdOrGetter() : localIdOrGetter;
}

export function setupNetworkHandlers(entityManager, localIdOrGetter, spawnBulletVisual, updateLocalHP, onJoined) {
  Net.on("joined", (msg) => {
    onJoined?.(msg);
    // Populate state of players who were already connected
    Net.send("get-players");
  });
  Net.on("players_list", (msg) => {
    const localId = getResolvedLocalId(localIdOrGetter);
    for (const p of msg.players) {
      if (p.id === localId && entityManager.has(localId)) {
        continue;
      }
      if (!entityManager.has(p.id)) {
        entityManager.spawn("player", p.id, p);
      }
    }
  });

  Net.on("player_joined", (msg) => {
    const localId = getResolvedLocalId(localIdOrGetter);
    if (msg.player.id === localId) return;
    if (!entityManager.has(msg.player.id)) {
      entityManager.spawn("player", msg.player.id, msg.player);
    }
  });

  Net.on("player_left", (msg) => {
    entityManager.despawn(msg.id);
  });

  Net.on("player_moved", (msg) => {
    const localId = getResolvedLocalId(localIdOrGetter);
    const p = msg.player;
    const ent = entityManager.get(p.id);
    if (!ent) return;
    if (p.id === localId) {
      // local echo (ignore or hard-sync if needed)
      return;
    }
    // drive remote via smoothing targets
    ent.setTarget(p.position, p.angle, p.vector);
  });

  Net.on("player_hit", (msg) => {
    const localId = getResolvedLocalId(localIdOrGetter);
    const ent = entityManager.get(msg.id);
    if (ent?.updateHP) ent.updateHP(msg.hp);
    if (msg.id === localId && updateLocalHP) updateLocalHP(msg.hp);
  });

  Net.on("player_shot", (msg) => {
    const localId = getResolvedLocalId(localIdOrGetter);
    if (msg.shooterId === localId) return;
    spawnBulletVisual(msg.position, msg.direction, msg.shooterId);
  });
}
