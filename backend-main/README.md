# Real-Time Game Engine Backend

This service provides the in-memory game engine for the auction game. It uses Express for health/debug endpoints and Socket.io for low-latency gameplay events.

## Requirements

- Node.js 22+
- WebSocket-capable reverse proxy or load balancer
- A single running instance for MVP, because all state lives in memory

## Environment Variables

- `ADMIN_SECRET` required admin authentication secret
- `PORT` HTTP/WebSocket port, default `3000`
- `CORS_ORIGINS` comma-separated allowlist for browser clients, default `*`
- `ROUND_DURATION_MS` round countdown duration, default `10000`
- `TOTAL_ROUNDS` number of rounds to play, default `30`

## Deployment Notes

- Your proxy must allow WebSocket upgrade traffic end-to-end.
- Set `CORS_ORIGINS` to the exact frontend origins you want to allow in production.
- Socket.io is configured for WebSocket-only transport with upgrades disabled and compression turned off for lower latency.
- `GET /health` exposes status, uptime, current phase, round number, active team count, and remaining round time.
- `GET /state` exposes a sanitized in-memory snapshot for debugging and reconnect hydration.

## Install and Run

```bash
npm install
npm start
```

## Test

```bash
npm test
```
