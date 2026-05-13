const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const mongoose = require('mongoose');
const redis = require('redis');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');
const multer = require('multer');

// Models
const User = require('./src/models/User');
const PinnedMessage = require('./src/models/PinnedMessage');
const MatchAnalytics = require('./src/models/MatchAnalytics');
const Room = require('./src/models/Room');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'public', 'uploads')));

// Multer Configuration
const uploadDir = path.join(__dirname, 'public', 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadDir)
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9)
    cb(null, uniqueSuffix + path.extname(file.originalname))
  }
});

const upload = multer({ 
  storage: storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (req, file, cb) => {
    const filetypes = /jpeg|jpg|png|gif/;
    const extname = filetypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = filetypes.test(file.mimetype);
    if (mimetype && extname) {
      return cb(null, true);
    } else {
      cb(new Error('Images only!'));
    }
  }
});

// Environment Variables
const PORT = process.env.PORT || 3000;
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/fanzone';
const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

// Redis Clients (One for standard commands, two for Pub/Sub)
const redisClient = redis.createClient({ url: REDIS_URL });
const redisPub = redisClient.duplicate();
const redisSub = redisClient.duplicate();

async function startServer() {
  try {
    // 1. Connect to MongoDB
    await mongoose.connect(MONGODB_URI);
    console.log('📦 Connected to MongoDB (Persistent Store)');

    // 2. Connect to Redis
    await redisClient.connect();
    await redisPub.connect();
    await redisSub.connect();
    console.log('⚡ Connected to Redis (Cache & Pub/Sub)');

    // Redis Subscriber for multi-instance broadcasting
    await redisSub.pSubscribe('room:*', (message, channel) => {
      const roomId = channel.split(':')[1];
      const parsedMessage = JSON.parse(message);
      io.to(roomId).emit('receive_message', parsedMessage);
    });

    // Simple API to create/login user (MongoDB)
    app.post('/api/login', async (req, res) => {
      const { username } = req.body;
      if (!username) return res.status(400).json({ error: 'Username required' });
      
      let user = await User.findOne({ username });
      if (!user) {
        user = await User.create({ username });
      }
      res.json(user);
    });

    // Image Upload API
    app.post('/api/upload', upload.single('image'), (req, res) => {
      if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded or invalid file type' });
      }
      // Return the public URL path
      res.json({ imageUrl: `/uploads/${req.file.filename}` });
    });

    app.get('/api/pinned/:roomId', async (req, res) => {
      const messages = await PinnedMessage.find({ roomId: req.params.roomId }).sort('-timestamp').limit(20);
      res.json(messages);
    });

    // Room APIs
    app.post('/api/rooms', async (req, res) => {
      try {
        const { roomId, type, password, createdBy } = req.body;
        if (!roomId || !type || !createdBy) {
          return res.status(400).json({ error: 'Missing required fields' });
        }
        if (type === 'private' && !password) {
          return res.status(400).json({ error: 'Password required for private rooms' });
        }
        
        let room = await Room.findOne({ roomId });
        if (room) {
          return res.status(400).json({ error: 'Room already exists' });
        }
        
        let hashedPassword = password;
        if (type === 'private') {
          hashedPassword = await bcrypt.hash(password, 10);
        }
        
        room = await Room.create({ roomId, type, password: hashedPassword, createdBy });
        res.json(room);
      } catch (err) {
        res.status(500).json({ error: 'Server error creating room' });
      }
    });

    app.get('/api/rooms/public', async (req, res) => {
      try {
        const rooms = await Room.find({ type: 'public' }).sort('-createdAt').limit(50);
        res.json(rooms);
      } catch (err) {
        res.status(500).json({ error: 'Server error fetching rooms' });
      }
    });

    app.post('/api/rooms/verify', async (req, res) => {
      try {
        const { roomId, password } = req.body;
        const room = await Room.findOne({ roomId });
        
        if (!room) {
          return res.status(404).json({ error: 'Room not found' });
        }
        
        if (room.type === 'private') {
          const isMatch = await bcrypt.compare(password, room.password);
          if (!isMatch) {
            return res.status(401).json({ error: 'Invalid password' });
          }
        }
        
        res.json({ success: true, room });
      } catch (err) {
        res.status(500).json({ error: 'Server error verifying room' });
      }
    });

    // Socket.io Real-time Logic
    io.on('connection', (socket) => {
      console.log(`User connected: ${socket.id}`);

      socket.on('join_room', async ({ roomId, username }) => {
        socket.join(roomId);
        console.log(`${username} joined room ${roomId}`);

        // Update analytics (MongoDB)
        await MatchAnalytics.findOneAndUpdate(
          { roomId },
          { $inc: { peakConcurrentUsers: 1 } },
          { upsert: true }
        );

        // Fetch last 50 messages from Redis Cache instantly
        const cacheKey = `chat_history:${roomId}`;
        const cachedMessages = await redisClient.lRange(cacheKey, 0, 49);
        const messages = cachedMessages.map(msg => JSON.parse(msg)).reverse();
        
        socket.emit('room_history', messages);
      });

      socket.on('send_message', async (data) => {
        const { roomId, username, content, imageUrl } = data;
        const messageObj = {
          id: Math.random().toString(36).substring(2, 9),
          username,
          content,
          imageUrl: imageUrl || null,
          timestamp: new Date().toISOString()
        };

        // 1. Cache to Redis List (Limit to 50)
        const cacheKey = `chat_history:${roomId}`;
        await redisClient.lPush(cacheKey, JSON.stringify(messageObj));
        await redisClient.lTrim(cacheKey, 0, 49);

        // 2. Publish to Redis Channel
        await redisPub.publish(`room:${roomId}`, JSON.stringify(messageObj));

        // 3. Update User Stats (MongoDB - async, don't wait)
        User.updateOne({ username }, { $inc: { 'stats.messagesSent': 1 } }).catch(console.error);
        MatchAnalytics.updateOne({ roomId }, { $inc: { totalMessages: 1 } }).catch(console.error);
      });

      socket.on('pin_message', async (data) => {
        const { roomId, message, pinnedBy } = data;
        
        // Save to MongoDB permanently
        const pinnedMsg = new PinnedMessage({
          roomId,
          username: message.username,
          content: message.content,
          imageUrl: message.imageUrl || null,
          timestamp: message.timestamp,
          pinnedBy
        });
        await pinnedMsg.save();
        
        // Broadcast pin event
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
