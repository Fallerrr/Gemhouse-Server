const COLOR_INCOMING = "\x1b[90m";
const COLOR_OUTGOING = "\x1b[36m";
const COLOR_RESET = "\x1b[0m";

function sendError(socket, message) {
  sendJsonWithLog(socket, { type: "error", message });
  return null;
}

function logIncomingMessage(type, payload = {}) {
  let serializedPayload = "[unserializable payload]";
  try {
    serializedPayload = JSON.stringify(payload);
  } catch {}

  console.log(`${COLOR_INCOMING}[client->server] ${type} ${serializedPayload}${COLOR_RESET}`);
}

function logOutgoingMessage(type, payload = {}, target = "socket") {
  let serializedPayload = "[unserializable payload]";
  try {
    serializedPayload = JSON.stringify(payload);
  } catch {}

  console.log(`${COLOR_OUTGOING}[server->client] ${target} ${type} ${serializedPayload}${COLOR_RESET}`);
}

function sendJsonWithLog(socket, payload = {}, target = "socket") {
  const type = payload?.type ?? "unknown";
  logOutgoingMessage(type, payload, target);
  if (typeof socket.sendJson === "function") {
    socket.sendJson(payload);
  } else if (typeof socket.send === "function") {
    socket.send(JSON.stringify(payload));
  }
}

function getRegistry() {
  return require("./PlayerRegistry");
}

function getPlayerOrError(socket) {
  const registry = getRegistry();
  const player = registry.getBySocket(socket);
  if (!player) {
    return sendError(socket, "Player not found");
  }
  return player;
}

function parseVectorComponent(value) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function getVectorComponent(value, lowerKey, upperKey) {
  if (!value || typeof value !== "object") return null;

  const lower = parseVectorComponent(value[lowerKey]);
  if (lower !== null) return lower;

  const upper = parseVectorComponent(value[upperKey]);
  if (upper !== null) return upper;

  return null;
}

function isVector(value) {
  return getVectorComponent(value, "x", "X") !== null &&
    getVectorComponent(value, "y", "Y") !== null;
}

function normalizeVector(value, defaultZ = 0) {
  const x = getVectorComponent(value, "x", "X");
  const y = getVectorComponent(value, "y", "Y");
  const z = getVectorComponent(value, "z", "Z");

  return {
    x: x !== null ? x : 0,
    y: y !== null ? y : 0,
    z: z !== null ? z : defaultZ,
  };
}

function isBoolean(value) {
  return typeof value === "boolean";
}

function isFiniteNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}

function isInteger(value) {
  return Number.isInteger(value);
}

module.exports = {
  getPlayerOrError,
  getRegistry,
  isBoolean,
  isFiniteNumber,
  isInteger,
  isVector,
  logIncomingMessage,
  logOutgoingMessage,
  normalizeVector,
  sendError,
  sendJsonWithLog,
};
