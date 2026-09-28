const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");

const registry = require("../handlers/PlayerRegistry");
const Player = require("../handlers/Player");
const matchmaking = require("../services/MatchmakingService");
const utils = require("../handlers/HandlerUtils");
const { CreateMatchHandler } = require("../handlers/CreateMatchHandler");
const { CreateDuelHandler } = require("../handlers/CreateDuelHandler");
const { FindMatchesHandler } = require("../handlers/FindMatchesHandler");
const { GetPlayersHandler } = require("../handlers/GetPlayersHandler");
const { JoinHandler } = require("../handlers/JoinHandler");
const { DuelAcceptedHandler, DuelDeclinedHandler, DuelRecievedHandler } = require("../handlers/DuelResponseHandlers");
const { ChatHandler, ReportChatHandler } = require("../handlers/ChatHandler");
const { UpdateRankHandler } = require("../handlers/RankHandler");
const rankServiceForHandler = require("../services/RankService");
const { ShootHandler } = require("../handlers/ShootHandler");
const { MoveHandler, LaunchCharacterHandler } = require("../handlers/MoveHandler");
const { DealDamageHandler, UpdateHealthHandler, UpdatePointsHandler } = require("../handlers/MatchEventHandlers");
const abilityHandlers = require("../handlers/AbilityHandlers");
const actionHandlers = require("../handlers/PlayerActionHandlers");
const { commandSchemaNames, commandSchemas, contract, createContractHandlers, installContractTransport, schemas, toContractMessage } = require("../protocol/socket-contract");

function socket(readyState = 1) {
  return {
    readyState,
    sent: [],
    sendJson(message) { this.sent.push(message); },
    close(code) { this.closed = true; this.closeCode = code; },
  };
}

function makePlayer(id, matchId = "match-a", overrides = {}) {
  const transport = overrides.socket || socket();
  const player = registry.create(transport, id, {
    matchId,
    uid: Number(id.replace(/\D/g, "")) || 1,
    username: id,
    ...overrides,
  });
  return player;
}

function resetSharedState() {
  for (const player of registry.all()) registry.remove(player);
  registry.setCreateValidator(null);
  registry.setRemoveValidator(null);
  registry.maxPlayers = Infinity;
  registry.nextJoinIndexByMatch.clear();
  matchmaking.availableMatches.clear();
}

test.beforeEach(resetSharedState);

test("Redweb socket contract validates commands, dispatches legacy handler payloads, and envelopes server events", async () => {
  assert.equal(contract.version, "2");
  assert.equal(contract.protocol.versions[0], "2");
  assert.equal(schemas.error, undefined);
  assert.equal(commandSchemaNames.length, Object.keys(commandSchemas).length);
  assert.deepEqual(await contract.parse("join", { matchId: "match-1", uid: 42 }), { matchId: "match-1", uid: 42 });
  await assert.rejects(contract.parse("join", { matchId: 42 }));
  await assert.rejects(contract.parse("unknown-command", {}));

  const observed = [];
  class JoinProbe {
    constructor() { this.name = "join"; }
    handleMessage(target, message) { observed.push({ target, payload: { type: message.type, ...message.payload } }); }
    onMessage(target, payload) { observed.push({ target, payload }); }
  }
  class CreateMatchProbe {
    constructor() { this.name = "create match"; }
    handleMessage() {}
  }
  const { CreateDuelHandler } = require("../handlers/CreateDuelHandler");
  const { DuelAcceptedHandler, DuelDeclinedHandler, DuelRecievedHandler } = require("../handlers/DuelResponseHandlers");
  const { FindMatchesHandler } = require("../handlers/FindMatchesHandler");
  const { UpdateRankHandler } = require("../handlers/RankHandler");
  const { ChatHandler, ReportChatHandler } = require("../handlers/ChatHandler");
  const { MoveHandler, LaunchCharacterHandler } = require("../handlers/MoveHandler");
  const { GetPlayersHandler } = require("../handlers/GetPlayersHandler");
  const { ShootHandler } = require("../handlers/ShootHandler");
  const actionClasses = Object.values(require("../handlers/PlayerActionHandlers"));
  const abilityClasses = Object.values(require("../handlers/AbilityHandlers"));
  const eventClasses = Object.values(require("../handlers/MatchEventHandlers"));
  const allClasses = [JoinProbe, CreateMatchProbe, CreateDuelHandler, DuelRecievedHandler, DuelAcceptedHandler, DuelDeclinedHandler,
    FindMatchesHandler, UpdateRankHandler, ChatHandler, ReportChatHandler, MoveHandler, GetPlayersHandler, ShootHandler,
    ...actionClasses, ...abilityClasses, ...eventClasses, LaunchCharacterHandler];
  const contractHandlers = createContractHandlers(allClasses);
  assert.equal(contractHandlers.length, allClasses.length);
  assert.equal(new contractHandlers[0]().name, "join");
  const contractJoin = new contractHandlers[0]();
  const contractTarget = {};
  await contractJoin.onMessage(contractTarget, { payload: { matchId: "probe" } });
  assert.deepEqual(observed, [{ target: contractTarget, payload: { matchId: "probe" } }]);
  await contractJoin.onMessage({}, { payload: { matchId: "probe" }, requestId: "req-callback", sequence: 4 });
  assert.deepEqual(observed[1], { target: {}, payload: { matchId: "probe", requestId: "req-callback", sequence: 4 } });

  assert.deepEqual(toContractMessage({ type: "error", message: "No player" }), {
    type: "server_error", payload: { message: "No player" }, metadata: {},
  });
  assert.deepEqual(toContractMessage({ type: "joined", id: "p1", requestId: "req-2", sequence: 9 }), {
    type: "joined", payload: { id: "p1" }, metadata: { requestId: "req-2", sequence: 9 },
  });
  assert.throws(() => toContractMessage(null), /object with a message type/);
  assert.throws(() => toContractMessage({ type: "missing" }), /No Redweb socket contract/);

  const sent = [];
  const wire = [];
  const sendFailures = [];
  const socketLike = {
    context: { protocol: { version: "2" } },
    sendEvent: (...args) => { sent.push(args); return true; },
    send: data => { wire.push(JSON.parse(data)); },
  };
  const errors = [];
  const route = { handleError: (_socket, error) => errors.push(error) };
  socketLike.close = code => { socketLike.closed = true; socketLike.closeCode = code; };
  installContractTransport(route, socketLike);
  assert.equal(socketLike.sendJson({ type: "joined", id: "p2", playerGivenIndex: null, player: {} }), true);
  assert.equal(socketLike.sendJson({ type: "joined", id: "p2", playerGivenIndex: null, player: {}, requestId: "req-3", sequence: 3 }), true);
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(sent[0], ["joined", { id: "p2", playerGivenIndex: null, player: {} }, {}]);
  assert.equal(socketLike.sendJson({ type: "unknown-event" }), false);
  assert.equal(errors.length, 1);
  assert.equal(socketLike.closed, true);
  assert.equal(socketLike.closeCode, 1011);

  const failingSocket = {
    context: { protocol: { version: "2" } },
    sendEvent: () => { throw new Error("transport failure"); },
    close: code => sendFailures.push(code),
  };
  installContractTransport(route, failingSocket);
  failingSocket.sendJson({ type: "joined", id: "p3" });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(errors.length, 2);
  assert.deepEqual(sendFailures, [1011]);
});

function availableMatch(matchId, options = {}) {
  return matchmaking.createMatch({
    matchId,
    arenaID: "arena",
    modeIndex: options.modeIndex ?? 1,
    creatorData: options.creatorData ?? {},
    maxPlayers: options.maxPlayers ?? null,
    challengedUid: options.challengedUid ?? null,
  });
}

