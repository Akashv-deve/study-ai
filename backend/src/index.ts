import app from './app';
import { config } from './config';
import { connectDatabase } from './config/database';
import mongoose from 'mongoose';
import { initializeAuth } from './auth';
import { startJobProcessor, stopJobProcessor } from './jobs/processor';
import { migratePracticeAttempts } from './practice/migrations';

/**
 * Explicit, linear startup sequence. Each step is awaited before the next begins, and `app.listen()` is the
 * LAST thing that happens — there is no code path where the HTTP server accepts a connection before the
 * database is connected and the Practice Lab migration (which resolves any pre-existing duplicate
 * in_progress attempts and then builds the partial unique index that enforces "at most one in_progress
 * attempt per userId+challengeId") has completed successfully. A failure at any step is fatal: it is logged
 * and the process exits withOUT ever calling listen(), rather than continuing in a state where that
 * database invariant is not guaranteed.
 */
export async function startServer(): Promise<ReturnType<typeof app.listen>> {
  await connectDatabase();
  if (!mongoose.connection.db) throw new Error('MongoDB connection is unavailable');

  // Resolves pre-existing duplicate active attempts (keeping the newest, abandoning the rest — never
  // deleting history) and then builds/syncs the PracticeAttempt indexes, including the partial unique index
  // on {userId, challengeId} filtered to status: 'in_progress'. See practice/migrations.ts; this logic is
  // unchanged from before — only its place in the startup sequence (and what happens if it throws) changes here.
  await migratePracticeAttempts();

  initializeAuth(mongoose.connection.db);
  startJobProcessor();

  return app.listen(config.PORT, '0.0.0.0', () => {
    console.log(`Study AI Backend running on http://0.0.0.0:${config.PORT}`);
  });
}

// Only actually boot the server when this file is run directly (`node dist/index.js`), not when it's
// imported — e.g. by a test exercising startServer() with its own mocks. require.main is Node's standard
// "am I the entrypoint" check and doesn't change production behavior at all.
/* istanbul ignore next -- exercised via a real process start, not unit tests */
if (require.main === module) {
  startServer()
    .then((server) => {
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
    })
    .catch((err) => {
      // Fatal: connectDatabase, migratePracticeAttempts (including index creation), or any other required
      // startup step failed. The server never started listening — there is no window where requests could
      // be served without the one-active-attempt invariant in place.
      console.error('FATAL: startup failed — the server was never started. The one-active-attempt invariant and/or database connection could not be established:', err);
      process.exit(1);
    });
}
