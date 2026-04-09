const pino = require("pino");

function createLogger(baseLogger) {
  if (baseLogger) {
    return baseLogger;
  }

  return pino({
    level: process.env.LOG_LEVEL || "info",
    name: "auction-backend",
  });
}

module.exports = { createLogger };
