// PlayerInputManager.js

import Net from "./Net.js";
import { radToVector } from "./utils.js";

export function setupPlayerInput(k, localPlayer, getFaceRad, onShoot) {
  const { onMouseMove, onKeyPress, onKeyRelease, isKeyDown, mousePos, vec2, onUpdate } = k;

  function safeUnit(v) {
    const len = Math.hypot(v.x, v.y);
    if (len === 0) return vec2(0, 0);
    return v.scale(1 / len);
  }

  function getMoveVec() {
    return safeUnit(vec2(
      (isKeyDown("d") ? 1 : 0) - (isKeyDown("a") ? 1 : 0),
      (isKeyDown("s") ? 1 : 0) - (isKeyDown("w") ? 1 : 0)
    ));
  }

  onMouseMove(() => {
    const rad = Math.atan2(mousePos().y - localPlayer.position.y, mousePos().x - localPlayer.position.x);
    localPlayer.setAngle(rad);
    Net.send("move", { angle: radToVector(rad) });
  });

  function pushVector(v) {
    localPlayer.setVector(v);
    Net.send("move", { vector: { x: v.x, y: v.y } });
  }

  onKeyPress(["w","a","s","d"], () => pushVector(getMoveVec()));
  onKeyRelease(["w","a","s","d"], () => pushVector(getMoveVec()));

  onUpdate(() => {
    // keep local sprite synced and ensure NaN never creeps in
    const v = getMoveVec();
    localPlayer.setVector(v);
  });

  k.onClick(() => onShoot?.());

  // Throttled state sync (position + angle + vector) ~10Hz
  let lastSync = 0;
  onUpdate(() => {
    const now = Date.now();
    if (now - lastSync > 100) {
      lastSync = now;
      Net.send("move", {
        position: { x: localPlayer.position.x, y: localPlayer.position.y },
        angle: radToVector(localPlayer.angle),
        vector: { x: localPlayer.vector.x, y: localPlayer.vector.y },
      });
    }
  });

}