function joinedPlayer(id, matchId = "match-a", uid = Number(id.replace(/\D/g, "")) || 1, extras = {}) {
  const transport = extras.socket || socket();
  const player = registry.create(transport, id, { matchId, uid, username: id, ...extras });
  assert.equal(registry.add(player), true);
  return player;
}

function lastMessage(transport) {
  return transport.sent.at(-1);
}

async function withoutLogs(callback) {
  const originalLog = console.log;
  console.log = () => {};
  try {
    return await callback();
  } finally {
    console.log = originalLog;
  }
}

test("PlayerRegistry enforces joins, assigns indexes, and supports lookup and removal", () => {
  resetSharedState();
  const local = registry.createIsolatedRegistry();
  const a = makePlayer("player-a");
  const b = makePlayer("player-b");

  assert.equal(local.add(null), false);
  assert.equal(local.add({ id: "bad", matchId: "" }), false);
  assert.equal(local.add(a), true);
  assert.equal(local.add({ ...a }), false);
  assert.equal(local.count(), 1);
  assert.equal(local.isAtCapacity(), false);
  assert.equal(a.joinIndex, 0);
  assert.equal(local.getById(a.id), a);
  assert.equal(local.getById(a.id, "other"), null);
  assert.equal(local.getBySocket(a.socket), a);
  assert.deepEqual(local.getByMatchId("match-a"), [a]);

  local.maxPlayers = 1;
  let reached = 0;
  local.on("maxPlayersReached", () => reached++);
  assert.equal(local.isAtCapacity(), true);
  assert.equal(local.add(b), false);
  assert.equal(reached, 1);

  local.maxPlayers = 2;
  local.setCreateValidator(() => false);
  assert.equal(local.add(b), false);
  local.setCreateValidator(() => true);
  assert.equal(local.add(b), true);
  assert.equal(b.joinIndex, 1);
  assert.equal(local.count(), 2);
  assert.equal(local.isAtCapacity(), true);

  local.setRemoveValidator(() => false);
  assert.equal(local.remove(b), false);
  local.setRemoveValidator(() => true);
  assert.equal(local.remove(b.id), true);
  assert.equal(local.remove(b), false);
  assert.equal(local.remove(null), false);
  assert.equal(local.remove({ socket: a.socket }), true);
  assert.equal(local.count(), 0);
  assert.equal(local.isAtCapacity(), false);
  assert.equal(local.touchPlayer(null), null);

  const throwingEmitter = registry.createIsolatedRegistry();
  throwingEmitter.maxPlayers = 0;
  throwingEmitter.emit = () => { throw new Error("listener failure"); };
  assert.equal(throwingEmitter.add(makePlayer("not-added")), false);
  const zeroLimit = registry.createIsolatedRegistry();
  zeroLimit.maxPlayers = 0;
  assert.equal(zeroLimit.isAtCapacity(), false);
  const capReached = registry.createIsolatedRegistry();
  capReached.maxPlayers = 1;
  let capEvent = false;
  capReached.on("maxPlayersReached", () => { capEvent = true; });
  assert.equal(capReached.add(makePlayer("cap-reached")), true);
  assert.equal(capEvent, true);
  const throwingAfterAdd = registry.createIsolatedRegistry();
  throwingAfterAdd.maxPlayers = 1;
  throwingAfterAdd.emit = () => { throw new Error("listener failure after add"); };
  assert.equal(throwingAfterAdd.add(makePlayer("throwing-after-add")), true);
  const noEmitter = registry.createIsolatedRegistry();
  noEmitter.maxPlayers = 1;
  noEmitter.emit = null;
  assert.equal(noEmitter.add(makePlayer("no-emitter")), true);
});

test("PlayerRegistry cleans closed sockets, disconnects, and inactive players", () => {
  resetSharedState();
  const local = registry.createIsolatedRegistry();
  const open = makePlayer("open", "m", { socket: socket() });
  const closed = makePlayer("closed", "m", { socket: socket(3) });
  local.add(open);
  local.add(closed);
  assert.equal(local.pruneClosedPlayers(), 1);
  assert.equal(local.getById("closed"), null);
  assert.equal(local.getById("open"), open);

  const second = makePlayer("second", "m");
  local.add(second);
  assert.equal(local.removeBySocket(second.socket, "quit"), 1);
  assert.equal(local.removeBySocket(second.socket), 0);

  const inactive = makePlayer("inactive", "m");
  const untouched = makePlayer("untouched", "m");
  local.add(inactive);
  local.add(untouched);
  inactive.lastMatchActivityAt = 1_000;
  inactive.lastActivityMatchId = "m";
  untouched.lastMatchActivityAt = 1_000;
  untouched.lastActivityMatchId = "other";
  assert.equal(local.sweepInactivePlayers(40_000), 1);
  assert.equal(inactive.socket.sent.at(-1).type, "removed from match");
  assert.equal(local.getById("inactive"), null);
  assert.equal(local.sweepInactivePlayers(40_000), 0);

  const noActivity = makePlayer("no-activity", "m");
  const recent = makePlayer("recent", "m");
  const noMatch = makePlayer("no-match", "m");
  local.add(noActivity);
  local.add(recent);
  local.add(noMatch);
  recent.lastMatchActivityAt = 39_999;
  recent.lastActivityMatchId = "m";
  noMatch.matchId = "";
  assert.equal(local.sweepInactivePlayers(40_000), 0);

  const matchmakingRemove = matchmaking.removePlayer;
  matchmaking.removePlayer = () => { throw new Error("match service unavailable"); };
  assert.equal(local.remove(noActivity), true);
  matchmaking.removePlayer = matchmakingRemove;
});

test("PlayerRegistry handles activity edge cases, socket filtering, and registry events", () => {
  resetSharedState();
  const local = registry.createIsolatedRegistry();
  const player = makePlayer("sample", "one");
  local.add(player);
  assert.equal(local.getBySocket(player.socket), player);
  assert.equal(local.touchPlayer(null), null);
  assert.equal(local._indexOf(null), -1);
  assert.equal(local._indexOf("sample"), 0);
  assert.equal(local._indexOf({ socket: player.socket }), 0);
  assert.equal(local._indexOf({ id: "sample" }), 0);
  assert.equal(local._indexOf({}), -1);
  assert.equal(local._indexOf(player), 0);
  const exact = {};
  local.items.push(exact);
  assert.equal(local._indexOf(exact), 1);
  local.items.pop();
  assert.deepEqual(local.getSanitizedList("one").map(item => item.id), ["sample"]);
  assert.deepEqual(local.getSanitizedList("two"), []);
  assert.equal(local.count(), 1);

  const closed = makePlayer("closed", "one", { socket: socket(3) });
  local.add(closed);
  local.broadcast({ type: "event" }, player.socket, "one");
  assert.equal(player.socket.sent.length, 1);
  assert.equal(player.socket.sent[0].type, "player_left");
  assert.equal(closed.socket.sent.length, 0);
  assert.equal(local.getById("closed"), null);

  const anotherMatch = makePlayer("other", "two");
  local.add(anotherMatch);
  local.broadcast({ type: "event" }, null, "one", { pruneClosed: false });
  assert.equal(player.socket.sent.length, 2);
  assert.equal(player.socket.sent.at(-1).type, "event");
  assert.equal(anotherMatch.socket.sent.length, 0);
  assert.equal(local.getBySocket(socket()), null);
  const noReadyState = makePlayer("no-ready-state", "one", { socket: {} });
  local.add(noReadyState);
  assert.equal(local.pruneClosedPlayers(), 0);
  const closedKept = makePlayer("closed-kept", "one", { socket: socket(3) });
  local.add(closedKept);
  local.broadcast({ type: "skip-closed" }, null, "one", { pruneClosed: false });
  assert.equal(closedKept.socket.sent.length, 0);
  assert.deepEqual(local.all().map(item => item.id), ["sample", "other", "no-ready-state", "closed-kept"]);
});

