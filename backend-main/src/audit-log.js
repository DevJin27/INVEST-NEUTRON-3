const { AUDIT_LOG_LIMIT } = require("./constants");

class AuditLog {
  constructor(limit = AUDIT_LOG_LIMIT, logger = console) {
    this.limit = limit;
    this.logger = logger;
    this.entries = [];
  }

  add(entry) {
    this.entries.push(entry);

    if (this.entries.length > this.limit) {
      this.entries.shift();
    }

    this.logger.info?.(`[audit] ${JSON.stringify(entry)}`);
    return entry;
  }

  list() {
    return [...this.entries];
  }
}

module.exports = {
  AuditLog,
};
