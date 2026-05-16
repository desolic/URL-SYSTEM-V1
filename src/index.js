import { loadConfig } from './config.js';
import { openDatabase } from './db.js';
import { buildApp } from './app.js';

let config;
try {
  config = loadConfig();
} catch (err) {
  console.error(err.message);
  process.exit(1);
}

const store = openDatabase(config.databasePath);
const app = await buildApp(config, store);

async function shutdown(signal) {
  app.log.info(`received ${signal}, shutting down`);
  await app.close();
  store.close();
  process.exit(0);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

try {
  await app.listen({ host: config.bindAddress, port: config.port });
} catch (err) {
  app.log.error(err);
  store.close();
  process.exit(1);
}
