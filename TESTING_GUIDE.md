# Testing Guide - Market Masters Purse System

## Quick Start Testing

### 1. Start the Backend Server

```bash
cd /Users/Personal/Desktop/auction/backend-main
npm start
```

Server runs on `http://localhost:3000`

### 2. Start the Frontend (New Terminal)

```bash
cd /Users/Personal/Desktop/auction/frontend
npm run dev
```

Frontend runs on `http://localhost:5173`

---

## Backend Testing with Browser Console

### Step 1: Open Browser DevTools
1. Open Chrome/Firefox
2. Go to `http://localhost:5173` (frontend URL)
3. Open DevTools (F12) → Console tab

### Step 2: Connect Socket and Join Team

```javascript
// Connect to server
const socket = io('ws://localhost:3000', { transports: ['websocket'] });

// Listen for events
socket.on('connect', () => console.log('✅ Connected'));
socket.on('game:snapshot', (s) => console.log('📊 Snapshot:', s));
socket.on('investment:updated', (u) => console.log('💰 Investment update:', u));
socket.on('round:submission-status', (s) => console.log('📝 Submission:', s));
socket.on('round:results', (r) => console.log('🎯 Round results:', r));
socket.on('game:error', (e) => console.error('❌ Error:', e));

// Join as a team
socket.emit('team:join', { teamId: 'team-alpha', name: 'Alpha Traders' }, (response) => {
  console.log('Join response:', response);
});
```

### Step 3: Test Invest

```javascript
// Invest 10,000 in Reliance
socket.emit('team:invest', { companyId: 'reliance', amount: 10000 }, (response) => {
  console.log('Invest response:', response);
});

// Invest 20,000 in HDFC Bank
socket.emit('team:invest', { companyId: 'hdfc_bank', amount: 20000 }, (response) => {
  console.log('Invest response:', response);
});
```

### Step 4: Test Withdraw

```javascript
// Withdraw 5,000 from Reliance
socket.emit('team:withdraw', { companyId: 'reliance', amount: 5000 }, (response) => {
  console.log('Withdraw response:', response);
});
```

### Step 5: Test Submit

```javascript
// Submit current investments for the round
socket.emit('team:submit', {}, (response) => {
  console.log('Submit response:', response);
});
```

### Admin Operations (Game Control)

```javascript
// Authenticate as admin
socket.emit('admin:authenticate', { secret: 'auction-admin-2025-secure-key-do-not-share' }, (response) => {
  console.log('Admin auth:', response);
});

// Start game
socket.emit('admin:start-game', {}, (response) => {
  console.log('Game started:', response);
});

// Set purse value for a team
socket.emit('admin:set-purse-value', { teamId: 'team-alpha', value: 200000 }, (response) => {
  console.log('Purse set:', response);
});
```

---

## Frontend Testing Checklist

### Join Screen
1. ✅ Open `http://localhost:5173`
2. ✅ Enter Team ID: `team-1`
3. ✅ Enter Team Name: `Test Team`
4. ✅ Click "Enter the Market"
5. ✅ Should see dashboard with ₹1,00,000 purse

### Purse Display
1. ✅ Verify purse shows ₹1,00,000
2. ✅ Verify "Invested" shows ₹0
3. ✅ Verify "Total Value" shows ₹1,00,000
4. ✅ Verify green bar shows 100% cash

### Investment Flow
1. ✅ Click "+₹10K" on Reliance card
2. ✅ Purse decreases by ₹10,000
3. ✅ Invested amount on Reliance card shows ₹10,000
4. ✅ Click "+₹25K" on HDFC Bank
5. ✅ Verify amounts update correctly

### Withdraw Flow
1. ✅ Click "Withdraw All" on Reliance card
2. ✅ Full amount returns to purse
3. ✅ Reliance investment shows ₹0

### Custom Invest
1. ✅ Type "5000" in custom input
2. ✅ Click "Invest" button
3. ✅ Amount invested correctly

### Submit Flow
1. ✅ Make some investments
2. ✅ Click "Lock Investments" button
3. ✅ Should show "✓ Investments locked" message
4. ✅ All invest/withdraw buttons disabled

