const { SocketRoute } = require("redweb");
const registry = require("./handlers/PlayerRegistry");
const { JoinHandler } = require("./handlers/JoinHandler");
const { CreateMatchHandler } = require("./handlers/CreateMatchHandler");
const { CreateDuelHandler } = require("./handlers/CreateDuelHandler");
const {
    DuelAcceptedHandler,
    DuelDeclinedHandler,
    DuelRecievedHandler,
} = require("./handlers/DuelResponseHandlers");
const { FindMatchesHandler } = require("./handlers/FindMatchesHandler");
const { ChatHandler, ReportChatHandler } = require("./handlers/ChatHandler");
const { UpdateRankHandler } = require("./handlers/RankHandler");
const { MoveHandler, LaunchCharacterHandler } = require("./handlers/MoveHandler");
const { MatchService } = require("./services/MatchService");
const { GetPlayersHandler } = require("./handlers/GetPlayersHandler");
const { ShootHandler } = require("./handlers/ShootHandler");
const {
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
} = require("./handlers/PlayerActionHandlers");
const {
    SeehnDiskHandler,
    SeehnDisksReadyHandler,
    SpecialHandler,
    SpecialReadyHandler,
    SuperSpecialHandler,
    SuperSpecialReadyHandler,
} = require("./handlers/AbilityHandlers");
const {
    DealDamageHandler,
    UpdateHealthHandler,
    UpdatePointsHandler,
} = require("./handlers/MatchEventHandlers");

class DefaultRoute extends SocketRoute {
    constructor() {
        super({
            "path": "/socket",
            "handlers": [
                JoinHandler,
                CreateMatchHandler,
                CreateDuelHandler,
                DuelRecievedHandler,
                DuelAcceptedHandler,
                DuelDeclinedHandler,
                FindMatchesHandler,
                UpdateRankHandler,
                ChatHandler,
                ReportChatHandler,
                MoveHandler,
                GetPlayersHandler,
                ShootHandler,
                AttackHandler,
                SeehnDiskHandler,
                SeehnDisksReadyHandler,
                DealDamageHandler,
                UpdateHealthHandler,
                LaunchCharacterHandler,
                SuperSpecialHandler,
                SuperSpecialReadyHandler,
                SpecialHandler,
                SpecialReadyHandler,
                HoverboardHandler,
                InvincibleHandler,
                DodgeHandler,
                StunnedHandler,
                UpdatePointsHandler,
                UpdateDirectionHandler,
                JumpHandler,
                StopJumpingHandler,
                WalkHandler,
                WalkRightHandler,
            ],
            allowDuplicateConnections: true,
            services: [MatchService]
        })

        this.connectionCloseCallback = (socket) => {
            registry.removeBySocket(socket, "disconnected");
        };
    }
}

module.exports = { DefaultRoute };
