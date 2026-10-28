import mongoose from 'mongoose';
import { env } from './env.js';

export async function connectDB() {
  mongoose.set('strictQuery', true);
  await mongoose.connect(env.MONGODB_URI);
  console.log(`✅ MongoDB connected (${mongoose.connection.name})`);
}

export async function disconnectDB() {
  await mongoose.disconnect();
}