test("PlayerRegistry delegates match membership and scoped broadcasts to the attached Redweb rooms", () => {
  const local = registry.createIsolatedRegistry();
  const calls = [];
  const transport = socket();
  local.setRoomRegistry({
    join(roomId, currentSocket) { calls.push(["join", roomId, currentSocket]); return true; },
    leave(roomId, currentSocket) { calls.push(["leave", roomId, currentSocket]); return true; },
    broadcast(roomId, payload, options) { calls.push(["broadcast", roomId, payload, options]); return 1; },
  });
  const player = local.create(transport, "room-player", { matchId: "room-match" });
  assert.equal(local.add(player), true);
  assert.equal(local.joinRoom(transport, "room-match"), true);
  assert.equal(local.joinRoom(null, "room-match"), false);
  assert.equal(local.joinRoom(transport, null), false);
  assert.equal(local.broadcast({ type: "room-event" }, transport, "room-match"), 1);
  assert.equal(calls[1][2].type, "room-event");
  assert.equal(typeof calls[1][2].timestamp, "number");
  assert.deepEqual(calls[1][3], { except: transport });
  const suppliedTimestamp = { type: "existing-time", timestamp: 5 };
  local.broadcast(suppliedTimestamp, null, "room-match");
  assert.equal(calls[2][2], suppliedTimestamp);
  local.setRoomRegistry({
    members: () => [transport, socket(), { readyState: 1, sendJson: () => true }],
    leave: (...args) => calls.push(["leave", ...args]),
    broadcast() { throw new Error("The member based contract path should be used"); },
  });
  assert.equal(local.broadcast({ type: "contract-event" }, null, "room-match"), 1);
  assert.equal(transport.sent.at(-1).type, "contract-event");
  assert.equal(local.remove(player), true);
  assert.deepEqual(calls[3], ["leave", "room-match", transport]);
  local.setRoomRegistry(null);
  assert.equal(local.joinRoom(transport, "room-match"), true);
});

test("PlayerRegistry inactivity timer can be enabled and safely stopped", () => {
  const local = registry.createIsolatedRegistry({ inactivityEnabled: true });
  assert.ok(local.inactivityInterval);
  clearInterval(local.inactivityInterval);
});

test("Player normalizes player identity, vectors, legacy customization, and sends safely", () => {
  const transport = socket();
  const player = new Player(transport, "p1", {
    matchId: " m ", username: " Ada ", uid: 123456789,
    angle: Math.PI / 2,
    customization: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
  }, registry);
  assert.equal(player.matchId, "m");
  assert.equal(player.username, "Ada");
  assert.equal(player.uid, 9);
  assert.equal(player.angle.y, 1);
  assert.equal(player.customization.length, 12);
  assert.deepEqual(player.getSanitized().socket, undefined);
  assert.deepEqual(player.getJoinSanitized().position, undefined);
  player.setPosition({ x: 4 }, { y: 5 }, { x: 0, y: 1 });
  player.setVector({ z: 2 });
  player.setAngle(0);
  assert.equal(player.position.x, 4);
  assert.equal(player.vector.z, 2);
  assert.equal(player.angle.x, 1);
  assert.equal(player.send("ping", { value: 1 }), true);
  assert.equal(transport.sent[0].type, "ping");

  const eleven = new Player(socket(), "p2", { customization: Array(11).fill(1) }, registry);
  assert.equal(eleven.customization.length, 12);
  const explicit = new Player(socket(), "explicit", { joinIndex: 8, playerGivenIndex: 4 }, registry);
  assert.equal(explicit.joinIndex, 8);
  assert.equal(explicit.playerGivenIndex, 4);
  const invalidTen = Array(10).fill(1); invalidTen[4] = "bad"; invalidTen[8] = 1_000_000_000;
  assert.equal(new Player(socket(), "invalid-ten", { customization: invalidTen }, registry).uid, 0);
  const invalidEleven = Array(11).fill(1); invalidEleven[3] = "bad"; invalidEleven[9] = 1_000_000_000;
  assert.equal(new Player(socket(), "invalid-eleven", { customization: invalidEleven }, registry).uid, 0);
  const invalid = new Player(socket(), "p3", { username: 2, matchId: 4, customization: ["bad"] }, registry);
  assert.equal(invalid.username, "");
  assert.equal(invalid.matchId, "");
  assert.equal(invalid.customization[0], 0);
  assert.equal(invalid.angle.x, 1);
  invalid.updateJoinData({ username: " New ", playerGivenIndex: 3, uid: 234567890 });
  assert.equal(invalid.username, "New");
  assert.equal(invalid.playerGivenIndex, 3);
  assert.equal(invalid.uid, 234567890);
  invalid.updateJoinData({ customization: [2, 0], username: 4, playerGivenIndex: "x" });
  assert.equal(invalid.username, "New");
  invalid.updateJoinData({});

  const invalidLegacy = new Player(socket(), "legacy", {
    customization: [0, 0, 0, 0, 0, 0, 0, 0, 1_000_000_000, 1],
  }, registry);
  assert.equal(invalidLegacy.uid, 0);
  const invalidCurrent = new Player(socket(), "current", {
    customization: [...Array(10).fill(0), 1_000_000_000, 0],
  }, registry);
  assert.equal(invalidCurrent.uid, 0);

  const raw = { readyState: 1, sent: [], send(text) { this.sent.push(text); } };
  const rawPlayer = new Player(raw, "raw", {}, registry);
  assert.equal(rawPlayer.send("raw"), true);
  assert.equal(JSON.parse(raw.sent[0]).type, "raw");
  assert.equal(new Player({ readyState: 3 }, "closed", {}, registry).send("no"), false);
  assert.equal(new Player({}, "unsupported", {}, registry).send("no"), false);
});

test("matchmaking creates, copies, limits, joins, and removes match players", () => {
  resetSharedState();
  assert.equal(matchmaking.getJoinLimit(null), 0);
  assert.equal(matchmaking.getJoinLimit({ maxPlayers: 3 }), 3);
  assert.equal(matchmaking.getJoinLimit({ modeIndex: 0 }), 2);
  assert.equal(matchmaking.getJoinLimit({ modeIndex: 1 }), 8);
  assert.equal(matchmaking.getJoinLimit({ maxPlayers: 0, modeIndex: 1 }), 8);
  assert.equal(matchmaking.hasMatch("lobbyL"), true);
  assert.equal(matchmaking.getMatch("absent"), null);
  assert.equal(matchmaking.canJoin("absent").allowed, false);
  assert.equal(matchmaking.canJoin("lobbyL").allowed, true);
  assert.equal(matchmaking.addPlayer({ matchId: "missing" }), null);
  assert.equal(matchmaking.removePlayer({ matchId: "missing" }), null);

  const match = matchmaking.createMatch({
    matchId: "m", arenaID: "arena", modeIndex: 0,
    creatorData: { uid: 7, username: " Ada ", customization: [1] },
  });
  assert.equal(match.creator.username, "Ada");
  assert.equal(match.creatorUserId, 7);
  assert.equal(matchmaking.createMatch({ matchId: "m" }), null);
  assert.deepEqual(matchmaking.canJoin("m"), { allowed: true, match });
  assert.equal(matchmaking.addPlayer(null), null);
  const player = makePlayer("joined", "m");
  assert.equal(matchmaking.addPlayer(player), match);
  assert.equal(matchmaking.addPlayer(player), match);
  assert.equal(match.players.length, 1);
  const copy = matchmaking.getAvailableMatches();
  copy[0].players.push({ id: "mutated" });
  assert.equal(match.players.length, 1);
  assert.equal(matchmaking.removePlayer(player), match);
  assert.equal(matchmaking.removePlayer(player), null);
  assert.equal(matchmaking.removePlayer({ matchId: "missing" }), null);
  assert.equal(matchmaking.addPlayer({ matchId: "m", id: player.id, getJoinSanitized: () => ({ id: player.id, matchId: "m" }) }), match);
  assert.equal(match.players.length, 1);
  assert.equal(matchmaking.addPlayer({}), null);
  assert.equal(matchmaking.removePlayer({}), null);

  const full = matchmaking.createMatch({
    matchId: "full", modeIndex: 0, maxPlayers: 1, creatorData: {},
  });
  full.players.push({ id: "already" });
  assert.equal(matchmaking.canJoin("full").allowed, false);
  assert.equal(matchmaking.canJoin("full").reason, "Match is full (1 players max for modeIndex 0)");
  assert.equal(matchmaking.getMatch("full"), full);
});