### Round Results
1. ✅ Wait for admin to end round (or use admin console)
2. ✅ Results overlay should appear automatically
3. ✅ Shows market performance per company
4. ✅ Shows your returns
5. ✅ Shows new purse balance
6. ✅ Click "Continue" to dismiss

### Leaderboard
1. ✅ Verify your team shows with correct total value
2. ✅ Verify "me" highlighting on your row
3. ✅ Verify cash + invested breakdown shown

---

## API Endpoint Testing (HTTP)

### Health Check
```bash
curl http://localhost:3000/health
```

### Get Game State
```bash
curl http://localhost:3000/state
```

---

## Full Game Flow Test Script

```javascript
// Complete test flow - copy/paste into browser console

const socket = io('ws://localhost:3000', { transports: ['websocket'] });

// Track state
let myTeam = null;
let currentRound = null;

// Event listeners
socket.on('connect', () => console.log('1. ✅ Connected to server'));

socket.on('game:snapshot', (snapshot) => {
  console.log('📊 Snapshot received - Phase:', snapshot.phase);
  if (snapshot.viewerSubmission?.teamId) {
    myTeam = snapshot.leaderboard.find(t => t.teamId === snapshot.viewerSubmission.teamId);
    console.log('2. ✅ Team data:', { purse: myTeam?.purse, investments: myTeam?.investments });
  }
  if (snapshot.currentRound) {
    currentRound = snapshot.currentRound;
    console.log('3. ✅ Round active:', snapshot.currentRound.year);
  }
});

socket.on('investment:updated', (update) => {
  console.log('4. ✅ Investment updated:', update);
});

socket.on('round:submission-status', (status) => {
  console.log('5. ✅ Submission status:', status.accepted ? 'ACCEPTED' : 'REJECTED');
});

socket.on('round:results', (results) => {
  const myOutcome = results.teamOutcomes.find(o => o.teamId === myTeam?.teamId);
  console.log('6. ✅ Round results:', {
    returns: myOutcome?.returns,
    newPurse: myOutcome?.purse,
    percentReturn: myOutcome?.percentReturn
  });
});

// Execute test flow
setTimeout(() => {
  // Join
  socket.emit('team:join', { teamId: 'test-team', name: 'Testers' }, (res) => {
    console.log('Join result:', res.ok ? '✅ Success' : '❌ Failed');
  });
}, 500);

setTimeout(() => {
  // Test invest
  socket.emit('team:invest', { companyId: 'reliance', amount: 25000 }, (res) => {
    console.log('Invest 25k:', res.ok ? '✅ Success' : '❌ Failed');
  });
}, 1000);

setTimeout(() => {
  // Test withdraw partial
  socket.emit('team:withdraw', { companyId: 'reliance', amount: 10000 }, (res) => {
    console.log('Withdraw 10k:', res.ok ? '✅ Success' : '❌ Failed');
  });
}, 1500);

setTimeout(() => {
  // Submit
  socket.emit('team:submit', {}, (res) => {
    console.log('Submit:', res.ok ? '✅ Success' : '❌ Failed');
  });
}, 2000);

console.log('🧪 Test flow initiated - watch console for results...');
```

---

## Expected Behavior

### Invest Rules
- Can only invest during live rounds
- Cannot invest more than available purse
- Must invest positive amount (minimum effectively ₹1)

### Withdraw Rules  
- Can only withdraw during live rounds
- Cannot withdraw more than invested in that company
- Withdraw returns money to purse immediately

### Submit Rules
- Can only submit during live rounds
- Must have at least some investment (can't submit with ₹0 invested)
- Once submitted, investments are locked for the round
- Returns calculated at round end go back to purse

### Purse Calculation
- Starting purse: ₹1,00,000
- Total Value = Purse + Sum of all investments
- Returns from round add to purse (not to investments)
- Investments carry over to next round

---

## Troubleshooting

### "Cannot invest during this phase"
- Game must be in 'live' phase
- Admin needs to start the game: `admin:start-game`

### "Insufficient funds"
- Check your purse amount
- Ensure invest amount ≤ available purse

### "Insufficient investment to withdraw"
- Can't withdraw more than you have invested in that company
- Check your current investment in that company

### "Already submitted"
- Can only submit once per round
- Wait for next round to invest again

### Socket not connecting
- Verify backend is running on port 3000
- Check CORS origins in backend `.env`
- Check browser console for connection errors
