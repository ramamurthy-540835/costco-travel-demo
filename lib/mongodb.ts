import mongoose from 'mongoose';

let cached: any = (global as any).mongoose;

if (!cached) {
  cached = (global as any).mongoose = { conn: null, promise: null };
}

async function connectToDatabase() {
  if (cached.conn) {
    return cached.conn;
  }

  // Read and validate the URI HERE, not at module scope — `next build`'s
  // "Collecting page data" step imports every route module, so a module-scope
  // throw on a missing MONGODB_URI would fail the build even though nothing
  // connects to Mongo at build time (see mastech-agentic-commerce/lib/mongodb.ts).
  const MONGODB_URI = process.env.MONGODB_URI;

  if (!MONGODB_URI) {
    throw new Error('Please define the MONGODB_URI environment variable');
  }

  if (!cached.promise) {
    cached.promise = mongoose.connect(MONGODB_URI).then((mongoose) => {
      return mongoose;
    });
  }
  cached.conn = await cached.promise;
  return cached.conn;
}

export default connectToDatabase;
