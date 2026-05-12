const mongoose = require('mongoose');

const roomSchema = new mongoose.Schema({
  roomId: {
    type: String,
    required: true,
    unique: true
  },
  type: {
    type: String,
    enum: ['public', 'private'],
    required: true
  },
  password: {
    type: String, // Plain text for simplicity as planned
    required: function() {
      return this.type === 'private';
    }
  },
  createdBy: {
    type: String,
    required: true
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('Room', roomSchema);
