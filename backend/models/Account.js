import mongoose from 'mongoose';

const AccountSchema = new mongoose.Schema({
  email: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    lowercase: true,
  },
  accessToken: {
    type: String,
    required: true,
  },
  refreshToken: {
    type: String,
    required: true,
  },
  expiryDate: {
    type: Number,
    required: true,
  },
  lastSync: {
    type: Date,
    default: null,
  },
  status: {
    type: String,
    enum: ['active', 'expired', 'error'],
    default: 'active',
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

const Account = mongoose.model('Account', AccountSchema);
export default Account;
