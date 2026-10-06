const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const { initializeDatabaseConnections, migrateCatalogCategories } = require('./config/turso');
const { initializeCloudinary } = require('./config/cloudflare');
const apiRouter = require('./api/index');
const frontendRouter = require('./routes/frontendRoutes');
const { errorHandler } = require('./middleware/error.middleware');
const logger = require('./utils/logger');

const app = express();

// The storefront may request browser geolocation; embedded third parties may not.
app.use((req, res, next) => {
  res.setHeader('Permissions-Policy', 'geolocation=(self)');
  next();
});

const configuredCorsOrigins = (process.env.CORS_ORIGIN || 'http://localhost:5177,http://localhost:3000')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

// Middleware
app.use(cookieParser());
app.use(cors({
  origin: (requestOrigin, callback) => {
    // Non-browser requests (for example health checks) have no Origin header.
    if (!requestOrigin) return callback(null, true);
    if (configuredCorsOrigins.includes('*') || configuredCorsOrigins.includes(requestOrigin)) {
      return callback(null, true);
    }
    return callback(new Error('Origin not allowed by CORS'));
  },
  credentials: true
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Initialize database connections
initializeDatabaseConnections();
migrateCatalogCategories();

// Initialize Cloudinary
initializeCloudinary();

// Request logging middleware
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.originalUrl}`);
  next();
});

// API routes - MUST come before frontendRouter
app.use('/api/v1', apiRouter);

// Frontend routes (handles SPA routing)
app.use("/", frontendRouter);

// Health check endpoint (for Render.com sleep prevention)
app.get('/api/v1/health/ping', (req, res) => {
  res.status(200).json({ status: 'alive', timestamp: new Date().toISOString() });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    message: 'Route not found',
    requestedUrl: req.originalUrl,
    method: req.method,
    hint: 'Check the API documentation for available routes and ensure you are using the correct URL and HTTP method.'
  });
});

// Error handling middleware (must be last)
app.use(errorHandler);

module.exports = app;
