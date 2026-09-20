import app from './app';
import { config } from './config';
import { connectDatabase } from './config/database';
import mongoose from 'mongoose';
import { initializeAuth } from './auth';
import { startJobProcessor, stopJobProcessor } from './jobs/processor';

async function bootstrap() {
  const server = app.listen(config.PORT, '0.0.0.0', () => {
    console.log(`Study AI Backend running on http://0.0.0.0:${config.PORT}`);
  });

  // The health endpoint remains live during an outage, but protected routes are never
  // allowed to run until MongoDB and Better Auth share the same real connection.
  connectDatabase()
    .then(() => {
      if (!mongoose.connection.db) throw new Error('MongoDB connection is unavailable');
      initializeAuth(mongoose.connection.db);
      startJobProcessor();
    })
    .catch((err) => {
      console.error('Database connection failed, running in degraded state:', err);
    });

  const shutdown = () => {
    console.log('Shutting down gracefully...');
    stopJobProcessor();
    server.close(() => {
      console.log('Server closed.');
      process.exit(0);
    });
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

bootstrap().catch((err) => {
  console.error('Bootstrap failed:', err);
  process.exit(1);
});
