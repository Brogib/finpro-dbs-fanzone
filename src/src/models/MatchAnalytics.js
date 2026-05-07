const mongoose = require('mongoose');

const matchAnalyticsSchema = new mongoose.Schema({
  roomId: {
    type: String,
    required: true,
    unique: true
  },
  totalMessages: {
    type: Number,
    default: 0
  },
  peakConcurrentUsers: {
    type: Number,
    default: 0
  },
  eventStartTime: {
    type: Date,
    default: Date.now
  },
  eventEndTime: {
    type: Date
  }
});

module.exports = mongoose.model('MatchAnalytics', matchAnalyticsSchema);
