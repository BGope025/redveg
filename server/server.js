require('./config/loadEnv')();
const http = require('http');
const app = require('./app');

const PORT = Number(process.env.PORT || 3000);
if (!Number.isInteger(PORT) || PORT < 1 || PORT > 65535) {
  throw new Error(`Invalid PORT value: ${process.env.PORT}`);
}

const server = http.createServer(app);

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Server listening on 0.0.0.0:${PORT}`);
});

module.exports = server;
// nodemon trigger
// touch