test("Redweb entry point starts only when invoked directly and reports startup failures", async () => {
  const { createHttpServices, getListenerPort, runIfMain, startServer, startWithErrorHandling } = require("../index");
  assert.equal(typeof startServer, "function");
  assert.equal(getListenerPort({ PORT: "8080", WS_PORT: "3001" }), 8080);
  assert.equal(getListenerPort({ PORT: "", WS_PORT: "3001" }), 3001);
  assert.equal(getListenerPort({}), 3000);
  let called = 0;
  assert.equal(runIfMain({}, () => called++), undefined);
  assert.equal(called, 0);
  assert.equal(runIfMain(require.main, () => ++called), 1);
  assert.equal(called, 1);
  assert.equal(await startWithErrorHandling(() => "started"), "started");
  const originalExitCode = process.exitCode;
  const originalError = console.error;
  let loggedError;
  console.error = (_message, error) => { loggedError = error; };
  try {
    await startWithErrorHandling(() => { throw new Error("startup failure"); });
    assert.equal(loggedError.message, "startup failure");
    assert.equal(process.exitCode, 1);
  } finally {
    console.error = originalError;
    process.exitCode = originalExitCode;
  }

  const services = createHttpServices(() => ({ isReady: () => true }));
  assert.deepEqual(services.map(service => service.serviceName), ["/health", "/ready"]);
  let healthResponse;
  services[0].function({}, {
    status(code) { assert.equal(code, 200); return this; },
    json(body) { healthResponse = body; },
  });
  assert.deepEqual(healthResponse, { status: "ok" });
  let readinessResponse;
  services[1].function({}, {
    status(code) { assert.equal(code, 200); return this; },
    json(body) { readinessResponse = body; },
  });
  assert.deepEqual(readinessResponse, { status: "ready" });
  const notReadyService = createHttpServices(() => null)[1];
  notReadyService.function({}, {
    status(code) { assert.equal(code, 503); return this; },
    json(body) { readinessResponse = body; },
  });
  assert.deepEqual(readinessResponse, { status: "starting" });
});

test("Redweb route options bound transport and normalize optional origin configuration", () => {
  const { getAllowedOrigins, getPositiveInteger, getSocketRouteOptions } = require("../DefaultRoute");
  assert.deepEqual(getAllowedOrigins({}), []);
  assert.deepEqual(getAllowedOrigins({ ALLOWED_ORIGINS: " https://game.example, ,https://game.example,https://play.example " }), [
    "https://game.example",
    "https://play.example",
  ]);
  assert.equal(getPositiveInteger({}, "REDWEB_MAX_CONNECTIONS", 1000), 1000);
  assert.equal(getPositiveInteger({ REDWEB_MAX_CONNECTIONS: "250" }, "REDWEB_MAX_CONNECTIONS", 1000), 250);
  assert.throws(() => getPositiveInteger({ REDWEB_MAX_CONNECTIONS: "0" }, "REDWEB_MAX_CONNECTIONS", 1000), /positive safe integer/);

  const defaults = getSocketRouteOptions({});
  assert.equal(defaults.admission, undefined);
  assert.equal(defaults.limits.maxConnections, 1000);
  assert.equal(defaults.limits.maxBufferedBytes, 256 * 1024);
  assert.equal(defaults.limits.maxPendingMessages, 64);
  assert.equal(defaults.websocketOptions.maxPayload, 64 * 1024);
  assert.equal(defaults.orderedMessages, true);
  assert.deepEqual(defaults.heartbeat, { intervalMs: 30_000, timeoutMs: 10_000 });
  const originPolicy = getSocketRouteOptions({ ALLOWED_ORIGINS: "https://game.example" }).admission.origins;
  assert.equal(originPolicy("https://game.example"), true);
  assert.equal(originPolicy("https://unknown.example"), false);
  assert.equal(originPolicy(undefined), true);
});

test("rank service stores local ranks in order and handles malformed storage", async (t) => {
  const folder = await fs.mkdtemp(path.join(os.tmpdir(), "gemhouse-ranks-"));
  const filename = path.join(folder, "nested", "ranks.json");
  const previous = {
    RANKS_FILE: process.env.RANKS_FILE,
    RANKS_COLLECTION: process.env.RANKS_COLLECTION,
    RANK_STORAGE: process.env.RANK_STORAGE,
    K_SERVICE: process.env.K_SERVICE,
  };
  process.env.RANKS_FILE = filename;
  delete process.env.RANK_STORAGE;
  delete process.env.K_SERVICE;
  delete process.env.RANKS_COLLECTION;
  const servicePath = require.resolve("../services/RankService");
  delete require.cache[servicePath];
  const service = require(servicePath);
  t.after(async () => {
    delete require.cache[servicePath];
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    await fs.rm(folder, { recursive: true, force: true });
    require(servicePath);
  });

  assert.equal(service.storageMode(), "file");
  assert.equal(await service.updateRank({ id: 10, username: "A", xp: 100 }).then(x => x.rank), 1);
  assert.equal((await service.updateRank({ id: 5, username: "B", xp: 100 })).rank, 1);
  assert.equal((await service.updateRank({ id: 10, username: "A2", xp: 50 })).rank, 2);
  const saved = JSON.parse(await fs.readFile(filename, "utf8"));
  assert.deepEqual(saved.players.map(item => item.id), [5, 10]);

  await fs.writeFile(filename, JSON.stringify({ players: "not-an-array" }));
  assert.equal((await service.updateRank({ id: 20, username: "C", xp: 5 })).rank, 1);
  await fs.writeFile(filename, "{");
  await assert.rejects(service.updateRank({ id: 30, username: "D", xp: 1 }), SyntaxError);
});

