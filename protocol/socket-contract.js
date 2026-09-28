const { defineSocketContract } = require("redweb/contract");
const { z } = require("zod");

const object = (shape = {}) => z.object(shape).passthrough();
const anyObject = object();
const text = z.string();
const integer = z.number().int();
const finiteNumber = z.number();
const scalar = z.union([finiteNumber, text]);
const vector = object({
  x: scalar.optional(),
  y: scalar.optional(),
  z: scalar.optional(),
  X: scalar.optional(),
  Y: scalar.optional(),
  Z: scalar.optional(),
});
const vectorLike = z.union([vector, finiteNumber]);
const optional = shape => Object.fromEntries(Object.entries(shape).map(([key, schema]) => [key, schema.optional()]));

const commandSchemas = {
  "create match": object({ arenaID: text.min(1), modeIndex: integer, uid: integer }),
  "create duel": object({ modeIndex: integer, uid: integer, challengedUid: integer }),
  join: object({ matchId: text.min(1) }),
  "duel recieved": object(optional({ matchId: text, matchID: text, challengerUid: integer, challengerUID: integer })),
  "duel accepted": object(optional({ matchId: text, matchID: text, challengerUid: integer, challengerUID: integer })),
  "duel declined": object(optional({ matchId: text, matchID: text, challengerUid: integer, challengerUID: integer })),
  "find matches": anyObject,
  "update-rank": object({ xp: integer, id: integer, username: text.min(1) }),
  chat: object({ playerId: integer, username: text, message: text }),
  "report chat": object({ offendingMessage: text.min(1), playerId: integer, reporterPlayerId: integer, reason: text.min(1), username: text }),
  move: object({ position: vector.optional(), vector: vector.optional(), angle: vectorLike.optional() }),
  "get-players": anyObject,
  shoot: object({ position: vector.optional(), direction: vector.optional() }),
  attack: object({ pressed: z.boolean() }),
  "seehn disk": object({ position: vector, angle: vector }),
  "seehn disks ready": anyObject,
  "deal damage": object({ amount: finiteNumber, targetId: text.min(1) }),
  "update health": object({ newHealth: finiteNumber, targetId: text.min(1) }),
  "launch character": object({ velocity: vector }),
  "super special": object({ position: vector, angle: vector }),
  "super special ready": anyObject,
  special: object({ position: vector }),
  "special ready": anyObject,
  hoverboard: anyObject,
  invincible: object({ shielded: z.boolean() }),
  dodge: object({ direction: vector.optional() }),
  stunned: object({ stunType: text.min(1), appliedByPlayerId: text.optional() }),
  "update points": object({ points: integer }),
  "update direction": object({ direction: vector.optional(), angle: vector.optional() }),
  jump: anyObject,
  "stop jumping": anyObject,
  walk: object({ walking: finiteNumber, location: vector.optional(), position: vector.optional(), facing: vector.optional(), angle: vector.optional(), direction: vector.optional() }),
  walkRight: object({ walking: finiteNumber, location: vector.optional(), position: vector.optional(), facing: vector.optional(), angle: vector.optional(), direction: vector.optional() }),
};

const commandSchemaNames = Object.freeze(Object.keys(commandSchemas));

