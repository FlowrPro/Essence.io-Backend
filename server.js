/**
 * Minimal robust WebSocket game server for Essence.io
 * - Safe message parsing (handles string, Buffer, ArrayBuffer)
 * - Sends an 'init' packet on connect
 * - Handles 'join', 'input', 'ping' messages
 * - Simple game loop that broadcasts a worldSnapshot periodically
 *
 * NOTE: This is a standalone replacement/skeleton that you can adapt to your existing server.
 *       It deliberately avoids calling `.substring` on raw frames and logs helpful diagnostics.
 */

const http = require('http');
const WebSocket = require('ws');

const PORT = process.env.PORT || 8080;
const TICK_RATE = 20; // server updates per second for world snapshots
const WORLD_SIZE = { width: 4000, height: 4000 };
const INTERPOLATION_DELAY = 100; // ms, example config sent to client

// Simple in-memory state (replace with DB or richer game state as needed)
const clients = new Map();   // clientId -> { ws, player }
const players = new Map();   // clientId -> playerState

// Utility: generate a short client id
function makeClientId() {
  return Math.random().toString(36).slice(2, 10);
}

// Safe conversion of raw WebSocket message to string
function rawToString(rawData) {
  if (typeof rawData === 'string') return rawData;
  // WebSocket may pass Buffer or ArrayBuffer
  if (rawData instanceof Buffer) return rawData.toString('utf8');
  // ArrayBuffer or TypedArray
  try {
    return Buffer.from(rawData).toString('utf8');
  } catch (err) {
    return '';
  }
}

function safeJsonParse(rawStr) {
  try {
    return JSON.parse(rawStr);
  } catch (err) {
    return null;
  }
}

function send(ws, message, priority = 'normal') {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;
  const packet = {
    ...message,
    timestamp: Date.now(),
    priority
  };
  try {
    ws.send(JSON.stringify(packet));
  } catch (err) {
    console.error('[SERVER] Failed to send packet to client:', err);
  }
}

// Broadcast a message to all connected clients
function broadcast(message, excludeClientId = null) {
  const serialized = JSON.stringify({
    ...message,
    timestamp: Date.now()
  });
  clients.forEach((entry, clientId) => {
    if (clientId === excludeClientId) return;
    const ws = entry.ws;
    if (ws && ws.readyState === WebSocket.OPEN) {
      try {
        ws.send(serialized);
      } catch (err) {
        console.error('[SERVER] Broadcast send error:', err);
      }
    }
  });
}

// Create HTTP server (optional) and WebSocket server on top
const server = http.createServer((req, res) => {
  res.writeHead(200);
  res.end('Essence.io WS server');
});
const wss = new WebSocket.Server({ server });

wss.on('connection', (ws, req) => {
  const clientId = makeClientId();
  console.log('[SERVER] ✅ Client connected:', clientId);

  // store client entry
  clients.set(clientId, { ws });

  // send init packet
  send(ws, {
    id: Math.random(),
    type: 'init',
    data: {
      type: 'init',
      clientId,
      config: {
        tickRate: TICK_RATE,
        worldSize: WORLD_SIZE,
        interpolationDelay: INTERPOLATION_DELAY
      }
    }
  }, 'critical');

  // safe message handler
  ws.on('message', (rawData, isBinary) => {
    let rawStr = '';
    try {
      rawStr = rawToString(rawData);
      const preview = rawStr.length > 500 ? rawStr.substring(0, 500) + '... (truncated)' : rawStr;
      // Try to parse JSON
      const msg = safeJsonParse(rawStr);
      if (!msg) {
        console.error('[SERVER ERROR] Failed to parse message: invalid JSON. Preview:', preview);
        return;
      }

      // handle batch packets or single messages
      if (msg.type === 'batch' && Array.isArray(msg.messages)) {
        msg.messages.forEach(m => handleClientMessage(clientId, m));
      } else {
        handleClientMessage(clientId, msg);
      }
    } catch (err) {
      // defensive: log as much as we can without assuming rawData is string
      console.error('[SERVER ERROR] Unexpected error in message handler:', err.stack || err);
      try {
        console.error('[SERVER ERROR] Raw data preview:', rawStr.substring(0, 500));
      } catch (logErr) {
        console.error('[SERVER ERROR] Failed to log raw data preview:', logErr);
      }
    }
  });

  ws.on('close', (code, reason) => {
    console.log('[SERVER] Client disconnected:', clientId, { code, reason: reason?.toString?.() || reason });
    clients.delete(clientId);
    players.delete(clientId);
    // broadcast player left
    broadcast({ type: 'playerLeft', data: { playerId: clientId } }, clientId);
  });

  ws.on('error', (err) => {
    console.error('[SERVER] WebSocket error for client', clientId, err);
  });
});

