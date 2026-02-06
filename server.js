const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const cors = require('cors');
require('dotenv').config();

const { GameWorld } = require('./systems/GameWorld');
const { GameConfig } = require('./config/GameConfig');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ 
  server, 
  perMessageDeflate: false,
  verifyClient: (info) => {
    const origin = info.origin || info.req.headers.origin;
    const allowedOrigins = [
      'http://localhost:5173',
      'http://localhost:3000',
      process.env.CLIENT_URL,
      process.env.FRONTEND_URL,
      'https://essence-io.netlify.app'
    ];
    return allowedOrigins.includes(origin) || !origin;
  }
});

app.use(cors({
  origin: [
    'http://localhost:5173',
    'http://localhost:3000',
    process.env.CLIENT_URL,
    process.env.FRONTEND_URL,
    'https://essence-io.netlify.app'
  ],
  credentials: true
}));

app.use(express.json());

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', message: 'Essence.io server is running' });
});

const gameWorld = new GameWorld();
const clients = new Map();

class ClientConnection {
  constructor(ws, clientId) {
    this.ws = ws;
    this.clientId = clientId;
    this.player = null;
    this.lastAckTime = Date.now();
    this.latency = 0;
    this.inputBuffer = [];
    this.isAlive = true;
  }

  send(message, priority = 'normal') {
    if (this.ws.readyState === WebSocket.OPEN) {
      const packet = {
        id: Math.random(),
        timestamp: Date.now(),
        priority,
        data: message
      };
      this.ws.send(JSON.stringify(packet));
    }
  }

  sendBatch(messages) {
    if (this.ws.readyState === WebSocket.OPEN) {
      const batch = {
        type: 'batch',
        timestamp: Date.now(),
        messages: messages.map(msg => ({
          id: Math.random(),
          ...msg
        }))
      };
      this.ws.send(JSON.stringify(batch));
    }
  }
}

wss.on('connection', (ws) => {
  const clientId = Math.random().toString(36).substr(2, 9);
  const connection = new ClientConnection(ws, clientId);
  clients.set(ws, connection);

  console.log(`[SERVER] Client connected: ${clientId}`);

  connection.send({
    type: 'init',
    clientId,
    config: {
      tickRate: GameConfig.SERVER_TICK_RATE,
      worldSize: GameConfig.WORLD_SIZE,
      interpolationDelay: GameConfig.INTERPOLATION_DELAY
    }
  }, 'critical');

  ws.on('message', (rawData) => {
    try {
      const packet = JSON.parse(rawData);
      console.log(`[SERVER] Received packet type: ${packet.type || packet.data?.type}`);
      console.log(`[SERVER] Packet:`, packet);

      // Handle the message type - could be at packet.type or packet.data.type
      const messageType = packet.type || packet.data?.type;

      switch (messageType) {
        case 'join':
          console.log(`[SERVER] Handling join request`);
          const joinData = packet.data?.data || packet.data || {};
          console.log(`[SERVER] Join data:`, joinData);
          handlePlayerJoin(connection, joinData);
          break;

        case 'input':
          const inputData = packet.data?.input || packet.data?.data || {};
          handlePlayerInput(connection, inputData);
          break;

        case 'ping':
          handlePing(connection, packet);
          break;

        case 'ack':
          connection.lastAckTime = Date.now();
          break;

        default:
          console.warn(`[SERVER] Unknown message type: ${messageType}`);
      }
    } catch (error) {
      console.error(`[ERROR] Failed to parse message: ${error.message}`);
      console.error(`[ERROR] Raw data: ${rawData}`);
    }
  });

  ws.on('close', () => {
    handlePlayerDisconnect(connection);
    clients.delete(ws);
    console.log(`[SERVER] Client disconnected: ${clientId}`);
  });

  ws.on('error', (error) => {
    console.error(`[WEBSOCKET ERROR] ${clientId}: ${error.message}`);
  });
});

