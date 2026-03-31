const { serializeError } = require("./errors");
const { createRealtimeGameServer } = require("./server");

async function main() {
  const realtimeServer = createRealtimeGameServer();
  const { config } = realtimeServer;

  process.on("SIGINT", async () => {
    await realtimeServer.shutdown("SIGINT");
    process.exit(0);
  });

  process.on("SIGTERM", async () => {
    await realtimeServer.shutdown("SIGTERM");
    process.exit(0);
  });

  await realtimeServer.start();
  console.log(`Realtime game server listening on port ${config.port}`);
}

main().catch((error) => {
  const serialized = serializeError(error);
  console.error(serialized);
  process.exit(1);
});
