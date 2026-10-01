const { SocketRoute } = require("redweb");
const registry = require("./handlers/PlayerRegistry");
const { withEnvelopeCompatibility } = require("./handlers/EnvelopeCompatibility");
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
                withEnvelopeCompatibility(JoinHandler),
                withEnvelopeCompatibility(CreateMatchHandler),
                withEnvelopeCompatibility(CreateDuelHandler),
                withEnvelopeCompatibility(DuelRecievedHandler),
                withEnvelopeCompatibility(DuelAcceptedHandler),
                withEnvelopeCompatibility(DuelDeclinedHandler),
                withEnvelopeCompatibility(FindMatchesHandler),
                withEnvelopeCompatibility(UpdateRankHandler),
                withEnvelopeCompatibility(ChatHandler),
                withEnvelopeCompatibility(ReportChatHandler),
                withEnvelopeCompatibility(MoveHandler),
                withEnvelopeCompatibility(GetPlayersHandler),
                withEnvelopeCompatibility(ShootHandler),
                withEnvelopeCompatibility(AttackHandler),
                withEnvelopeCompatibility(SeehnDiskHandler),
                withEnvelopeCompatibility(SeehnDisksReadyHandler),
                withEnvelopeCompatibility(DealDamageHandler),
                withEnvelopeCompatibility(UpdateHealthHandler),
                withEnvelopeCompatibility(LaunchCharacterHandler),
                withEnvelopeCompatibility(SuperSpecialHandler),
                withEnvelopeCompatibility(SuperSpecialReadyHandler),
                withEnvelopeCompatibility(SpecialHandler),
                withEnvelopeCompatibility(SpecialReadyHandler),
                withEnvelopeCompatibility(HoverboardHandler),
                withEnvelopeCompatibility(InvincibleHandler),
                withEnvelopeCompatibility(DodgeHandler),
                withEnvelopeCompatibility(StunnedHandler),
                withEnvelopeCompatibility(UpdatePointsHandler),
                withEnvelopeCompatibility(UpdateDirectionHandler),
                withEnvelopeCompatibility(JumpHandler),
                withEnvelopeCompatibility(StopJumpingHandler),
                withEnvelopeCompatibility(WalkHandler),
                withEnvelopeCompatibility(WalkRightHandler),
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
