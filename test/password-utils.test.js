const test = require('node:test');
const assert = require('node:assert/strict');
const bcrypt = require('bcryptjs');
const {
  hashPassword,
  comparePassword,
} = require('../server/utils/password.utils');
const turso = require('../server/config/turso');

let loginUser = null;
turso.getDatabaseConnection = async () => ({
  execute: async () => ({ rows: loginUser ? [loginUser] : [] }),
});
const { login } = require('../server/api/v1/auth/auth.controller');

function response() {
  return {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    cookie() {
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
  };
}

test('password hashing preserves characters beyond bcrypt’s 72-byte limit', async () => {
  const sharedPrefix = 'passphrase-'.repeat(12);
  const password = `${sharedPrefix}ending-one`;
  const wrongPassword = `${sharedPrefix}ending-two`;
  const hash = await hashPassword(password);

  assert.match(hash, /^bcrypt-sha256:\$2[aby]\$/);
  assert.equal(await comparePassword(password, hash), true);
  assert.equal(await comparePassword(wrongPassword, hash), false);
});

test('password comparison continues to accept existing bcrypt hashes', async () => {
  const password = 'legacy-password';
  const hash = await bcrypt.hash(password, 10);

  assert.equal(await comparePassword(password, hash), true);
  assert.equal(await comparePassword('not-the-password', hash), false);
});

test('admin login accepts a full long passphrase and rejects the old password', async () => {
  const sharedPrefix = 'login-passphrase-'.repeat(8);
  const newPassword = `${sharedPrefix}ending-one`;
  loginUser = {
    id: 'admin-test',
    username: 'admin',
    role: 'admin',
    password_hash: await hashPassword(newPassword),
  };

  const newPasswordResponse = response();
  await login(
    { body: { username: 'admin', password: newPassword } },
    newPasswordResponse
  );
  assert.equal(newPasswordResponse.statusCode, 200);
  assert.equal(newPasswordResponse.body.success, true);

  const oldPasswordResponse = response();
  await login(
    { body: { username: 'admin', password: 'admin123' } },
    oldPasswordResponse
  );
  assert.equal(oldPasswordResponse.statusCode, 401);
});
