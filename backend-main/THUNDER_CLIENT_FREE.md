# Thunder Client (Free) - Manual Testing Guide

## HTTP Endpoints

### 1. Health Check
```
Method: GET
URL: http://localhost:3000/health
```

**Expected Response:**
```json
{
  "status": "ok",
  "phase": "idle",
  "currentRound": 0,
  "activeTeamsCount": 0,
  "remainingMs": 0,
  "uptimeMs": 12345
}
```

---

### 2. Get Public State
```
Method: GET
URL: http://localhost:3000/state
```

**Expected Response:**
```json
{
  "phase": "idle",
  "round": 0,
  "totalRounds": 30,
  "currentSignal": null,
  "endsAt": null,
  "remainingMs": 0,
  "activeTeamsCount": 0,
  "leaderboard": [],
  "teamSubmissions": []
}
```

---

## WebSocket Testing

Thunder Client free doesn't support WebSocket collections well. Use these alternatives:

### Option A: Online WebSocket Client
Visit: `https://pieSocket.com/websocket-tester`

**Connection URL:**
```
ws://localhost:3000
```

### Option B: Browser Console (Recommended)
Open browser DevTools Console (F12) on any page:

```javascript
// Connect
const socket = io('http://localhost:3000');

// Listen for events
socket.on('game:snapshot', (data) => console.log('Snapshot:', data));
socket.on('round:started', (data) => console.log('Round started:', data));
socket.on('round:results', (data) => console.log('Results:', data));
socket.on('game:error', (data) => console.error('Error:', data));

// Admin authenticate
socket.emit('admin:authenticate', { secret: 'auction-admin-2025-secure-key-do-not-share' }, (response) => {
  console.log('Auth response:', response);
});

// Start game
socket.emit('admin:start-game', {}, (response) => {
  console.log('Start game:', response);
});

// Join as team
socket.emit('team:join', { teamId: 'team-1', name: 'Team Alpha' }, (response) => {
  console.log('Joined:', response);
});

// Submit decision
socket.emit('team:submit', { decision: 'TRADE' }, (response) => {
  console.log('Submitted:', response);
});
```

---

## WebSocket Events Reference

### Client → Server (with acknowledgment)

| Event | Payload | Description |
|-------|---------|-------------|
| `admin:authenticate` | `{ "secret": "..." }` | Auth as admin |
| `admin:start-game` | `{}` | Start game |
| `admin:next-round` | `{}` | Next round |
| `admin:pause-round` | `{}` | Pause round |
| `admin:resume-round` | `{}` | Resume round |
| `admin:reset-game` | `{}` | Reset game |
| `admin:set-score` | `{ "teamId": "...", "score": 100 }` | Override score |
| `admin:get-audit-log` | `{}` | Get audit log |
| `team:join` | `{ "teamId": "...", "name": "..." }` | Join as team |
| `team:submit` | `{ "decision": "TRADE" }` | Submit (TRADE/IGNORE) |

### Server → Client

| Event | Description |
|-------|-------------|
| `game:snapshot` | Full game state |
| `round:started` | Round began |
| `round:results` | Round ended with results |
| `round:paused` | Round paused |
| `round:resumed` | Round resumed |
| `round:submission-status` | Submission confirmation |
| `game:error` | Error notification |

---

## Complete Test Flow

### Step 1: Open 3 tabs/consoles
- Tab 1: Admin
- Tab 2: Team A
- Tab 3: Team B

### Step 2: Admin actions (Tab 1)
```javascript
const admin = io('http://localhost:3000');
admin.on('game:snapshot', (d) => console.log('Admin snapshot:', d));
admin.emit('admin:authenticate', { secret: 'auction-admin-2025-secure-key-do-not-share' }, console.log);
// Wait for auth success, then:
admin.emit('admin:start-game', {}, console.log);
```

### Step 3: Teams join (Tabs 2 & 3)
```javascript
const team = io('http://localhost:3000');
team.on('game:snapshot', (d) => console.log('Team snapshot:', d));
team.on('round:started', (d) => console.log('Round:', d));
team.emit('team:join', { teamId: 'team-1', name: 'Alpha' }, console.log);
// Wait for game start, then:
team.emit('team:submit', { decision: 'TRADE' }, console.log);
```

### Step 4: Admin advances round
```javascript
admin.emit('admin:next-round', {}, console.log);
```

---

## cURL Alternative

For HTTP endpoints only:

```bash
# Health
curl http://localhost:3000/health

# State
curl http://localhost:3000/state
```

---

## VS Code Extension

Install **"WebSocket Client"** extension for testing:
1. Press F1 → "WebSocket Client: Connect"
2. Enter: `ws://localhost:3000`
3. Send messages as JSON
