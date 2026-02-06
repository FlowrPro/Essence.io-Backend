const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const cors = require('cors');
require('dotenv').config();

const { GameWorld } = require('./systems/GameWorld');
const { MessageQueue } = require('./network/MessageQueue');
const { GameConfig } = require('./config/GameConfig');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ 
  server, 
  perMessageDeflate: false,
  // Allow connections from frontend
  verifyClient: (info) => {
    const origin = info.origin || info.req.headers.origin;
    const allowedOrigins = [
      'http://localhost:5173',
      'http://localhost:3000',
      process.env.CLIENT_URL,
      process.env.FRONTEND_URL
    ];
    return allowedOrigins.includes(origin);
  }
});

// CORS configuration
app.use(cors({
  origin: [
    'http://localhost:5173',
    'http://localhost:3000',
    process.env.CLIENT_URL,
    process.env.FRONTEND_URL
  ],
  credentials: true
}));

app.use(express.json());

// ... rest of server code from before ...

// START SERVER
const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`🎮 [SERVER] Essence.io Server running on port ${PORT}`);
  console.log(`📡 WebSocket: ws://localhost:${PORT}`);
  console.log(`🌐 Environment: ${process.env.NODE_ENV}`);
  console.log(`✅ Ready for connections!`);
});