function handleClientMessage(clientId, msg) {
  // msg may be shaped as { type, data, ... } or nested; normalize
  const type = msg.type || msg.data?.type;
  const data = msg.data || msg;

  if (!type) {
    console.warn('[SERVER] Received message without type from', clientId, 'raw:', msg);
    return;
  }

  // Debug log
  // console.log('[SERVER RECEIVED] From', clientId, type, data);

  switch (type) {
    case 'join': {
      // Expect data.playerName or data.playerName inside data
      const playerName = data.playerName || data.name || 'Player';
      // create a simple player state
      const spawnX = Math.floor(Math.random() * WORLD_SIZE.width);
      const spawnY = Math.floor(Math.random() * WORLD_SIZE.height);
      const playerState = {
        id: clientId,
        name: playerName,
        position: { x: spawnX, y: spawnY },
        velocity: { x: 0, y: 0 },
        rotation: 0,
        essenceCount: 0,
        health: 100
      };
      players.set(clientId, playerState);
      // attach to clients entry
      const entry = clients.get(clientId);
      if (entry) entry.player = playerState;

      console.log(`[SERVER] Player joined: ${playerName} (${clientId}) at (${spawnX},${spawnY})`);

      // send world snapshot to the joining client (include clientId so client can find itself)
      const snapshot = buildWorldSnapshot(clientId);
      const ws = clients.get(clientId)?.ws;
      if (ws) {
        send(ws, { id: Math.random(), type: 'worldSnapshot', data: snapshot }, 'critical');
      }

      // announce to others that a new player joined
      broadcast({ id: Math.random(), type: 'playerJoined', data: { playerId: clientId, playerData: playerState } }, clientId);
      break;
    }

    case 'input': {
      // Client sends input updates; apply to player state (basic example)
      const p = players.get(clientId);
      if (!p) return;
      const input = data.input || data;
      const keys = input.keys || [];
      // very simple movement application for demo; server authoritative update would be more complex
      const speed = 150;
      let dx = 0, dy = 0;
      if (keys.includes('w') || keys.includes('ArrowUp')) dy -= 1;
      if (keys.includes('s') || keys.includes('ArrowDown')) dy += 1;
      if (keys.includes('a') || keys.includes('ArrowLeft')) dx -= 1;
      if (keys.includes('d') || keys.includes('ArrowRight')) dx += 1;
      // normalize
      const mag = Math.hypot(dx, dy) || 1;
      dx = dx / mag;
      dy = dy / mag;
      // apply small step (note: this handler is called at variable frequency; you should instead store input and apply in tick loop)
      p.position.x = Math.max(0, Math.min(WORLD_SIZE.width, p.position.x + dx * 5));
      p.position.y = Math.max(0, Math.min(WORLD_SIZE.height, p.position.y + dy * 5));
      p.velocity.x = dx * speed;
      p.velocity.y = dy * speed;
      p.rotation = Math.atan2(dy, dx);
      break;
    }

    case 'ping': {
      // client ping -> respond with 'pong' including serverTime
      const ws = clients.get(clientId)?.ws;
      if (ws) {
        send(ws, { id: Math.random(), type: 'pong', data: { serverTime: Date.now() } }, 'critical');
      }
      break;
    }

    default:
      // unknown: ignore or log
      // console.warn('[SERVER] No handler for message type:', type);
      break;
  }
}

function buildWorldSnapshot(forClientId = null) {
  // simple snapshot with players, essences (none here), npcs (none)
  const playerList = [];
  players.forEach(player => {
    playerList.push({
      id: player.id,
      name: player.name,
      position: { ...player.position },
      velocity: { ...player.velocity },
      rotation: player.rotation,
      essenceCount: player.essenceCount,
      health: player.health
    });
  });

  return {
    type: 'worldSnapshot',
    clientId: forClientId,
    players: playerList,
    essences: [], // fill with essences as you implement them
    npcs: []
  };
}

// Periodic tick to broadcast world snapshots
setInterval(() => {
  if (players.size === 0) return;
  const snapshot = buildWorldSnapshot(null);
  broadcast({ id: Math.random(), type: 'worldSnapshot', data: snapshot }, null);
}, 1000 / TICK_RATE);

// start server
server.listen(PORT, () => {
  console.log(`[SERVER] Listening on port ${PORT}`);
});
