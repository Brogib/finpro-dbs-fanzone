const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  username: {
    type: String,
    required: true,
    unique: true,
    trim: true
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  stats: {
    messagesSent: { type: Number, default: 0 },
    eventsJoined: { type: Number, default: 0 }
  }
});

module.exports = mongoose.model('User', userSchema);
