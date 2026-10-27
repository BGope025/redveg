require('./config/loadEnv')();
const http = require('http');
const app = require('./app');

const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || '0.0.0.0';
if (!Number.isInteger(PORT) || PORT < 1 || PORT > 65535) {
  throw new Error(`Invalid PORT value: ${process.env.PORT}`);
}

const server = http.createServer(app);

server.listen(PORT, HOST, () => {
  console.log(`Server listening on ${HOST}:${PORT}`);
});

module.exports = server;
// nodemon trigger
// touch