test("rank service batches Firestore updates and reuses its database client", async (t) => {
  const firestoreModule = require("@google-cloud/firestore");
  const originalFirestore = firestoreModule.Firestore;
  const previous = {
    RANKS_FILE: process.env.RANKS_FILE,
    RANKS_COLLECTION: process.env.RANKS_COLLECTION,
    RANK_STORAGE: process.env.RANK_STORAGE,
    K_SERVICE: process.env.K_SERVICE,
  };
  let constructed = 0;
  const database = { rows: new Map() };
  class FakeFirestore {
    constructor() { constructed += 1; }
    collection(name) {
      assert.equal(name, "testRanks");
      const docRef = id => ({ id, set: async (data) => {
        database.rows.set(id, { ...(database.rows.get(id) || {}), ...data });
      } });
      return {
        doc: docRef,
        get: async () => ({
          docs: [...database.rows].map(([id, data]) => ({ id, data: () => data })),
        }),
      };
    }
    batch() {
      const pending = [];
      return {
        set(reference, data) { pending.push([reference.id, data]); },
        async commit() {
          for (const [id, data] of pending) {
            database.rows.set(id, { ...(database.rows.get(id) || {}), ...data });
          }
        },
      };
    }
  }

  firestoreModule.Firestore = FakeFirestore;
  delete process.env.RANK_STORAGE;
  process.env.RANKS_COLLECTION = "testRanks";
  process.env.K_SERVICE = "gemhouse";
  const servicePath = require.resolve("../services/RankService");
  delete require.cache[servicePath];
  const service = require(servicePath);
  t.after(() => {
    delete require.cache[servicePath];
    firestoreModule.Firestore = originalFirestore;
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    require(servicePath);
  });

  assert.equal(service.storageMode(), "firestore");
  for (let id = 1; id <= 501; id += 1) {
    database.rows.set(String(id), id === 501
      ? { id, username: null, xp: 0, rank: 0 }
      : { id, username: `player-${id}`, xp: id === 1 ? 100 : 50, rank: 0, updatedAt: "then" });
  }
  const updated = await service.updateRank({ id: 900, username: "  Ada  ", xp: 150 });
  assert.equal(updated.rank, 1);
  assert.equal(database.rows.get("900").username, "Ada");
  assert.ok(database.rows.get("501").rank > 0);
  await service.updateRank({ id: 900, username: "Ada 2", xp: 175 });
  assert.equal(constructed, 1);
});

test("handler utilities normalize values and support Redweb and raw WebSocket send methods", () => {
  const sent = socket();
  assert.equal(utils.getRegistry(), registry);
  assert.equal(utils.getPlayerOrError(sent), null);
  assert.equal(lastMessage(sent).message, "Player not found");
  assert.equal(utils.isBoolean(false), true);
  assert.equal(utils.isFiniteNumber(Infinity), false);
  assert.equal(utils.isFiniteNumber(1.2), true);
  assert.equal(utils.isInteger(2), true);
  assert.equal(utils.isInteger(2.5), false);
  assert.equal(utils.isVector({ X: "2", Y: 3 }), true);
  assert.equal(utils.isVector({ x: 2 }), false);
  assert.deepEqual(utils.normalizeVector({ X: "2", y: Infinity, Z: 4 }, 9), { x: 2, y: 0, z: 4 });
  assert.deepEqual(utils.normalizeVector(null, 7), { x: 0, y: 0, z: 7 });
  assert.equal(utils.sendError(sent, "bad"), null);

  const raw = { sent: [], send(text) { this.sent.push(text); } };
  utils.sendJsonWithLog(raw, { type: "raw" });
  assert.equal(JSON.parse(raw.sent[0]).type, "raw");
  utils.sendJsonWithLog({}, { type: "ignored" });
  utils.sendJsonWithLog({}, null);
  const circular = {}; circular.self = circular;
  utils.logIncomingMessage("circular", circular);
  utils.logOutgoingMessage("circular", circular);
});

test("match, duel, list, and player handlers validate and return expected messages", () => {
  const transport = socket();
  const create = new CreateMatchHandler();
  create.onMessage(transport, {});
  assert.match(lastMessage(transport).message, /arenaID/);
  create.onMessage(transport, { arenaID: "a" });
  assert.match(lastMessage(transport).message, /modeIndex/);
  create.onMessage(transport, { arenaID: "a", modeIndex: 1 });
  assert.match(lastMessage(transport).message, /uid/);
  create.onMessage(transport, { arenaID: " arena ", modeIndex: 1, uid: 4, username: "Ada" });
  assert.equal(lastMessage(transport).type, "match_created");
  const matchId = lastMessage(transport).match.matchId;
  const originalCreateMatch = matchmaking.createMatch;
  matchmaking.createMatch = () => null;
  create.onMessage(transport, { arenaID: "arena", modeIndex: 1, uid: 4 });
  assert.match(lastMessage(transport).message, /Match creation failed/);
  matchmaking.createMatch = originalCreateMatch;

  const find = new FindMatchesHandler();
  find.onMessage(transport);
  assert.equal(lastMessage(transport).matches[0].matchId, matchId);
  new GetPlayersHandler().onMessage(transport);
  assert.deepEqual(lastMessage(transport).players, []);

  const duel = new CreateDuelHandler();
  duel.onMessage(transport, {});
  assert.match(lastMessage(transport).message, /modeIndex/);
  duel.onMessage(transport, { modeIndex: 0 });
  assert.match(lastMessage(transport).message, /uid/);
  duel.onMessage(transport, { modeIndex: 0, uid: 4 });
  assert.match(lastMessage(transport).message, /challengedUid/);
  duel.onMessage(transport, { modeIndex: 0, uid: 4, challengedUid: 5, username: "Ada" });
  assert.equal(lastMessage(transport).type, "duel_created");

  const created = matchmaking.getAvailableMatches().find(match => match.matchType === "duel");
  assert.equal(created.arenaID, "finaleL1");
  const player = joinedPlayer("joined", created.matchId, 4);
  const peer = socket();
  const other = joinedPlayer("other", created.matchId, 6, { socket: peer });
  new GetPlayersHandler().onMessage(player.socket);
  assert.equal(lastMessage(player.socket).players.length, 2);
  duel.onMessage(player.socket, { modeIndex: 1, uid: 9, challengedUid: 6 });
  assert.equal(lastMessage(peer).type, "duel_created");

  const originalCreateMatchForDuel = matchmaking.createMatch;
  matchmaking.createMatch = () => null;
  const failedDuelSocket = socket();
  duel.onMessage(failedDuelSocket, { modeIndex: 0, uid: 1, challengedUid: 2 });
  assert.match(lastMessage(failedDuelSocket).message, /Duel creation failed/);
  matchmaking.createMatch = originalCreateMatchForDuel;
});

test("duel response handlers cover match and challenger identity fallbacks", () => {
  const unknown = socket();
  const received = new DuelRecievedHandler();
  received.onMessage(unknown, {});
  assert.match(lastMessage(unknown).message, /matchId/);
  received.onMessage(unknown, { matchID: "missing" });
  assert.match(lastMessage(unknown).message, /challengerUid/);
  received.onMessage(unknown, { matchId: "missing", challengerUID: 8 });
  assert.equal(lastMessage(unknown).type, "duel recieved");
  assert.equal(lastMessage(unknown).challengerUid, 8);
  received.onMessage(unknown, { matchId: "missing", challengerUid: 7 });
  assert.equal(lastMessage(unknown).challengerUid, 7);

  const match = matchmaking.createMatch({
    matchId: "duel", matchType: "duel", arenaID: "a", modeIndex: 0,
    challengedUid: 9, creatorData: { uid: 8 },
  });
  const player = joinedPlayer("responder", "duel", 9);
  new DuelAcceptedHandler().onMessage(player.socket, { matchId: match.matchId, challengerUid: 55 });
  assert.equal(lastMessage(player.socket).type, "duel accepted");
  assert.equal(lastMessage(player.socket).challengerUid, 8);
  assert.equal(lastMessage(player.socket).challengedUid, 9);
  new DuelDeclinedHandler().onMessage(player.socket, { matchId: "duel", challengerUid: 55 });
  assert.equal(lastMessage(player.socket).type, "duel declined");
  new DuelRecievedHandler().onMessage(player.socket, { matchId: "unregistered-match" });
  assert.equal(lastMessage(player.socket).challengerUid, 9);
});

