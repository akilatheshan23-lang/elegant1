import mongoose from 'mongoose';

const EmailSchema = new mongoose.Schema({
  messageId: {
    type: String,
    required: true,
    unique: true,
  },
  threadId: {
    type: String,
    required: true,
  },
  sender: {
    type: String,
    required: true,
  },
  receiver: {
    type: String,
    required: true,
  },
  subject: {
    type: String,
    default: '',
  },
  body: {
    type: String,
    default: '',
  },
  receivedAt: {
    type: Date,
    required: true,
  },
  mood: {
    type: String,
    enum: ['Angry', 'Neutral', 'Happy'],
    default: 'Neutral',
  },
  priority: {
    type: String,
    enum: ['High', 'Medium', 'Low'],
    default: 'Medium',
  },
  messageType: {
    type: String,
    enum: ['Inquiry / Letter', 'Production Update', 'Image & Sample Approval'],
    default: 'Inquiry / Letter',
  },
  summary: {
    type: String,
    default: '',
  },
  suggestedReply: {
    type: String,
    default: '',
  },
  status: {
    type: String,
    enum: ['Pending', 'Responded'],
    default: 'Pending',
  },
  respondedAt: {
    type: Date,
    default: null,
  },
  responseTime: {
    type: Number, // in minutes
    default: null,
  },
  isReply: {
    type: Boolean,
    default: false,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

const Email = mongoose.model('Email', EmailSchema);
export default Email;
