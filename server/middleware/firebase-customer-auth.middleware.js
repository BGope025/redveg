const jwt = require('jsonwebtoken');
const { firebaseProjectId } = require('../config/env');

const FIREBASE_CERTS_URL = 'https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com';
let certificateCache = null;

function authFailure(message, type = 'auth-error') {
  return Object.assign(new Error(message), { type });
}

async function getFirebaseCertificates(forceRefresh = false) {
  if (!forceRefresh && certificateCache && certificateCache.expiresAt > Date.now()) {
    return certificateCache.certificates;
  }

  let response;
  try {
    response = await fetch(FIREBASE_CERTS_URL, { signal: AbortSignal.timeout(7000) });
  } catch {
    throw authFailure('Firebase token verification is temporarily unavailable.', 'verification-unavailable');
  }
  if (!response.ok) {
    throw authFailure('Firebase token verification is temporarily unavailable.', 'verification-unavailable');
  }

  let certificates;
  try {
    certificates = await response.json();
  } catch {
    throw authFailure('Firebase token verification is temporarily unavailable.', 'verification-unavailable');
  }
  if (!certificates || typeof certificates !== 'object' || Array.isArray(certificates)) {
    throw authFailure('Firebase token verification is temporarily unavailable.', 'verification-unavailable');
  }

  const cacheControl = response.headers.get('cache-control') || '';
  const maxAge = Number(cacheControl.match(/max-age=(\d+)/i)?.[1] || 3600);
  const ttlSeconds = Math.min(Math.max(maxAge, 60), 86400);
  certificateCache = { certificates, expiresAt: Date.now() + ttlSeconds * 1000 };
  return certificates;
}

async function verifyFirebaseIdToken(token) {
  const projectId = String(firebaseProjectId || '').trim();
  if (!projectId) {
    throw authFailure('Firebase customer authentication is not configured on the server.', 'configuration-error');
  }
  if (typeof token !== 'string' || token.length > 8192) {
    throw authFailure('A valid Firebase sign-in is required.');
  }

  const decoded = jwt.decode(token, { complete: true });
  if (!decoded?.header || decoded.header.alg !== 'RS256' || typeof decoded.header.kid !== 'string') {
    throw authFailure('A valid Firebase sign-in is required.');
  }

  let certificates = await getFirebaseCertificates();
  if (!certificates[decoded.header.kid]) {
    certificates = await getFirebaseCertificates(true);
  }
  const certificate = certificates[decoded.header.kid];
  if (typeof certificate !== 'string') {
    throw authFailure('A valid Firebase sign-in is required.');
  }

  let claims;
  try {
    claims = jwt.verify(token, certificate, {
      algorithms: ['RS256'],
      audience: projectId,
      issuer: `https://securetoken.google.com/${projectId}`,
      clockTolerance: 5,
    });
  } catch {
    throw authFailure('Your sign-in has expired or is invalid. Please sign in again.');
  }

  if (typeof claims.sub !== 'string' || !claims.sub.trim() || claims.sub.length > 128) {
    throw authFailure('A valid Firebase sign-in is required.');
  }

  return {
    uid: claims.sub,
    displayName: typeof claims.name === 'string' ? claims.name : null,
    email: typeof claims.email === 'string' ? claims.email : null,
    phoneNumber: typeof claims.phone_number === 'string' ? claims.phone_number : null,
    photoUrl: typeof claims.picture === 'string' ? claims.picture : null,
  };
}

async function authenticateFirebaseCustomer(req, res, next) {
  const authorization = req.get?.('authorization') || req.headers?.authorization || '';
  const match = /^Bearer\s+(.+)$/i.exec(String(authorization));
  if (!match) {
    return res.status(401).json({ success: false, message: 'Please sign in to access your account.' });
  }

  try {
    req.firebaseCustomer = await verifyFirebaseIdToken(match[1]);
    return next();
  } catch (error) {
    const unavailable = error.type === 'configuration-error' || error.type === 'verification-unavailable';
    return res.status(unavailable ? 503 : 401).json({
      success: false,
      message: error.message || 'Unable to verify your sign-in. Please try again.',
    });
  }
}

module.exports = { authenticateFirebaseCustomer, verifyFirebaseIdToken };
