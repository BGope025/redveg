const dotenv = require('dotenv');
dotenv.config();

// Validate required environment variables
const requiredEnvVars = [
  'CLOUDINARY_CLOUD_NAME',
  'CLOUDINARY_API_KEY',
  'CLOUDINARY_API_SECRET',
  'JWT_SECRET'
];

if (!process.env.TURSO_CATALOG_URL && !process.env.DATA_PATH) {
  requiredEnvVars.push('TURSO_CATALOG_URL');
}
if (!process.env.TURSO_ORDERS_URL && !process.env.DATA_PATH) {
  requiredEnvVars.push('TURSO_ORDERS_URL');
}
if (!process.env.TURSO_CUSTOMER_URL && !process.env.DATA_PATH) {
  requiredEnvVars.push('TURSO_CUSTOMER_URL');
}
if (!process.env.AVAILABLE_PINCODES_DB_URL && !process.env.DATA_PATH) {
  requiredEnvVars.push('AVAILABLE_PINCODES_DB_URL');
}

const missingEnvVars = requiredEnvVars.filter(varName => !process.env[varName]);

if (missingEnvVars.length > 0) {
  console.error('Missing required environment variables:', missingEnvVars);
  process.exit(1);
}

module.exports = {
  port: process.env.PORT || 3000,
  corsOrigin: process.env.CORS_ORIGIN || '*',

  // Turso Catalog DB
  catalogDbUrl: process.env.TURSO_CATALOG_URL,
  catalogDbAuthToken: process.env.TURSO_CATALOG_AUTH_TOKEN,

  // Turso Orders DB
  ordersDbUrl: process.env.TURSO_ORDERS_URL,
  ordersDbAuthToken: process.env.TURSO_ORDERS_AUTH_TOKEN,

  // Turso Customers DB
  customerDbUrl: process.env.TURSO_CUSTOMER_URL,
  customerDbAuthToken: process.env.TURSO_CUSTOMER_AUTH_TOKEN,

  // Turso Available Pincodes DB
  availablePincodesDbUrl: process.env.AVAILABLE_PINCODES_DB_URL,
  availablePincodesDbAuthToken: process.env.AVAILABLE_PINCODES_DB_AUTH_TOKEN,

  // Cloudinary
  cloudinary: {
    cloudName: process.env.CLOUDINARY_CLOUD_NAME,
    apiKey: process.env.CLOUDINARY_API_KEY,
    apiSecret: process.env.CLOUDINARY_API_SECRET
  },

  // JWT
  firebaseProjectId: process.env.FIREBASE_PROJECT_ID || process.env.VITE_FIREBASE_PROJECT_ID,
  jwtSecret: process.env.JWT_SECRET,
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '24h',

  // Bcrypt
  saltRounds: parseInt(process.env.SALT_ROUNDS) || 10,

  // File upload limits
  maxFileSize: parseInt(process.env.MAX_FILE_SIZE_MB) || 5, // MB

  // Node-cron
  archiveCronTime: process.env.ARCHIVE_CRON_TIME || '0 0 * * *' // Daily at midnight
};
