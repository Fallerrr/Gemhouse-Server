// MoveHandler.js
const { BaseHandler } = require("redweb");
const {
  getPlayerOrError,
  getRegistry,
  isVector,
  logIncomingMessage,
  normalizeVector,
  sendError,
  sendJsonWithLog,
} = require("./HandlerUtils");

function isFacingValue(value) {
  return typeof value === "number" ||
    (value && typeof value.x === "number" && typeof value.y === "number");
}

class MoveHandler extends BaseHandler {
  constructor() {
    super("move");
  }

  /**
   * Message shape expected from client
   * {
   *   position: { x, y, z }  // optional - absolute position
   *   vector:   { x, y, z }  // optional - movement delta
   *   angle:    { x, y, z }  // optional - facing direction vector
   * }
   */
  onMessage(socket, msg = {}) {
    logIncomingMessage("move", msg);
    const registry = getRegistry();
    const player = registry.getBySocket(socket);
    if (!player) {
      sendJsonWithLog(socket, { type: "error", message: "Player not found" }, "socket:unregistered");
      return;
    }

    let shouldBroadcast = false;

    if (msg.position) {
      // Keep the current facing vector unless the client sent a new one.
      // Legacy numeric radians are still accepted and normalized by Player.
      const angle = isFacingValue(msg.angle) ? msg.angle : player.angle;
      const vector = msg.vector ? msg.vector : player.vector;
      player.setPosition(msg.position, vector, angle);
      shouldBroadcast = true;
    }

    if (msg.vector) {
      player.setVector(msg.vector);
      shouldBroadcast = true;
    }

    if (isFacingValue(msg.angle) && !msg.position) {
      player.setAngle(msg.angle);
      shouldBroadcast = true;
    }

    if (shouldBroadcast) {
      registry.broadcast({
        type:   "player_moved",
        player: player.getSanitized(),
      }, socket, player.matchId);
    }
  }
}

class LaunchCharacterHandler extends BaseHandler {
  constructor() {
    super("launch character");
  }

  onMessage(socket, message = {}) {
    logIncomingMessage("launch character", message);
    const registry = getRegistry();
    const player = getPlayerOrError(socket);
    if (!player) return;
    if (!isVector(message.velocity)) {
      sendError(socket, "Launch character requires a velocity vector");
      return;
    }

    registry.broadcast({
      type: "launch character",
      targetId: player.matchId,
      velocity: normalizeVector(message.velocity),
    }, socket, player.matchId);
  }
}

module.exports = { MoveHandler, LaunchCharacterHandler };
