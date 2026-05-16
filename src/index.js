import { loadConfig } from './config.js';
import { openDatabase } from './db.js';
import { buildApp } from './app.js';

const SHUTDOWN_TIMEOUT_MS = 10_000;

let config;
try {
  config = loadConfig();
} catch (err) {
  console.error(err.message);
  process.exit(1);
}

const store = openDatabase(config.databasePath);
const app = await buildApp(config, store);

let shuttingDown = false;
async function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  app.log.info(`received ${signal}, shutting down`);

  // Guarantee the process exits even if a connection refuses to drain.
  const force = setTimeout(() => {
    app.log.error('shutdown timed out, forcing exit');
    process.exit(1);
  }, SHUTDOWN_TIMEOUT_MS);
  force.unref();

  try {
    await app.close();
    store.close();
  } catch (err) {
    app.log.error({ err }, 'error during shutdown');
    process.exit(1);
  }
  process.exit(0);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

// A corrupt process state is not recoverable: log and exit so the container
// runtime restarts a clean instance.
process.on('uncaughtException', (err) => {
  app.log.error({ err }, 'uncaught exception');
  process.exit(1);
});
process.on('unhandledRejection', (reason) => {
  app.log.error({ err: reason }, 'unhandled rejection');
  process.exit(1);
});

try {
  await app.listen({ host: config.bindAddress, port: config.port });
} catch (err) {
  app.log.error(err);
  store.close();
  process.exit(1);
}
