class RoundOrchestrator {
  constructor(options) {
    this.gameService = options.gameService;
    this.intervalMs = options.intervalMs;
    this.logger = options.logger;
    this.onResults = options.onResults;
    this.pollTimer = null;
    this.running = false;
    this.stopped = false;
  }

  start() {
    if (this.pollTimer) {
      return;
    }

    this.pollTimer = setInterval(() => {
      void this.tick();
    }, this.intervalMs);

    this.pollTimer.unref?.();
  }

  async tick() {
    if (this.running || this.stopped) {
      return;
    }

    this.running = true;

    try {
      const results = await this.gameService.resolveRoundIfDue();
      if (results && typeof this.onResults === "function") {
        await this.onResults(results);
      }
    } catch (error) {
      this.logger.error({ error }, "round orchestrator tick failed");
    } finally {
      this.running = false;
    }
  }

  async stop() {
    this.stopped = true;
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
  }
}

module.exports = { RoundOrchestrator };
