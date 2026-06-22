import mongoose from 'mongoose';

// User Schema
const UserSchema = new mongoose.Schema({
  email: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    lowercase: true,
    index: true
  },
  name: {
    type: String,
    required: true,
    trim: true
  },
  picture: {
    type: String,
    default: ''
  }
}, {
  timestamps: true // Automatically manages createdAt and updatedAt
});

export const User = mongoose.model('User', UserSchema);

// OTP Schema with TTL index
const OtpRecordSchema = new mongoose.Schema({
  email: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    lowercase: true
  },
  otp: {
    type: String,
    required: true
  },
  expiresAt: {
    type: Date,
    required: true,
    index: { expires: 0 } // Document auto-expires and deletes at expiresAt date
  }
});

export const OtpRecord = mongoose.model('OtpRecord', OtpRecordSchema);

export let isDBConnected = false;

// Connection logic
export const connectDB = async (): Promise<void> => {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error('❌ MONGODB_URI is not defined in the environmental configuration!');
    process.exit(1);
  }

  try {
    const conn = await mongoose.connect(uri);
    isDBConnected = true;
    console.log(`🔌 Connected to MongoDB Atlas: ${conn.connection.host}`);
  } catch (error) {
    isDBConnected = false;
    console.error('❌ MongoDB Connection Failure:', error);
    console.warn('⚠️ Server will remain active on port 5002, but DB queries will fall back to local in-memory stores.');
  }
};
