const { SocketService } = require('redweb');
const registry = require('../handlers/PlayerRegistry')

class MatchService extends SocketService {
  constructor() {
    super('MatchService');
    this.active = false;
    this.duration = 30_000;
    this.timer = null;
    this.maxPlayersReachedHandler = null;
  }

  onInit(route) {
    super.onInit(route);

    // start when player cap hit
    this.maxPlayersReachedHandler = () => {
      if (!this.active) this.startMatch();
    };
    registry.on('maxPlayersReached', this.maxPlayersReachedHandler);

    // or start if there are already players on init with a finite cap
    if (registry.isAtCapacity()) {
      this.startMatch();
    }
  }

  onShutdown() {
    super.onShutdown();
    if (this.maxPlayersReachedHandler) {
      registry.off('maxPlayersReached', this.maxPlayersReachedHandler);
      this.maxPlayersReachedHandler = null;
    }
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.active = false;
  }

  startMatch() {
    if (this.active) return;
    this.active = true;
    registry.broadcast({ type: 'match_started' });

    this.timer = setTimeout(() => {
      this.timer = null;
      this.endMatch();
    }, this.duration);
    this.timer.unref?.();
  }

  endMatch() {
    if (!this.active) return;
    this.active = false;
    registry.broadcast({ type: 'match_over' });
  }
}

module.exports = { MatchService };
