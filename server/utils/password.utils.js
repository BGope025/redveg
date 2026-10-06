const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { saltRounds } = require('../config/env');

const BCRYPT_SHA256_PREFIX = 'bcrypt-sha256:';

const digestPassword = (password) =>
  crypto.createHash('sha256').update(String(password), 'utf8').digest('hex');

/**
 * Hash a password
 * @param {string} password - Plain text password
 * @returns {Promise<string>} Hashed password
 */
const hashPassword = async (password) => {
  const salt = await bcrypt.genSalt(saltRounds);
  const hash = await bcrypt.hash(digestPassword(password), salt);
  return `${BCRYPT_SHA256_PREFIX}${hash}`;
};

/**
 * Compare a password with its hash
 * @param {string} password - Plain text password
 * @param {string} hashedPassword - Hashed password
 * @returns {Promise<boolean>} True if password matches
 */
const comparePassword = async (password, hashedPassword) => {
  const storedHash = String(hashedPassword || '');
  if (storedHash.startsWith(BCRYPT_SHA256_PREFIX)) {
    return await bcrypt.compare(
      digestPassword(password),
      storedHash.slice(BCRYPT_SHA256_PREFIX.length)
    );
  }

  // Existing bcrypt hashes remain valid during the migration to the tagged format.
  return await bcrypt.compare(password, storedHash);
};

module.exports = {
  hashPassword,
  comparePassword
};
