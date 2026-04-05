# Auction Game Server - Deployment Guide

## Overview
Real-time auction game server using Express and Socket.io. Teams compete by making portfolio investments across multiple rounds based on historical narratives.

## Quick Start

```bash
# Install dependencies
npm install

# Development (uses .env)
npm run dev

# Production
npm start

# Run tests
npm test
```

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `PORT` | No | 3000 | Server port |
| `ADMIN_SECRET` | **Yes** | - | Admin authentication key |
| `CORS_ORIGINS` | No | * | Allowed CORS origins (comma-separated) |
| `ROUND_DURATION_MS` | No | 10000 | Round duration in milliseconds |
| `TOTAL_ROUNDS` | No | 6 | Total rounds per game |

## Render Deployment

### Option 1: Git-based Deployment (Recommended)

1. Push code to GitHub
2. Connect Render to your repo
3. Set environment variables in Render Dashboard
4. Deploy

### Option 2: Manual Configuration

Create `render.yaml` in repo root:

```yaml
services:
  - type: web
    name: auction-game-server
    runtime: node
    plan: starter
    buildCommand: npm install
    startCommand: npm start
    envVars:
      - key: ADMIN_SECRET
        generateValue: true
      - key: NODE_ENV
        value: production
      - key: CORS_ORIGINS
        value: https://your-frontend-domain.com
```

## API Reference

### HTTP Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/health` | Server health status |
| GET | `/state` | Current game state (public) |

### WebSocket Events

#### Client → Server (with acknowledgment)

| Event | Auth Required | Description |
|-------|--------------|-------------|
| `admin:authenticate` | No | Authenticate as admin |
| `admin:start-game` | Yes | Start game |
| `admin:next-round` | Yes | Next round |
| `admin:pause-round` | Yes | Pause round |
| `admin:resume-round` | Yes | Resume round |
| `admin:reset-game` | Yes | Reset game |
| `admin:set-purse-value` | Yes | Override team purse value |
| `admin:get-audit-log` | Yes | Get audit log (rate limited) |
| `team:join` | No | Join as team |
| `team:invest` | No | Invest in a company |
| `team:withdraw` | No | Withdraw from a company |
| `team:submit` | No | Submit portfolio investments |

#### Server → Client

| Event | Description |
|-------|-------------|
| `game:snapshot` | Full game state |
| `round:started` | Round began |
| `round:results` | Round ended with results |
| `round:paused` | Round paused |
| `round:resumed` | Round resumed |
| `round:submission-status` | Submission confirmation |
| `investment:updated` | Investment update confirmation |
| `game:error` | Error notification |

## Game Rules

1. **Rounds**: 6 rounds depicting historical market events.
2. **Teams**: Maximum 12 teams
3. **Decisions**: Invest or withdraw capital across 6 companies per round.
4. **Scoring**:
   - Returns are calculated based on actual historical performance.
   - Proceeds return to the team's purse after each round.
   - Total Value = Purse + Sum of all current investments.

## Security Notes

- Change `ADMIN_SECRET` before production deployment
- Use HTTPS in production
- Configure `CORS_ORIGINS` to match your frontend domain
- Admin actions are rate-limited (500ms between actions)

## Testing

Use the provided Thunder Client collection (`thunder-collection.json`) to test all endpoints.

Or use curl/WebSocket client:

```bash
# Health check
curl http://localhost:3000/health

# Get state
curl http://localhost:3000/state
```
