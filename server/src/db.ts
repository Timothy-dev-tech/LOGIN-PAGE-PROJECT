import mongoose from 'mongoose';

export async function connectDb(uri: string): Promise<void> {
  mongoose.connection.on('disconnected', () => console.warn('MongoDB disconnected'));
  mongoose.connection.on('error', (err) => console.error('MongoDB error:', err));
  // Fail after 5 seconds instead of the default 30 if the database cannot be reached.
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 5000 });
  console.log('MongoDB connected');
}

export async function disconnectDb(): Promise<void> {
  await mongoose.disconnect();
}