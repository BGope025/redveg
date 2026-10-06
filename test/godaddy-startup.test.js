const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const path = require('node:path');

const startupProbe = String.raw`
const Module = require('node:module');
const originalLoad = Module._load;
Module._load = function (request, parent, isMain) {
  if (request === 'dotenv') {
    const error = new Error("Cannot find module 'dotenv'");
    error.code = 'MODULE_NOT_FOUND';
    throw error;
  }
  if (request === '@libsql/client') {
    throw new Error('Native LibSQL client must not load for remote Turso URLs');
  }
  return originalLoad.call(this, request, parent, isMain);
};

const turso = require('./server/config/turso');
turso.initializeDatabaseConnections();
Promise.all(['catalog', 'orders', 'customer', 'availablePincodes'].map((name) =>
  turso.getDatabaseConnection(name)
)).then((clients) => {
  clients.forEach((client) => client.close());
  console.log('GODADDY_REMOTE_DRIVER_OK');
}).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
`;

test('GoDaddy remote Turso boot uses the web driver without dotenv or native LibSQL', () => {
  const result = spawnSync(process.execPath, ['-e', startupProbe], {
    cwd: path.resolve(__dirname, '..'),
    encoding: 'utf8',
    timeout: 10000,
    env: {
      NODE_ENV: 'production',
      PORT: '39128',
      TURSO_CATALOG_URL: 'libsql://catalog.example.turso.io',
      TURSO_CATALOG_AUTH_TOKEN: 'test-token',
      TURSO_ORDERS_URL: 'libsql://orders.example.turso.io',
      TURSO_ORDERS_AUTH_TOKEN: 'test-token',
      TURSO_CUSTOMER_URL: 'libsql://customers.example.turso.io',
      TURSO_CUSTOMER_AUTH_TOKEN: 'test-token',
      AVAILABLE_PINCODES_DB_URL: 'libsql://pincodes.example.turso.io',
      AVAILABLE_PINCODES_DB_AUTH_TOKEN: 'test-token',
      CLOUDINARY_CLOUD_NAME: 'test',
      CLOUDINARY_API_KEY: 'test',
      CLOUDINARY_API_SECRET: 'test',
      JWT_SECRET: 'test-secret'
    }
  });

  const output = `${result.stdout || ''}\n${result.stderr || ''}`;
  assert.ifError(result.error);
  assert.equal(result.status, 0, output);
  assert.match(output, /GODADDY_REMOTE_DRIVER_OK/);
  assert.match(output, /dotenv is unavailable; using host-injected environment variables/);
  assert.doesNotMatch(output, /ERR_DLOPEN_FAILED|Native LibSQL client must not load/);
});
