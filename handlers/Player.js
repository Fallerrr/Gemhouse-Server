/**
 * Player model (server-side)
 */
const { logOutgoingMessage } = require("./HandlerUtils");

function isFacingVector(value) {
  return value && typeof value.x === "number" && typeof value.y === "number";
}

function angleNumberToVector(angle) {
  return {
    x: Math.cos(angle),
    y: Math.sin(angle),
    z: 0,
  };
}

function normalizeFacing(angle) {
  if (isFacingVector(angle)) {
    return {
      x: angle.x,
      y: angle.y,
      z: typeof angle.z === "number" ? angle.z : 0,
    };
  }

  if (typeof angle === "number") {
    return angleNumberToVector(angle);
  }

  return { x: 1, y: 0, z: 0 };
}

function isNonNegativeInteger(value) {
  return Number.isInteger(value) && value >= 0;
}

function isTenDigitUserId(value) {
  return Number.isInteger(value) && value < 1000000000;
}

function normalizeUsername(value) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeCustomization(customization) {
  // [costume, eyeColor, headgear, hair, skinTone, weapon, banner, bannerStyle, level, rank, userId, rankXp]
  const normalized = new Array(12).fill(0);
  if (!Array.isArray(customization)) return normalized;

  // Support the previous 10-slot layout by inserting defaults for hair, banner, and banner style.
  if (customization.length === 10) {
    const legacyToCurrentIndex = [0, 1, 2, 4, null, 5, 8, 9, 10, 11];
    for (let legacyIndex = 0; legacyIndex < customization.length; legacyIndex += 1) {
      const value = customization[legacyIndex];
      if (!isNonNegativeInteger(value)) continue;

      const currentIndex = legacyToCurrentIndex[legacyIndex];
      if (currentIndex === null) continue;

      if (currentIndex === 10 && value !== 0 && !isTenDigitUserId(value)) {
        continue;
      }

      normalized[currentIndex] = value;
    }
    return normalized;
  }

  // Support the previous 11-slot layout by dropping body type and adding banner defaults.
  if (customization.length === 11) {
    const legacyToCurrentIndex = [0, 1, 2, 3, 4, null, 5, 8, 9, 10, 11];
    for (let legacyIndex = 0; legacyIndex < customization.length; legacyIndex += 1) {
      const value = customization[legacyIndex];
      if (!isNonNegativeInteger(value)) continue;

      const currentIndex = legacyToCurrentIndex[legacyIndex];
      if (currentIndex === null) continue;

      if (currentIndex === 10 && value !== 0 && !isTenDigitUserId(value)) {
        continue;
      }

      normalized[currentIndex] = value;
    }
    return normalized;
  }

  for (let i = 0; i < normalized.length; i += 1) {
    const value = customization[i];
    if (!isNonNegativeInteger(value)) continue;

    if (i === 10 && value !== 0 && !isTenDigitUserId(value)) {
      continue;
    }

    normalized[i] = value;
  }

  return normalized;
}

function resolveCustomization(data = {}) {
  const customization = normalizeCustomization(data.customization);
  if (customization[10] === 0 && isTenDigitUserId(data.uid)) {
    customization[10] = data.uid;
  }
  return customization;
}

class Player {
  constructor(socket, id, data = {}, registry) {
    this.socket   = socket;
    this.id       = id;
    this.registry = registry;
    this.joinIndex = Number.isInteger(data.joinIndex) ? data.joinIndex : null;
    this.matchId = typeof data.matchId === "string" ? data.matchId.trim() : "";
    this.playerGivenIndex = Number.isInteger(data.playerGivenIndex) ? data.playerGivenIndex : null;

    this.position = data.position ?? { x: 0, y: 0, z: 0 };
    this.vector   = data.vector   ?? { x: 0, y: 0, z: 0 };
    this.angle    = normalizeFacing(data.angle);
    this.customization = resolveCustomization(data);
    this.uid = this.customization[10];
    this.username = normalizeUsername(data.username);
  }

  setPosition(pos, vector = this.vector, angle = this.angle) {
    this.position = { ...this.position, ...pos };
    this.vector   = { ...this.vector,   ...vector };
    this.angle    = normalizeFacing(angle);
  }

  setVector(vector) {
    this.vector = { ...this.vector, ...vector };
  }

  setAngle(angle) {
    this.angle = normalizeFacing(angle);
  }

  updateJoinData(data = {}) {
    if (Array.isArray(data.customization) || isTenDigitUserId(data.uid)) {
      this.customization = resolveCustomization(data);
      this.uid = this.customization[10];
    }

    if (typeof data.username === "string") {
      this.username = normalizeUsername(data.username);
    }

    if (Number.isInteger(data.playerGivenIndex)) {
      this.playerGivenIndex = data.playerGivenIndex;
    }
  }

  send(type, payload = {}) {
    if (this.socket?.readyState != null && this.socket.readyState !== 1) {
      return false;
    }

    // RedWeb sockets expose sendJson; fallback to raw send if needed
    const message = { type, ...payload, timestamp: Date.now() };
    logOutgoingMessage(type, message, `player:${this.id}`);
    if (typeof this.socket.sendJson === "function") {
      this.socket.sendJson(message);
      return true;
    } else if (typeof this.socket.send === "function") {
      this.socket.send(JSON.stringify(message));
      return true;
    }

    return false;
  }

  getSanitized() {
    // hide non-serializable / internal props
    const { socket, registry, ...clean } = this;
    return clean;
  }

  getJoinSanitized() {
    const {
      socket,
      registry,
      position,
      vector,
      angle,
      ...clean
    } = this;
    return clean;
  }
}

module.exports = Player;
