import mongoose from 'mongoose';
import logger from '../utils/logger';

const connectDB = async (): Promise<void> => {
  try {
    const mongoURI = process.env.MONGODB_URI || 'mongodb://localhost:27017/personal-crm';
    
    const conn = await mongoose.connect(mongoURI, {
      maxPoolSize: parseInt(process.env.MONGODB_MAX_POOL_SIZE || '50'), // Increased for concurrent users
      minPoolSize: parseInt(process.env.MONGODB_MIN_POOL_SIZE || '10'), // Maintain minimum connections
      serverSelectionTimeoutMS: 5000, // Timeout after 5s instead of 30s
      socketTimeoutMS: 45000, // Close sockets after 45s of inactivity
      heartbeatFrequencyMS: 10000, // Send heartbeat every 10s
    });
    
    logger.info(`MongoDB Connected: ${conn.connection.host} (Pool: ${process.env.MONGODB_MAX_POOL_SIZE || '50'} max connections)`);
  } catch (error) {
    logger.error('Database connection error:', error);
    process.exit(1);
  }
};

export default connectDB;
