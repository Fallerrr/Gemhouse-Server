const { BaseHandler } = require("redweb");
const {
  getPlayerOrError,
  getRegistry,
  isVector,
  logIncomingMessage,
  normalizeVector,
  sendError,
} = require("./HandlerUtils");

class CooldownReadyHandler extends BaseHandler {
  constructor(type) {
    super(type);
    this.type = type;
  }

  onMessage(socket, message = {}) {
    logIncomingMessage(this.type, message);
    const registry = getRegistry();
    const player = getPlayerOrError(socket);
    if (!player) return;

    registry.broadcast({
      type: this.type,
      playerId: player.id,
    }, socket, player.matchId);
  }
}

class SeehnDiskHandler extends BaseHandler {
  constructor() {
    super("seehn disk");
  }

  onMessage(socket, message = {}) {
    logIncomingMessage("seehn disk", message);
    const registry = getRegistry();
    const player = getPlayerOrError(socket);
    if (!player) return;
    if (!isVector(message.position) || !isVector(message.angle)) {
      sendError(socket, "Seehn disk requires 'position' and 'angle' vectors");
      return;
    }

    registry.broadcast({
      type: "seehn disk",
      playerId: player.id,
      position: normalizeVector(message.position),
      angle: normalizeVector(message.angle),
    }, socket, player.matchId);
  }
}

class SpecialHandler extends BaseHandler {
  constructor() {
    super("special");
  }

  onMessage(socket, message = {}) {
    logIncomingMessage("special", message);
    const registry = getRegistry();
    const player = getPlayerOrError(socket);
    if (!player) return;
    if (!isVector(message.position)) {
      sendError(socket, "Special requires a 'position' vector");
      return;
    }

    registry.broadcast({
      type: "special",
      playerId: player.id,
      position: normalizeVector(message.position),
    }, socket, player.matchId);
  }
}

class SuperSpecialHandler extends BaseHandler {
  constructor() {
    super("super special");
  }

  onMessage(socket, message = {}) {
    logIncomingMessage("super special", message);
    const registry = getRegistry();
    const player = getPlayerOrError(socket);
    if (!player) return;
    if (!isVector(message.position) || !isVector(message.angle)) {
      sendError(socket, "Super special requires 'position' and 'angle' vectors");
      return;
    }

    registry.broadcast({
      type: "super special",
      playerId: player.id,
      position: normalizeVector(message.position),
      angle: normalizeVector(message.angle),
    }, socket, player.matchId);
  }
}

class SeehnDisksReadyHandler extends CooldownReadyHandler {
  constructor() {
    super("seehn disks ready");
  }
}

class SpecialReadyHandler extends CooldownReadyHandler {
  constructor() {
    super("special ready");
  }
}

class SuperSpecialReadyHandler extends CooldownReadyHandler {
  constructor() {
    super("super special ready");
  }
}

module.exports = {
  SeehnDiskHandler,
  SeehnDisksReadyHandler,
  SpecialHandler,
  SpecialReadyHandler,
  SuperSpecialHandler,
  SuperSpecialReadyHandler,
};