test("chat validates identity and content, trims messages, and broadcasts only to match peers", () => {
  availableMatch("chat-match");
  const sender = socket();
  const peer = socket();
  joinedPlayer("chat-sender", "chat-match", 41, { socket: sender, username: "Ada" });
  joinedPlayer("chat-peer", "chat-match", 42, { socket: peer, username: "Lin" });
  const handler = new ChatHandler();

  const unregistered = socket();
  handler.onMessage(unregistered, { playerId: 41, username: "Ada", message: "hello" });
  assert.equal(lastMessage(unregistered).message, "Player not found");

  handler.onMessage(sender, { playerId: "41", username: "Ada", message: "hello" });
  assert.match(lastMessage(sender).message, /integer 'playerId'/);
  handler.onMessage(sender, { playerId: 9, username: "Ada", message: "hello" });
  assert.match(lastMessage(sender).message, /does not match/);
  handler.onMessage(sender, { playerId: 41, username: " ", message: "hello" });
  assert.match(lastMessage(sender).message, /requires a 'username'/);
  handler.onMessage(sender, { playerId: 41, username: 5, message: "hello" });
  assert.match(lastMessage(sender).message, /requires a 'username'/);
  handler.onMessage(sender, { playerId: 41, username: "Mallory", message: "hello" });
  assert.match(lastMessage(sender).message, /username.*does not match/);
  handler.onMessage(sender, { playerId: 41, username: "Ada", message: "  " });
  assert.match(lastMessage(sender).message, /requires a 'message'/);
  handler.onMessage(sender, { playerId: 41, username: "Ada", message: 5 });
  assert.match(lastMessage(sender).message, /requires a 'message'/);
  handler.onMessage(sender, { playerId: 41, username: " Ada ", message: " hello " });
  assert.equal(lastMessage(peer).type, "chat");
  assert.equal(lastMessage(peer).player.message, "hello");
  assert.equal(lastMessage(sender).type, "error");
  assert.equal(peer.sent.at(-1).player.username, "Ada");

  const anonymous = socket();
  joinedPlayer("anonymous", "chat-match", 43, { socket: anonymous, username: "" });
  handler.onMessage(anonymous, { playerId: 43, username: "NewName", message: "hi" });
  assert.equal(lastMessage(peer).player.username, "NewName");

  const originalNow = Date.now;
  let now = 10_000;
  Date.now = () => now;
  try {
    const timedSocket = socket();
    handler.onMessage(timedSocket, {});
    now += 5_001;
    handler.onMessage(timedSocket, {});
  } finally {
    Date.now = originalNow;
  }
});

test("chat logs cap history and report validation, scoring, and rate limits work", async () => withoutLogs(async () => {
  availableMatch("report-match");
  const peer = socket();
  joinedPlayer("offender", "report-match", 80, { socket: peer, username: "Offender" });
  const chat = new ChatHandler();
  for (let index = 0; index < 201; index += 1) {
    const transport = socket();
    joinedPlayer(`log-${index}`, "report-match", 80, { socket: transport, username: "Offender" });
    chat.onMessage(transport, { playerId: 80, username: "Offender", message: `message-${index}` });
  }

  const handler = new ReportChatHandler();
  const unregisteredReporter = socket();
  handler.onMessage(unregisteredReporter, {});
  assert.equal(lastMessage(unregisteredReporter).message, "Player not found");
  const report = { offendingMessage: "message-200", playerId: 80, reporterPlayerId: 90, username: "Reporter", reason: "abuse" };
  let reporterIndex = 0;
  function sendValidation(message) {
    const transport = socket();
    joinedPlayer(`reporter-${++reporterIndex}`, "report-match", 90, { socket: transport, username: "Reporter" });
    handler.onMessage(transport, message);
    return lastMessage(transport);
  }
  assert.match(sendValidation({ ...report, offendingMessage: " " }).message, /offendingMessage/);
  assert.match(sendValidation({ ...report, offendingMessage: "x", playerId: "80" }).message, /integer 'playerId'/);
  assert.match(sendValidation({ ...report, offendingMessage: "x", reporterPlayerId: "90" }).message, /reporterPlayerId/);
  assert.match(sendValidation({ ...report, reporterPlayerId: 91 }).message, /does not match/);
  assert.match(sendValidation({ ...report, reason: " " }).message, /reason/);
  assert.match(sendValidation({ ...report, username: "Wrong" }).message, /username.*does not match/);
  assert.match(sendValidation({ ...report, playerId: 999 }).message, /not found in this match/);

  availableMatch("empty-report-match");
  const emptyReporter = socket();
  joinedPlayer("empty-reporter", "empty-report-match", 90, { socket: emptyReporter, username: "Reporter" });
  joinedPlayer("empty-offender", "empty-report-match", 92, { username: "Other" });
  handler.onMessage(emptyReporter, { ...report, playerId: 92 });
  assert.equal(lastMessage(emptyReporter).invalid, true);

  const reporterSocket = socket();
  joinedPlayer(`reporter-${++reporterIndex}`, "report-match", 90, { socket: reporterSocket, username: "Reporter" });
  handler.onMessage(reporterSocket, { ...report, offendingMessage: "message-0" });
  assert.equal(lastMessage(reporterSocket).type, "report recieved");
  assert.equal(lastMessage(reporterSocket).invalid, true);
  handler.onMessage(reporterSocket, report);
  assert.equal(lastMessage(reporterSocket).invalid, false);
  handler.onMessage(reporterSocket, report);
  assert.ok(peer.sent.some(message => message.type === "dangerous-player" && message.reportCount === 3));

  const reportRateSocket = socket();
  joinedPlayer("report-rate", "report-match", 90, { socket: reportRateSocket, username: "Reporter" });
  for (let index = 0; index < 4; index += 1) handler.onMessage(reportRateSocket, report);
  await new Promise(resolve => setTimeout(resolve, 120));
  assert.equal(reportRateSocket.closed, true);

  const chatRateSocket = { readyState: 1, sent: [], terminate() { this.terminated = true; }, sendJson(message) { this.sent.push(message); } };
  const limitedChat = new ChatHandler();
  for (let index = 0; index < 11; index += 1) limitedChat.onMessage(chatRateSocket, {});
  await new Promise(resolve => setTimeout(resolve, 120));
  assert.equal(chatRateSocket.terminated, true);

  const endSocket = { readyState: 1, sent: [], end() { this.ended = true; }, sendJson(message) { this.sent.push(message); } };
  const rateReporter = new ReportChatHandler();
  for (let index = 0; index < 4; index += 1) rateReporter.onMessage(endSocket, {});
  await new Promise(resolve => setTimeout(resolve, 120));
  assert.equal(endSocket.ended, true);

  const originalNow = Date.now;
  let now = 50_000;
  Date.now = () => now;
  try {
    const expiredReporter = socket();
    joinedPlayer("expired-reporter", "report-match", 90, { socket: expiredReporter, username: "Reporter" });
    rateReporter.onMessage(expiredReporter, {});
    now += 10_001;
    rateReporter.onMessage(expiredReporter, {});
    assert.match(lastMessage(expiredReporter).message, /offendingMessage/);
  } finally {
    Date.now = originalNow;
  }
}));

