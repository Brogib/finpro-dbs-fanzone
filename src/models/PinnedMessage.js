const mongoose = require('mongoose');

const pinnedMessageSchema = new mongoose.Schema({
  roomId: {
    type: String,
    required: true,
    index: true
  },
  username: {
    type: String,
    required: true
  },
  content: {
    type: String,
    required: true
  },
  timestamp: {
    type: Date,
    default: Date.now
  },
  pinnedBy: {
    type: String,
    required: true
  }
});

module.exports = mongoose.model('PinnedMessage', pinnedMessageSchema);
