const {
  closeSocket,
  connectClient,
  createTestServer,
  emitWithAck,
  waitForEvent,
} = require("./helpers");

const openSockets = [];
const openServers = [];

async function registerServer(envOverrides) {
  const serverBundle = await createTestServer(envOverrides);
  openServers.push(serverBundle.realtimeServer);
  return serverBundle;
}

async function registerSocket(port) {
  const socket = await connectClient(port);
  openSockets.push(socket);
  return socket;
}

async function waitForAdminRateLimitWindow() {
  await new Promise((resolve) => setTimeout(resolve, 550));
}

afterEach(async () => {
  while (openSockets.length > 0) {
    const socket = openSockets.pop();
    await closeSocket(socket);
  }

  while (openServers.length > 0) {
    const realtimeServer = openServers.pop();
    await realtimeServer.shutdown("TEST_CLEANUP");
  }
});

describe("HTTP and socket integration", () => {
  it("allows the configured production origin on HTTP routes and normalizes trailing slashes", async () => {
    const { http } = await registerServer({
      CORS_ORIGINS: "https://invest-neutron-3.vercel.app/",
    });

    const response = await http
      .get("/health")
      .set("Origin", "https://invest-neutron-3.vercel.app")
      .expect(200);

    expect(response.headers["access-control-allow-origin"]).toBe(
      "https://invest-neutron-3.vercel.app"
    );
  });

  it("does not turn disallowed HTTP origins into internal server errors", async () => {
    const { http } = await registerServer({
      CORS_ORIGINS: "https://invest-neutron-3.vercel.app",
    });

    const response = await http
      .get("/health")
      .set("Origin", "https://not-allowed.example.com")
      .expect(200);

    expect(response.headers["access-control-allow-origin"]).toBeUndefined();
    expect(response.body.status).toBe("ok");
  });

  it("returns a clear forbidden error for disallowed socket origins", async () => {
    const { port } = await registerServer({
      CORS_ORIGINS: "https://invest-neutron-3.vercel.app",
    });

    const response = await fetch(
      `http://127.0.0.1:${port}/socket.io/?EIO=4&transport=polling&t=forbidden-origin`,
      {
        headers: {
          Origin: "https://not-allowed.example.com",
        },
      }
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      code: 4,
      message: "Origin not allowed.",
    });
  });

  it("allows socket polling handshakes from the configured production origin", async () => {
    const { port } = await registerServer({
      CORS_ORIGINS: "https://invest-neutron-3.vercel.app/",
    });

    const response = await fetch(
      `http://127.0.0.1:${port}/socket.io/?EIO=4&transport=polling&t=allowed-origin`,
      {
        headers: {
          Origin: "https://invest-neutron-3.vercel.app",
        },
      }
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("access-control-allow-origin")).toBe(
      "https://invest-neutron-3.vercel.app"
    );
    await expect(response.text()).resolves.toContain('"sid"');
  });

  it("reports health with active teams and current phase", async () => {
    const { http, port } = await registerServer();
    const teamSocket = await registerSocket(port);

    const joinResponse = await emitWithAck(teamSocket, "team:join", {
      name: "Red",
      teamId: "red",
    });
    expect(joinResponse.ok).toBe(true);

    const response = await http.get("/health").expect(200);

    expect(response.body.status).toBe("ok");
    expect(response.body.phase).toBe("idle");
    expect(response.body.activeTeamsCount).toBe(1);
    expect(response.body.currentRound).toBe(0);
    expect(response.body.roundDurationMs).toBe(120);
    expect(typeof response.body.uptimeMs).toBe("number");
  });

  it("rejects duplicate submissions and hydrates reconnect snapshots with submission state", async () => {
    const { port } = await registerServer({ ROUND_DURATION_MS: "300" });
    const adminSocket = await registerSocket(port);
    const teamSocket = await registerSocket(port);

    const adminAuth = await emitWithAck(adminSocket, "admin:authenticate", { secret: "top-secret" });
    expect(adminAuth.ok).toBe(true);

    const teamJoin = await emitWithAck(teamSocket, "team:join", {
      name: "Blue",
      teamId: "blue",
    });
    expect(teamJoin.ok).toBe(true);

    const startResponse = await emitWithAck(adminSocket, "admin:start-game");
    expect(startResponse.ok).toBe(true);

    const investResponse = await emitWithAck(teamSocket, "team:invest", { amount: 5000, companyId: "reliance" });
    expect(investResponse.ok).toBe(true);

    const submitResponse = await emitWithAck(teamSocket, "team:submit");
    expect(submitResponse.ok).toBe(true);

    const duplicateResponse = await emitWithAck(teamSocket, "team:submit");
    expect(duplicateResponse.ok).toBe(false);
    expect(duplicateResponse.error.code).toBe("ALREADY_SUBMITTED");

    const replacementSocket = await registerSocket(port);
    const replacedMessage = waitForEvent(
      teamSocket,
      "game:error",
      (payload) => payload.code === "FORBIDDEN"
    );

    const replacementJoin = await emitWithAck(replacementSocket, "team:join", {
      name: "Blue",
      teamId: "blue",
    });
    expect(replacementJoin.ok).toBe(true);

    const replacementSnapshot = await waitForEvent(
      replacementSocket,
      "game:snapshot",
      (payload) =>
        payload.viewerSubmission &&
        payload.viewerSubmission.teamId === "blue" &&
        payload.viewerSubmission.hasSubmitted === true
    );

    expect(replacementSnapshot.viewerSubmission).toEqual({
      canSubmit: false,
      hasSubmitted: true,
      investments: {
        adani: 0,
        byjus: 0,
        hdfc_bank: 0,
        infosys: 0,
        reliance: 5000,
        yes_bank: 0,
      },
      teamId: "blue",
    });

    const forcedOff = await replacedMessage;
    expect(forcedOff.details.teamId).toBe("blue");
  });

  it("enforces admin rate limits and the 12-team cap", async () => {
    const { port } = await registerServer();
    const adminSocket = await registerSocket(port);

    const adminAuth = await emitWithAck(adminSocket, "admin:authenticate", { secret: "top-secret" });
    expect(adminAuth.ok).toBe(true);

    const firstAuditRead = await emitWithAck(adminSocket, "admin:get-audit-log");
    expect(firstAuditRead.ok).toBe(true);

    const rateLimited = await emitWithAck(adminSocket, "admin:get-audit-log");
    expect(rateLimited.ok).toBe(false);
    expect(rateLimited.error.code).toBe("ADMIN_RATE_LIMITED");

    const teamSockets = [];
    for (let index = 0; index < 12; index += 1) {
      const socket = await registerSocket(port);
      teamSockets.push(socket);
      const response = await emitWithAck(socket, "team:join", {
        name: `Team ${index + 1}`,
        teamId: `team-${index + 1}`,
      });
      expect(response.ok).toBe(true);
    }

    const overflowSocket = await registerSocket(port);
    const overflowResponse = await emitWithAck(overflowSocket, "team:join", {
      name: "Overflow",
      teamId: "team-13",
    });

    expect(overflowResponse.ok).toBe(false);
    expect(overflowResponse.error.code).toBe("TEAM_LIMIT_REACHED");
    expect(teamSockets).toHaveLength(12);
  });

  it("allows admins to set the round duration before the game starts", async () => {
    const { http, port } = await registerServer();
    const adminSocket = await registerSocket(port);

    const adminAuth = await emitWithAck(adminSocket, "admin:authenticate", { secret: "top-secret" });
    expect(adminAuth.ok).toBe(true);

    const updateResponse = await emitWithAck(adminSocket, "admin:set-round-duration", {
      roundDurationMs: 450,
    });
    expect(updateResponse).toEqual({
      ok: true,
      data: {
        roundDurationMs: 450,
      },
    });

    const healthResponse = await http.get("/health").expect(200);
    expect(healthResponse.body.roundDurationMs).toBe(450);

    await waitForAdminRateLimitWindow();
    const startResponse = await emitWithAck(adminSocket, "admin:start-game");
    expect(startResponse.ok).toBe(true);

    await waitForAdminRateLimitWindow();
    const liveUpdate = await emitWithAck(adminSocket, "admin:set-round-duration", {
      roundDurationMs: 900,
    });
    expect(liveUpdate.ok).toBe(false);
    expect(liveUpdate.error.code).toBe("INVALID_PHASE");
  });

  it("emits round results only once when an admin ends the round early", async () => {
    const { port } = await registerServer({ ROUND_DURATION_MS: "150" });
    const adminSocket = await registerSocket(port);
    const adminSocket2 = await registerSocket(port);
    const teamSocket = await registerSocket(port);

    const adminAuth = await emitWithAck(adminSocket, "admin:authenticate", { secret: "top-secret" });
    expect(adminAuth.ok).toBe(true);
    const adminAuth2 = await emitWithAck(adminSocket2, "admin:authenticate", { secret: "top-secret" });
    expect(adminAuth2.ok).toBe(true);

    const teamJoin = await emitWithAck(teamSocket, "team:join", {
      name: "Blue",
      teamId: "blue",
    });
    expect(teamJoin.ok).toBe(true);

    const resultEvents = [];
    adminSocket.on("round:results", (payload) => {
      resultEvents.push(payload);
    });

    const startResponse = await emitWithAck(adminSocket, "admin:start-game");
    expect(startResponse.ok).toBe(true);

    const endRoundResponse = await emitWithAck(adminSocket2, "admin:end-round");
    expect(endRoundResponse.ok).toBe(true);
    expect(endRoundResponse.data.ended).toBe(true);

    await new Promise((resolve) => setTimeout(resolve, 350));

    expect(resultEvents).toHaveLength(1);

    const lateSubmit = await emitWithAck(teamSocket, "team:submit");
    expect(lateSubmit.ok).toBe(false);
    expect(lateSubmit.error.code).toBe("ROUND_NOT_ACTIVE");
  });

  it("broadcasts SERVER_SHUTDOWN before closing sockets", async () => {
    const { port, realtimeServer } = await registerServer();
    const spectatorSocket = await registerSocket(port);

    const shutdownMessagePromise = waitForEvent(
      spectatorSocket,
      "game:error",
      (payload) => payload.code === "SERVER_SHUTDOWN"
    );

    await realtimeServer.shutdown("TEST_SHUTDOWN");
    const shutdownMessage = await shutdownMessagePromise;

    expect(shutdownMessage).toMatchObject({
      code: "SERVER_SHUTDOWN",
      message: "Server is shutting down.",
    });
  });
});