test("join handler handles rejoin, duplicate uid, room changes, and rejected joins", () => {
  const handler = new JoinHandler();
  const transport = socket();
  handler.onMessage(transport, {});
  assert.match(lastMessage(transport).message, /matchId/);
  handler.onMessage(transport, { matchId: "absent" });
  assert.match(lastMessage(transport).message, /valid matchId/);

  availableMatch("first");
  handler.onMessage(transport, { matchId: "first", uid: 12, username: " Ada ", playerGivenIndex: 0 });
  assert.equal(lastMessage(transport).type, "joined");
  const firstPlayer = registry.getBySocket(transport);
  handler.onMessage(transport, { matchId: " first ", uid: 12, username: "Ada2", position: { x: 7 } });
  assert.equal(lastMessage(transport).type, "joined");
  assert.equal(firstPlayer.username, "Ada2");
  assert.equal(firstPlayer.position.x, 0);

  const duplicate = joinedPlayer("duplicate", "first", 77);
  availableMatch("second");
  const newcomer = socket();
  handler.onMessage(newcomer, { matchId: "first", customization: Array.from({ length: 11 }, (_, i) => i === 10 ? 77 : 0) });
  assert.equal(registry.getById(duplicate.id), null);
  assert.equal(lastMessage(newcomer).type, "joined");

  handler.onMessage(transport, { matchId: "second", uid: 12, username: "Ada" });
  assert.equal(registry.getBySocket(transport).matchId, "second");
  assert.equal(registry.getById(firstPlayer.id), null);
  assert.equal(lastMessage(transport).type, "joined");

  const full = availableMatch("full", { modeIndex: 0, maxPlayers: 1 });
  full.players.push({ id: "filled" });
  const denied = socket();
  handler.onMessage(denied, { matchId: "full", uid: 10 });
  assert.match(lastMessage(denied).message, /full/);

  availableMatch("registry-full");
  registry.maxPlayers = 0;
  const rejected = socket();
  handler.onMessage(rejected, { matchId: "registry-full", uid: 10 });
  assert.equal(lastMessage(rejected).message, "Join rejected");
  registry.maxPlayers = Infinity;
  availableMatch("anonymous");
  const noUid = socket();
  handler.onMessage(noUid, { matchId: "anonymous", customization: [0, 0] });
  assert.equal(lastMessage(noUid).type, "joined");

  registry.setRoomRegistry({ join: () => false, leave: () => true });
  availableMatch("room-full");
  const noRoom = socket();
  handler.onMessage(noRoom, { matchId: "room-full", uid: 10 });
  assert.equal(lastMessage(noRoom).message, "Match room is full");
  assert.equal(registry.getBySocket(noRoom), null);
  registry.setRoomRegistry(null);
});

test("combat and movement handlers validate inputs and broadcast within the joined match", () => {
  const sender = socket();
  const peer = socket();
  const player = joinedPlayer("attacker", "arena", 31, { socket: sender, angle: { x: 0, y: 1 } });
  joinedPlayer("target", "arena", 32, { socket: peer });
  const other = socket();
  joinedPlayer("elsewhere", "elsewhere", 33, { socket: other });

  const shoot = new ShootHandler();
  const unregistered = socket();
  shoot.onMessage(unregistered, {});
  assert.equal(lastMessage(unregistered).message, "Player not found");
  shoot.onMessage(sender, {});
  assert.equal(lastMessage(peer).type, "player_shot");
  assert.equal(lastMessage(peer).position.x, 0);
  shoot.onMessage(sender, { position: { x: 9, y: 8 }, direction: { x: 0, y: 1 } });
  assert.equal(lastMessage(peer).position.x, 9);

  const unregisteredMove = socket();
  new MoveHandler().onMessage(unregisteredMove, { position: { x: 1 } });
  assert.equal(lastMessage(unregisteredMove).message, "Player not found");
  const unregisteredLaunch = socket();
  new LaunchCharacterHandler().onMessage(unregisteredLaunch, { velocity: { x: 1, y: 1 } });
  assert.equal(lastMessage(unregisteredLaunch).message, "Player not found");

  for (const [Handler, message] of [
    [DealDamageHandler, { amount: 1, targetId: "target" }],
    [UpdateHealthHandler, { newHealth: 1, targetId: "target" }],
    [UpdatePointsHandler, { points: 1 }],
  ]) {
    const unregistered = socket();
    new Handler().onMessage(unregistered, message);
    assert.equal(lastMessage(unregistered).message, "Player not found");
  }

  const move = new MoveHandler();
  move.onMessage(socket(), {});
  move.onMessage(sender, {});
  const before = peer.sent.length;
  move.onMessage(sender, { angle: 1 });
  assert.equal(peer.sent.length, before + 1);
  assert.equal(player.angle.x, Math.cos(1));
  move.onMessage(sender, { position: { x: 2 }, vector: { y: 3 }, angle: { x: 0, y: 1 } });
  assert.equal(lastMessage(peer).type, "player_moved");
  move.onMessage(sender, { angle: "bad" });
  assert.equal(lastMessage(peer).type, "player_moved");
  move.onMessage(sender, { position: { x: 8 } });
  assert.equal(player.vector.y, 3);

  new LaunchCharacterHandler().onMessage(sender, {});
  assert.match(lastMessage(sender).message, /velocity/);
  new LaunchCharacterHandler().onMessage(sender, { velocity: { X: 1, y: 2 } });
  assert.equal(lastMessage(peer).type, "launch character");
  assert.equal(lastMessage(peer).targetId, "arena");

  new DealDamageHandler().onMessage(sender, {});
  assert.match(lastMessage(sender).message, /amount/);
  new DealDamageHandler().onMessage(sender, { amount: 1 });
  assert.match(lastMessage(sender).message, /targetId/);
  new DealDamageHandler().onMessage(sender, { amount: 1, targetId: "missing" });
  assert.match(lastMessage(sender).message, /Target player/);
  new DealDamageHandler().onMessage(sender, { amount: 1.5, targetId: "target" });
  assert.equal(lastMessage(peer).type, "damage dealt");

  new UpdateHealthHandler().onMessage(sender, {});
  assert.match(lastMessage(sender).message, /newHealth/);
  new UpdateHealthHandler().onMessage(sender, { newHealth: 3 });
  assert.match(lastMessage(sender).message, /targetId/);
  new UpdateHealthHandler().onMessage(sender, { newHealth: 3, targetId: "missing" });
  assert.match(lastMessage(sender).message, /Target player/);
  new UpdateHealthHandler().onMessage(sender, { newHealth: 3, targetId: "target" });
  assert.equal(lastMessage(peer).type, "health updated");

  new UpdatePointsHandler().onMessage(sender, {});
  assert.match(lastMessage(sender).message, /integer/);
  new UpdatePointsHandler().onMessage(sender, { points: 4 });
  assert.equal(lastMessage(peer).type, "update points");
  assert.equal(other.sent.length, 0);
});

