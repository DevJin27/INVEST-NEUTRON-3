const { createError } = require("../core/errors");

class MemoryStateStore {
  constructor() {
    this.state = null;
    this.tail = Promise.resolve();
  }

  async connect() {}

  async disconnect() {}

  async initialize(initialState) {
    if (this.state === null) {
      this.state = initialState;
    }
  }

  async getState() {
    return this.state;
  }

  async setState(state) {
    this.state = state;
    return state;
  }

  async withLock(handler) {
    const previous = this.tail;
    let release;
    this.tail = new Promise((resolve) => {
      release = resolve;
    });

    await previous;

    try {
      return await handler();
    } catch (error) {
      throw error instanceof Error ? error : createError("INTERNAL_ERROR");
    } finally {
      release();
    }
  }

  hasRedisAdapterClients() {
    return false;
  }

  getRedisAdapterClients() {
    return null;
  }
}

module.exports = { MemoryStateStore };
