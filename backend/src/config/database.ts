import mongoose from 'mongoose';
import { config } from './index';

export async function connectDatabase(): Promise<void> {
  if (!config.MONGODB_URI) throw new Error('MONGODB_URI is required');
  let attempts = 0;
  const maxAttempts = 3;

  while (attempts < maxAttempts) {
    try {
      attempts++;
      console.log(`Connecting to MongoDB (attempt ${attempts}/${maxAttempts})...`);
      await mongoose.connect(config.MONGODB_URI, {
        serverSelectionTimeoutMS: 5000,
      });
      console.log('MongoDB connected successfully');
      return;
    } catch (err) {
      console.error(`MongoDB connection failed (attempt ${attempts}/${maxAttempts}):`, err);
      if (attempts >= maxAttempts) {
        throw err;
      }
      await new Promise((res) => setTimeout(res, 2000));
    }
  }
}

export function getDatabaseHealth(): { status: string; connected: boolean } {
  const state = mongoose.connection.readyState;
  const states = ['disconnected', 'connected', 'connecting', 'disconnecting'];
  return {
    status: states[state] || 'unknown',
    connected: state === 1,
  };
}
