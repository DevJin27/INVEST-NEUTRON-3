const request = require("supertest");
const { io: createClient } = require("socket.io-client");

const { createRealtimeGameServer } = require("../src/server");
const defaultDeck = require("../src/data/signals.json");

function createSilentLogger() {
  return {
    error() {},
    info() {},
    log() {},
    warn() {},
  };
}

async function createTestServer(envOverrides = {}) {
  const realtimeServer = createRealtimeGameServer({
    deck: defaultDeck,
    env: {
      ADMIN_SECRET: "top-secret",
      CORS_ORIGINS: "*",
      PORT: "0",
      ROUND_DURATION_MS: "120",
      TOTAL_ROUNDS: "3",
      ...envOverrides,
    },
    logger: createSilentLogger(),
  });

  await realtimeServer.start();

  return {
    http: request(realtimeServer.app),
    port: realtimeServer.server.address().port,
    realtimeServer,
  };
}

function connectClient(port) {
  const socket = createClient(`ws://127.0.0.1:${port}`, {
    forceNew: true,
    reconnection: false,
    transports: ["websocket"],
  });

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error("Socket connection timed out."));
    }, 1000);

    socket.once("connect", () => {
      clearTimeout(timeout);
      resolve(socket);
    });

    socket.once("connect_error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
  });
}

function emitWithAck(socket, event, payload = {}) {
  return new Promise((resolve, reject) => {
    socket.timeout(1000).emit(event, payload, (error, response) => {
      if (error) {
        reject(error);
        return;
      }

      resolve(response);
    });
  });
}

function waitForEvent(socket, event, predicate = () => true, timeoutMs = 1000) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      socket.off(event, onEvent);
      reject(new Error(`Timed out waiting for '${event}'.`));
    }, timeoutMs);

    const onEvent = (payload) => {
      if (!predicate(payload)) {
        return;
      }

      clearTimeout(timeout);
      socket.off(event, onEvent);
      resolve(payload);
    };

    socket.on(event, onEvent);
  });
}

async function closeSocket(socket) {
  if (!socket) {
    return;
  }

  await new Promise((resolve) => {
    if (!socket.connected) {
      resolve();
      return;
    }

    socket.once("disconnect", () => resolve());
    socket.disconnect();
  });
}

module.exports = {
  closeSocket,
  connectClient,
  createTestServer,
  emitWithAck,
  waitForEvent,
};