test("player action handlers validate, normalize, and broadcast all action types", () => {
  const sender = socket();
  const peer = socket();
  const player = joinedPlayer("actor", "m", 4, { socket: sender });
  joinedPlayer("peer", "m", 5, { socket: peer });
  const unregistered = socket();

  const cases = [
    [new actionHandlers.InvincibleHandler(), { shielded: "yes" }, { shielded: true }, true],
    [new actionHandlers.AttackHandler(), { pressed: 1 }, { pressed: false }, true],
    [new actionHandlers.HoverboardHandler(), {}, {}, false],
    [new actionHandlers.JumpHandler(), {}, {}, false],
    [new actionHandlers.StopJumpingHandler(), {}, {}, false],
    [new actionHandlers.WalkHandler(), {}, { walking: 0, location: { X: 1, y: 2 }, facing: { x: 0, y: 1 } }, true],
    [new actionHandlers.WalkRightHandler(), {}, { walking: 1, position: { x: 3, y: 4 }, angle: { x: 1, y: 0 } }, true],
    [new actionHandlers.DodgeHandler(), {}, { direction: { x: 0, y: 1 } }, false],
    [new actionHandlers.StunnedHandler(), { stunType: "  " }, { stunType: "ice", appliedByPlayerId: "peer" }, true],
    [new actionHandlers.UpdateDirectionHandler(), {}, { angle: { x: -1, y: 0 } }, true],
  ];

  for (const [handler, invalid, valid, expectsError] of cases) {
    handler.onMessage(unregistered, valid);
    assert.equal(lastMessage(unregistered).message, "Player not found");
    const prior = peer.sent.length;
    handler.onMessage(sender, invalid);
    if (expectsError) {
      assert.equal(lastMessage(sender).type, "error");
      assert.equal(peer.sent.length, prior);
    } else {
      assert.equal(peer.sent.length, prior + 1);
    }
    const beforeValid = peer.sent.length;
    handler.onMessage(sender, valid);
    assert.equal(peer.sent.length, beforeValid + 1);
  }

  const walk = new actionHandlers.WalkHandler();
  walk.onMessage(sender, { walking: 2, location: { x: 1, y: 2 }, facing: { x: 1, y: 0 } });
  assert.equal(lastMessage(sender).type, "error");
  walk.onMessage(sender, { walking: 0, location: {}, facing: {} });
  assert.equal(lastMessage(sender).type, "error");
  walk.onMessage(sender, { walking: 0, location: { x: 1, y: 2 }, facing: {} });
  assert.equal(lastMessage(sender).type, "error");
  new actionHandlers.WalkRightHandler().onMessage(sender, {
    walking: 0, location: { x: 1, y: 2 }, direction: { x: 0, y: 1 },
  });
  assert.equal(lastMessage(peer).type, "walkRight");
  new actionHandlers.DodgeHandler().onMessage(sender, {});
  assert.deepEqual(lastMessage(peer).direction, player.angle);

  const stunned = new actionHandlers.StunnedHandler();
  stunned.onMessage(sender, { stunType: "ice", appliedByPlayerId: "missing" });
  assert.equal(lastMessage(peer).appliedByPlayerId, undefined);
  stunned.onMessage(sender, { stunType: "ice", appliedByPlayerId: 123 });
  assert.equal(lastMessage(peer).appliedByPlayerId, undefined);
  const direction = new actionHandlers.UpdateDirectionHandler();
  direction.onMessage(sender, {});
  assert.equal(lastMessage(sender).type, "error");
  direction.onMessage(sender, { angle: {} });
  assert.equal(lastMessage(sender).type, "error");
  direction.onMessage(sender, { direction: { x: 0, y: -1 } });
  assert.equal(player.angle.x, 0);
});

test("ability handlers reject incomplete vectors and accept normalized payloads", () => {
  const sender = socket();
  const peer = socket();
  joinedPlayer("caster", "m", 1, { socket: sender });
  joinedPlayer("listener", "m", 2, { socket: peer });
  const unregistered = socket();

  const rows = [
    [new abilityHandlers.SeehnDiskHandler(), {}, { position: { X: 1, y: 2 }, angle: { x: 0, y: 1 } }, "seehn disk"],
    [new abilityHandlers.SpecialHandler(), {}, { position: { x: 2, y: 3 } }, "special"],
    [new abilityHandlers.SuperSpecialHandler(), {}, { position: { x: 2, y: 3 }, angle: { x: 1, y: 0 } }, "super special"],
    [new abilityHandlers.SeehnDisksReadyHandler(), {}, {}, "seehn disks ready"],
    [new abilityHandlers.SpecialReadyHandler(), {}, {}, "special ready"],
    [new abilityHandlers.SuperSpecialReadyHandler(), {}, {}, "super special ready"],
  ];
  for (const [handler, invalid, valid, type] of rows) {
    const before = peer.sent.length;
    handler.onMessage(unregistered, valid);
    assert.equal(lastMessage(unregistered).message, "Player not found");
    handler.onMessage(sender, invalid);
    if (type.includes("ready")) assert.equal(peer.sent.length, before + 1);
    else assert.equal(lastMessage(sender).type, "error");
    handler.onMessage(sender, valid);
    assert.equal(lastMessage(peer).type, type);
  }
});

test("rank handler validates and reports storage success or failure", async () => {
  const rankService = rankServiceForHandler;
  const originalUpdate = rankService.updateRank;
  const transport = socket();
  const handler = new UpdateRankHandler();
  try {
    for (const invalid of [
      {}, { xp: -1, id: 1, username: "A" }, { xp: 1.5, id: 1, username: "A" },
      { xp: 1, id: 0, username: "A" }, { xp: 1, id: 1.2, username: "A" },
      { xp: 1, id: 1, username: " " },
    ]) {
      await handler.onMessage(transport, invalid);
      assert.equal(lastMessage(transport).type, "error");
    }
    rankService.updateRank = async ({ id }) => ({ rank: id });
    await handler.onMessage(transport, { xp: 3, id: 2, username: " Ada " });
    assert.deepEqual(lastMessage(transport), { type: "update-rank", position: 2 });
    rankService.updateRank = async () => { throw new Error("storage down"); };
    await handler.onMessage(transport, { xp: 3, id: 2, username: "Ada" });
    assert.equal(lastMessage(transport).message, "Rank update failed");
  } finally {
    rankService.updateRank = originalUpdate;
  }
});

test("DefaultRoute registers Redweb handlers and removes disconnected players", async () => {
  const { DefaultRoute } = require("../DefaultRoute");
  const route = new DefaultRoute();
  assert.equal(route.path, "/socket");
  assert.equal(route.allowDuplicateConnections, true);
  assert.ok(route.handlers.length >= 30);
  assert.equal(registry.roomRegistry, route.rooms);
  assert.equal(route.rooms.options.maxRoomsPerConnection, 1);
  assert.equal(route.transportPolicy.maxConnections, 1000);
  assert.equal(route.transportPolicy.orderedMessages, true);
  const player = joinedPlayer("route-player", "route-match");
  route.connectionCloseCallback(player.socket);
  assert.equal(registry.getById(player.id), null);
  await route.shutdown();
});

test("MatchService starts at capacity, ends once, and cleans up listeners and timers", (t) => {
  const { MatchService } = require("../services/MatchService");
  const originalBroadcast = registry.broadcast;
  const originalMaxPlayers = registry.maxPlayers;
  const originalSetTimeout = global.setTimeout;
  const originalClearTimeout = global.clearTimeout;
  const messages = [];
  let callback;
  registry.broadcast = message => messages.push(message.type);
  global.setTimeout = fn => ({ unref() {}, stop: fn });
  global.clearTimeout = () => {};
  t.after(() => {
    registry.broadcast = originalBroadcast;
    registry.maxPlayers = originalMaxPlayers;
    global.setTimeout = originalSetTimeout;
    global.clearTimeout = originalClearTimeout;
  });

  registry.maxPlayers = 1;
  joinedPlayer("already", "m");
  const service = new MatchService();
  service.onInit({ name: "route" });
  assert.equal(service.active, true);
  assert.deepEqual(messages, ["match_started"]);
  service.startMatch();
  assert.deepEqual(messages, ["match_started"]);
  callback = service.timer.stop;
  callback();
  assert.equal(service.active, false);
  assert.deepEqual(messages, ["match_started", "match_over"]);
  service.endMatch();
  assert.equal(messages.length, 2);
  service.onShutdown();
  assert.equal(service.timer, null);
  assert.equal(service.maxPlayersReachedHandler, null);

  const eventService = new MatchService();
  registry.maxPlayers = Infinity;
  eventService.onInit({ name: "route" });
  registry.emit("maxPlayersReached");
  assert.equal(eventService.active, true);
  eventService.onShutdown();
});
