const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const mongoose = require('mongoose');
const redis = require('redis');
const cors = require('cors');
const path = require('path');

const User = require('./src/models/User');
const PinnedMessage = require('./src/models/PinnedMessage');
const MatchAnalytics = require('./src/models/MatchAnalytics');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const PORT = process.env.PORT || 3000;
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/fanzone';
const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

const redisClient = redis.createClient({ url: REDIS_URL });
const redisPub = redisClient.duplicate();
const redisSub = redisClient.duplicate();

async function startServer() {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log('📦 Connected to MongoDB (Persistent Store)');

    await redisClient.connect();
    await redisPub.connect();
    await redisSub.connect();
    console.log('⚡ Connected to Redis (Cache & Pub/Sub)');

    await redisSub.pSubscribe('room:*', (message, channel) => {
      const roomId = channel.split(':')[1];
      const parsedMessage = JSON.parse(message);
      io.to(roomId).emit('receive_message', parsedMessage);
    });

    app.post('/api/login', async (req, res) => {
      const { username } = req.body;
      if (!username) return res.status(400).json({ error: 'Username required' });
      
      let user = await User.findOne({ username });
      if (!user) {
        user = await User.create({ username });
      }
      res.json(user);
    });

    app.get('/api/pinned/:roomId', async (req, res) => {
      const messages = await PinnedMessage.find({ roomId: req.params.roomId }).sort('-timestamp').limit(20);
      res.json(messages);
    });

    io.on('connection', (socket) => {
      console.log(`User connected: ${socket.id}`);

      socket.on('join_room', async ({ roomId, username }) => {
        socket.join(roomId);
        console.log(`${username} joined room ${roomId}`);

        await MatchAnalytics.findOneAndUpdate(
          { roomId },
          { $inc: { peakConcurrentUsers: 1 } },
          { upsert: true }
        );

        const cacheKey = `chat_history:${roomId}`;
        const cachedMessages = await redisClient.lRange(cacheKey, 0, 49);
        const messages = cachedMessages.map(msg => JSON.parse(msg)).reverse();
        
        socket.emit('room_history', messages);
      });

      socket.on('send_message', async (data) => {
        const { roomId, username, content } = data;
        const messageObj = {
          id: Math.random().toString(36).substring(2, 9),
          username,
          content,
          timestamp: new Date().toISOString()
        };

        const cacheKey = `chat_history:${roomId}`;
        await redisClient.lPush(cacheKey, JSON.stringify(messageObj));
        await redisClient.lTrim(cacheKey, 0, 49);

        await redisPub.publish(`room:${roomId}`, JSON.stringify(messageObj));

        User.updateOne({ username }, { $inc: { 'stats.messagesSent': 1 } }).catch(console.error);
        MatchAnalytics.updateOne({ roomId }, { $inc: { totalMessages: 1 } }).catch(console.error);
      });

      socket.on('pin_message', async (data) => {
        const { roomId, message, pinnedBy } = data;
        
        const pinnedMsg = new PinnedMessage({
          roomId,
          username: message.username,
          content: message.content,
          timestamp: message.timestamp,
          pinnedBy
        });
        await pinnedMsg.save();
        
        io.to(roomId).emit('message_pinned', pinnedMsg);
      });

      socket.on('disconnect', () => {
        console.log(`User disconnected: ${socket.id}`);
      });
    });

    server.listen(PORT, () => {
      console.log(`🚀 FanZone Live server running on http://localhost:${PORT}`);
    });

  } catch (err) {
    console.error('Failed to start server:', err);
    process.exit(1);
  }
}

startServer();
