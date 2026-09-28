const { BaseHandler } = require("redweb");
const {
  getPlayerOrError,
  getRegistry,
  isVector,
  logIncomingMessage,
  normalizeVector,
  sendError,
} = require("./HandlerUtils");

function isNormalizedAxisValue(value) {
  return typeof value === "number" && Number.isFinite(value) && value >= -1.0 && value <= 1.0;
}

function getLocationVector(message = {}) {
  return isVector(message.location)
    ? message.location
    : (isVector(message.position) ? message.position : null);
}

function getFacingVector(message = {}) {
  if (isVector(message.facing)) return message.facing;
  if (isVector(message.angle)) return message.angle;
  if (isVector(message.direction)) return message.direction;
  return null;
}

function getWalkPayloadOrError(socket, message = {}, type) {
  if (!isNormalizedAxisValue(message.walking)) {
    sendError(socket, `${type} requires a numeric 'walking' value between -1.0 and 1.0`);
    return null;
  }

  const location = getLocationVector(message);
  if (!location) {
    sendError(socket, `${type} requires a 'location' vector`);
    return null;
  }

  const facing = getFacingVector(message);
  if (!facing) {
    sendError(socket, `${type} requires a 'facing' vector`);
    return null;
  }

  return {
    walking: message.walking,
    location: normalizeVector(location),
    facing: normalizeVector(facing),
  };
}

class InvincibleHandler extends BaseHandler {
  constructor() {
    super("invincible");
  }

  onMessage(socket, message = {}) {
    logIncomingMessage("invincible", message);

    const registry = getRegistry();
    const player = getPlayerOrError(socket);

    if (!player) {
      return;
    }

    if (typeof message.shielded !== "boolean") {
      sendError(socket, "Invincible requires a boolean 'shielded' value");
      return;
    }

    registry.broadcast(
      {
        type: "invincible",
        playerId: player.id,
        shielded: message.shielded,
      },
      socket,
      player.matchId
    );
  }
}

class AttackHandler extends BaseHandler {
  constructor() {
    super("attack");
  }

  onMessage(socket, message = {}) {
    logIncomingMessage("attack", message);

    const registry = getRegistry();
    const player = getPlayerOrError(socket);

    if (!player) {
      return;
    }

    if (typeof message.pressed !== "boolean") {
      sendError(socket, "Attack requires a boolean 'pressed' value");
      return;
    }

    registry.broadcast(
      {
        type: "attack",
        playerId: player.id,
        pressed: message.pressed,
      },
      socket,
      player.matchId
    );
  }
}

class HoverboardHandler extends BaseHandler {
  constructor() {
    super("hoverboard");
  }

  onMessage(socket) {
    logIncomingMessage("hoverboard", {});
    const registry = getRegistry();
    const player = getPlayerOrError(socket);
    if (!player) return;

    registry.broadcast({
      type: "hoverboard",
      playerId: player.id,
    }, socket, player.matchId);
  }
}

class JumpHandler extends BaseHandler {
  constructor() {
    super("jump");
  }

  onMessage(socket) {
    logIncomingMessage("jump", {});
    const registry = getRegistry();
    const player = getPlayerOrError(socket);
    if (!player) return;

    registry.broadcast({
      type: "jump",
      playerId: player.id,
    }, socket, player.matchId);
  }
}

class StopJumpingHandler extends BaseHandler {
  constructor() {
    super("stop jumping");
  }

  onMessage(socket) {
    logIncomingMessage("stop jumping", {});
    const registry = getRegistry();
    const player = getPlayerOrError(socket);
    if (!player) return;

    registry.broadcast({
      type: "stop jumping",
      playerId: player.id,
    }, socket, player.matchId);
  }
}

class WalkHandler extends BaseHandler {
  constructor() {
    super("walk");
  }

  onMessage(socket, message = {}) {
    logIncomingMessage("walk", message);
    const registry = getRegistry();
    const player = getPlayerOrError(socket);
    if (!player) return;

    const payload = getWalkPayloadOrError(socket, message, "Walk");
    if (!payload) return;

    player.setPosition(payload.location, player.vector, payload.facing);

    registry.broadcast({
      type: "walk",
      playerId: player.id,
      ...payload,
    }, socket, player.matchId);
  }
}

class WalkRightHandler extends BaseHandler {
  constructor() {
    super("walkRight");
  }

  onMessage(socket, message = {}) {
    logIncomingMessage("walkRight", message);
    const registry = getRegistry();
    const player = getPlayerOrError(socket);
    if (!player) return;

    const payload = getWalkPayloadOrError(socket, message, "walkRight");
    if (!payload) return;

    player.setPosition(payload.location, player.vector, payload.facing);

    registry.broadcast({
      type: "walkRight",
      playerId: player.id,
      ...payload,
    }, socket, player.matchId);
  }
}

class DodgeHandler extends BaseHandler {
  constructor() {
    super("dodge");
  }

  onMessage(socket, message = {}) {
    logIncomingMessage("dodge", message);
    const registry = getRegistry();
    const player = getPlayerOrError(socket);
    if (!player) return;

    const direction = isVector(message.direction)
      ? normalizeVector(message.direction)
      : normalizeVector(player.angle);

    registry.broadcast({
      type: "dodge",
      playerId: player.id,
      direction,
    }, socket, player.matchId);
  }
}

class StunnedHandler extends BaseHandler {
  constructor() {
    super("stunned");
  }

  onMessage(socket, message = {}) {
    logIncomingMessage("stunned", message);
    const registry = getRegistry();
    const player = getPlayerOrError(socket);
    if (!player) return;

    if (typeof message.stunType !== "string" || !message.stunType.trim()) {
      sendError(socket, "Stunned requires a 'stunType' string");
      return;
    }

    let appliedByPlayerId = typeof message.appliedByPlayerId === "string"
      ? message.appliedByPlayerId.trim()
      : "";

    if (appliedByPlayerId) {
      const applyingPlayer = registry.getById(appliedByPlayerId, player.matchId);
      if (!applyingPlayer) {
        appliedByPlayerId = "";
      }
    }

    const payload = {
      type: "stunned",
      playerId: player.id,
      stunType: message.stunType.trim(),
    };

    if (appliedByPlayerId) {
      payload.appliedByPlayerId = appliedByPlayerId;
    }

    registry.broadcast(payload, socket, player.matchId);
  }
}

class UpdateDirectionHandler extends BaseHandler {
  constructor() {
    super("update direction");
  }

  onMessage(socket, message = {}) {
    logIncomingMessage("update direction", message);
    const registry = getRegistry();
    const player = getPlayerOrError(socket);
    if (!player) return;

    const rawDirection = isVector(message.direction)
      ? message.direction
      : (isVector(message.angle) ? message.angle : null);

    if (!rawDirection) {
      sendError(socket, "Update direction requires a direction vector");
      return;
    }

    const direction = normalizeVector(rawDirection);
    player.setAngle(direction);

    registry.broadcast({
      type: "update direction",
      playerId: player.id,
      direction,
    }, socket, player.matchId);
  }
}

module.exports = {
  AttackHandler,
  DodgeHandler,
  HoverboardHandler,
  InvincibleHandler,
  JumpHandler,
  StunnedHandler,
  StopJumpingHandler,
  UpdateDirectionHandler,
  WalkHandler,
  WalkRightHandler,
};
