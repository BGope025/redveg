let loaded = false;

function loadEnvironment() {
  if (loaded) return;

  try {
    require('dotenv').config();
  } catch (error) {
    const missingDotenv = error
      && error.code === 'MODULE_NOT_FOUND'
      && /Cannot find module ['\"]dotenv['\"]/.test(error.message || '');

    // GoDaddy injects PORT and the application's configured variables into
    // the process. dotenv is only needed to load a local development .env.
    if (!missingDotenv || !process.env.PORT) throw error;
    console.warn('[startup] dotenv is unavailable; using host-injected environment variables');
  }

  loaded = true;
}

module.exports = loadEnvironment;