function handlePlayerJoin(connection, data) {
  console.log(`[SERVER] handlePlayerJoin called with data:`, data);
  
  const playerName = data.playerName || `Player_${connection.clientId}`;
  console.log(`[SERVER] Creating player: ${playerName}`);
  
  const player = gameWorld.addPlayer(connection.clientId, playerName);
  connection.player = player;
  
  console.log(`[SERVER] Player created:`, player);
  
  const snapshot = gameWorld.getWorldSnapshot(player.id);
  console.log(`[SERVER] Generated snapshot:`, snapshot);
  
  // Send worldSnapshot with the exact structure the client expects
  const worldSnapshotMessage = {
    type: 'worldSnapshot',
    clientId: connection.clientId,
    players: snapshot.players || [],
    essences: snapshot.essences || [],
    npcs: snapshot.npcs || []
  };
  
  console.log(`[SERVER] Sending worldSnapshot to ${playerName}:`, worldSnapshotMessage);
  connection.send(worldSnapshotMessage, 'critical');

  // Notify other players
  broadcastToAllExcept(connection, {
    type: 'playerJoined',
    playerId: player.id,
    playerData: player.getPublicData()
  });

  console.log(`[GAME] ${playerName} joined the game`);
}

function handlePlayerInput(connection, data) {
  if (!connection.player) return;

  connection.inputBuffer.push({
    timestamp: data.timestamp,
    input: data.input
  });
}

function handlePing(connection, packet) {
  const latency = Date.now() - packet.timestamp;
  connection.latency = latency;
  
  connection.send({
    type: 'pong',
    timestamp: packet.timestamp,
    serverTime: Date.now()
  });
}

function handlePlayerDisconnect(connection) {
  if (connection.player) {
    gameWorld.removePlayer(connection.player.id);
    
    broadcastToAll({
      type: 'playerLeft',
      playerId: connection.player.id
    });

    console.log(`[GAME] ${connection.player.name} left the game`);
  }
}

function broadcastToAll(message, priority = 'normal') {
  clients.forEach((connection) => {
    if (connection.ws.readyState === WebSocket.OPEN) {
      connection.send(message, priority);
    }
  });
}

function broadcastToAllExcept(excludeConnection, message, priority = 'normal') {
  clients.forEach((connection) => {
    if (connection !== excludeConnection && connection.ws.readyState === WebSocket.OPEN) {
      connection.send(message, priority);
    }
  });
}

const TICK_INTERVAL = 1000 / GameConfig.SERVER_TICK_RATE;
let lastTickTime = Date.now();

function serverGameLoop() {
  const now = Date.now();
  const deltaTime = (now - lastTickTime) / 1000;

  clients.forEach((connection) => {
    if (connection.player && connection.inputBuffer.length > 0) {
      const input = connection.inputBuffer.shift();
      gameWorld.processPlayerInput(connection.player.id, input.input);
    }
  });

  gameWorld.update(deltaTime);

  const stateUpdates = gameWorld.getDeltaUpdates();
  
  clients.forEach((connection) => {
    if (!connection.player) return;

    const relevantUpdates = filterRelevantUpdates(
      connection.player,
      stateUpdates,
      GameConfig.VISIBILITY_DISTANCE
    );

    if (relevantUpdates.length > 0) {
      connection.sendBatch([
        {
          type: 'stateUpdate',
          tick: gameWorld.tick,
          updates: relevantUpdates,
          timestamp: now
        }
      ]);
    }
  });

  lastTickTime = now;
}

function filterRelevantUpdates(player, updates, visibilityDistance) {
  return updates.filter(update => {
    if (!update.entity || !update.entity.position) return true;
    
    const distance = Math.hypot(
      update.entity.position.x - player.position.x,
      update.entity.position.y - player.position.y
    );
    return distance <= visibilityDistance;
  });
}

setInterval(serverGameLoop, TICK_INTERVAL);

setInterval(() => {
  const now = Date.now();
  clients.forEach((connection) => {
    if (!connection.isAlive) {
      connection.ws.terminate();
      return;
    }
    connection.isAlive = false;
    connection.send({ type: 'ping', timestamp: now });
  });
}, 30000);

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`🎮 [SERVER] Essence.io Server running on port ${PORT}`);
  console.log(`📡 WebSocket: ws://localhost:${PORT}`);
  console.log(`🌐 Environment: ${process.env.NODE_ENV}`);
  console.log(`✅ Ready for connections!`);
});

module.exports = { server, gameWorld };
