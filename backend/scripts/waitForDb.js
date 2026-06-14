const net = require('net');
const config = require('../src/config');
const logger = require('../src/logger');

function parseDatabaseUrl(databaseUrl) {
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is not set');
  }
  const url = new URL(databaseUrl);
  const defaultPort = url.protocol.startsWith('postgres') ? 5432 : 3306;
  return {
    host: url.hostname,
    port: Number(url.port || defaultPort)
  };
}

function waitForPort({ host, port, retries = 30, delay = 2000 }) {
  return new Promise((resolve, reject) => {
    let attempts = 0;

    const tryConnect = () => {
      attempts += 1;
      const socket = net.createConnection(port, host);
      socket.on('connect', () => {
        socket.end();
        resolve();
      });
      socket.on('error', () => {
        socket.destroy();
        if (attempts >= retries) {
          reject(new Error('Database not reachable'));
          return;
        }
        setTimeout(tryConnect, delay);
      });
    };

    tryConnect();
  });
}

async function main() {
  const { host, port } = parseDatabaseUrl(config.databaseUrl);
  logger.info('db.wait', { host, port });
  await waitForPort({ host, port });
  logger.info('db.ready', { host, port });
}

main().catch((error) => {
  logger.error('db.wait.failed', { message: error.message });
  process.exitCode = 1;
});