const eventSchemas = {
  server_error: object({ message: text }),
  joined: object({ id: text, playerGivenIndex: integer.nullable(), player: anyObject }),
  player_joined: object({ id: text, uid: integer, username: text, playerGivenIndex: integer.nullable(), customization: z.array(z.unknown()), player: anyObject }),
  player_left: object({ playerId: text, matchId: text, reason: text }),
  "removed from match": object({ playerId: text, matchId: text, reason: text }),
  match_created: object({ match: anyObject }),
  duel_created: object({ matchId: text, challengerUid: integer, username: text, customization: z.array(z.unknown()), challengedUid: integer }),
  matches_list: object({ matches: z.array(anyObject) }),
  players_list: object({ players: z.array(anyObject) }),
  chat: z.union([
    commandSchemas.chat,
    object({ player: object({ id: text, playerId: integer, username: text, message: text }) }),
  ]),
  "report recieved": object({ playerId: integer, reporterPlayerId: integer, username: text, invalid: z.boolean() }),
  "dangerous-player": object({ playerId: integer, username: text, reportCount: integer }),
  player_moved: object({ player: anyObject }),
  "launch character": z.union([commandSchemas["launch character"], object({ targetId: text, velocity: vector })]),
  player_shot: object({ shooterId: text, position: vector, direction: vector }),
  attack: z.union([commandSchemas.attack, object({ playerId: text, pressed: z.boolean() })]),
  invincible: z.union([commandSchemas.invincible, object({ playerId: text, shielded: z.boolean() })]),
  "seehn disk": z.union([commandSchemas["seehn disk"], object({ playerId: text, position: vector, angle: vector })]),
  special: z.union([commandSchemas.special, object({ playerId: text, position: vector })]),
  "super special": z.union([commandSchemas["super special"], object({ playerId: text, position: vector, angle: vector })]),
  "seehn disks ready": object({ playerId: text.optional() }),
  "special ready": object({ playerId: text.optional() }),
  "super special ready": object({ playerId: text.optional() }),
  hoverboard: object({ playerId: text.optional() }),
  dodge: z.union([commandSchemas.dodge, object({ playerId: text, direction: vector })]),
  stunned: z.union([commandSchemas.stunned, object({ playerId: text, stunType: text, appliedByPlayerId: text.optional() })]),
  "update points": z.union([commandSchemas["update points"], object({ playerId: text, points: integer })]),
  "update direction": z.union([commandSchemas["update direction"], object({ playerId: text, direction: vector })]),
  jump: object({ playerId: text.optional() }),
  "stop jumping": object({ playerId: text.optional() }),
  walk: object({ playerId: text.optional(), walking: finiteNumber.optional(), location: vector.optional(), facing: vector.optional() }),
  walkRight: object({ playerId: text.optional(), walking: finiteNumber.optional(), location: vector.optional(), facing: vector.optional() }),
  "damage dealt": object({ dealerId: text, targetId: text, amount: finiteNumber }),
  "health updated": object({ targetId: text, newHealth: finiteNumber }),
  "match_started": anyObject,
  "match_over": anyObject,
  "duel recieved": z.union([commandSchemas["duel recieved"], object({ matchId: text, challengerUid: integer, challengedUid: integer.optional(), playerId: text.optional() })]),
  "duel accepted": z.union([commandSchemas["duel accepted"], object({ matchId: text, challengerUid: integer, challengedUid: integer.optional(), playerId: text.optional() })]),
  "duel declined": z.union([commandSchemas["duel declined"], object({ matchId: text, challengerUid: integer, challengedUid: integer.optional(), playerId: text.optional() })]),
  "update-rank": z.union([commandSchemas["update-rank"], object({ position: integer })]),
};

const schemas = Object.freeze({ ...commandSchemas, ...eventSchemas });
const contract = defineSocketContract("2", schemas, { validationTimeoutMs: 3000 });
const MAX_PENDING_CONTRACT_MESSAGES = 64;
const MAX_PENDING_CONTRACT_BYTES = 256 * 1024;

const wrapContractHandler = HandlerClass => {
  const handler = new HandlerClass();
  const type = handler.name;
  return contract.handler(type, (socket, payload, envelope) => handler.onMessage(socket, {
    ...payload,
    ...(envelope.requestId === undefined ? {} : { requestId: envelope.requestId }),
    ...(envelope.sequence === undefined ? {} : { sequence: envelope.sequence }),
  }));
};

function createContractHandlers(handlerClasses) {
  return handlerClasses.map(wrapContractHandler);
}

function toContractMessage(message) {
  if (!message || typeof message !== "object" || typeof message.type !== "string") {
    throw new TypeError("Contract output must be an object with a message type.");
  }
  const type = message.type === "error" ? "server_error" : message.type;
  if (!schemas[type]) throw new TypeError(`No Redweb socket contract is defined for outgoing '${type}'.`);
  const { type: _type, requestId, sequence, ...payload } = message;
  const metadata = {
    ...(requestId === undefined ? {} : { requestId }),
    ...(sequence === undefined ? {} : { sequence }),
  };
  return { type, payload, metadata };
}

const queueContractMessage = (state, task, size) => {
  if (state.pendingMessages >= MAX_PENDING_CONTRACT_MESSAGES || state.pendingBytes + size > MAX_PENDING_CONTRACT_BYTES) {
    state.socket.close?.(1013, "Slow consumer");
    return false;
  }
  state.pendingMessages += 1;
  state.pendingBytes += size;
  state.outgoing = state.outgoing.then(task).catch(error => {
    state.route.handleError(state.socket, error);
    state.socket.close?.(1011, "Invalid server message");
    return false;
  }).finally(() => {
    state.pendingMessages -= 1;
    state.pendingBytes -= size;
  });
  return true;
};

function installContractTransport(route, socket) {
  const state = { outgoing: Promise.resolve(), pendingMessages: 0, pendingBytes: 0, route, socket };
  socket.sendJson = message => {
    let event;
    try {
      event = toContractMessage(message);
    } catch (error) {
      route.handleError(socket, error);
      socket.close?.(1011, "Invalid server message");
      return false;
    }

    let size;
    try {
      size = Buffer.byteLength(JSON.stringify(event));
    } catch (error) {
      route.handleError(socket, error);
      socket.close?.(1011, "Invalid server message");
      return false;
    }
    return queueContractMessage(state, () => contract.send(socket, event.type, event.payload, event.metadata), size);
  };
}

module.exports = {
  commandSchemas,
  commandSchemaNames,
  contract,
  createContractHandlers,
  installContractTransport,
  schemas,
  toContractMessage,
};


