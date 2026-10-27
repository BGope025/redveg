const { getDatabaseConnection } = require('../config/turso');
const postalCoordinateData = require('../../data/kolkata-postal-locations-2026-06.json');
const activePostalFallbackData = require('../../data/active-delivery-pincode-fallbacks.json');

const DEFAULT_ORIGIN_ADDRESS = 'Prantik Sarani, Rabindra Nagar, Dum Dum Cantonment, P.O, Dum Dum, Kolkata, West Bengal 700065';
const DEFAULT_ORIGIN_LATITUDE = 22.634926;
const DEFAULT_ORIGIN_LONGITUDE = 88.4076512;
const DEFAULT_RATE_PER_KM = 10;
const POSTAL_COORDINATES = new Map([
  ...(postalCoordinateData.postalCodes || []),
  ...(activePostalFallbackData.postalCodes || []),
]
  .filter(location => validCoordinates(location.latitude, location.longitude))
  .map(location => [String(location.pincode), {
    latitude: Number(location.latitude),
    longitude: Number(location.longitude),
    formatted: `${location.area}, ${location.city}, ${location.state} ${location.pincode}`,
  }]));
class DeliveryQuoteError extends Error {
  constructor(message, statusCode = 422) { super(message); this.name = 'DeliveryQuoteError'; this.statusCode = statusCode; }
}

const BUSINESS_ORDER_DEFAULTS = {};
const readyDatabases = new WeakSet();

function roundMoney(value) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

function validCoordinates(latitude, longitude) {
  return Number.isFinite(Number(latitude)) && Number.isFinite(Number(longitude)) &&
    Number(latitude) >= -90 && Number(latitude) <= 90 &&
    Number(longitude) >= -180 && Number(longitude) <= 180;
}

async function ensureDeliveryPricingSchema(db) {
  if (readyDatabases.has(db)) return;
  await db.execute(`CREATE TABLE IF NOT EXISTS delivery_pricing_settings (
    setting_key TEXT PRIMARY KEY,
    setting_value TEXT NOT NULL,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`);
  await db.execute({
    sql: `INSERT OR IGNORE INTO delivery_pricing_settings (setting_key, setting_value)
      VALUES ('origin_address', ?), ('rate_per_km', ?), ('origin_latitude', ?), ('origin_longitude', ?)`,
    args: [DEFAULT_ORIGIN_ADDRESS, String(DEFAULT_RATE_PER_KM), String(DEFAULT_ORIGIN_LATITUDE), String(DEFAULT_ORIGIN_LONGITUDE)],
  });
  for (const [key, value] of Object.entries(BUSINESS_ORDER_DEFAULTS)) {
    await db.execute({
      sql: `INSERT OR IGNORE INTO delivery_pricing_settings (setting_key, setting_value) VALUES (?, ?)`,
      args: [key, value],
    });
  }
  await db.execute({
    sql: "DELETE FROM delivery_pricing_settings WHERE setting_key IN ('delivery_radius_km', 'free_delivery_enabled', 'coupons_enabled', 'minimum_offer_order_amount', 'minimum_order_amount')",
    args: [],
  });
  readyDatabases.add(db);
}

async function readPricingSettings(db) {
  await ensureDeliveryPricingSchema(db);
  const result = await db.execute({
    sql: 'SELECT setting_key, setting_value FROM delivery_pricing_settings',
    args: [],
  });
  return Object.fromEntries(result.rows.map(row => [row.setting_key, row.setting_value]));
}

async function geocodeAddress(address, expectedPincode = null) {
  const apiKey = String(process.env.GEOAPIFY_API_KEY || '').trim();
  if (!apiKey) return null;
  const url = new URL('https://api.geoapify.com/v1/geocode/search');
  url.searchParams.set('text', address);
  url.searchParams.set('filter', 'countrycode:in');
  url.searchParams.set('limit', expectedPincode ? '5' : '1');
  url.searchParams.set('apiKey', apiKey);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) throw new Error(`Address lookup returned HTTP ${response.status}`);
    const payload = await response.json();
    const features = payload?.features || [];
    const feature = expectedPincode
      ? features
        .filter(candidate => {
          const properties = candidate.properties || {};
          return String(properties.postcode || '').match(/\b\d{6}\b/)?.[0] === String(expectedPincode) &&
            (!properties.state || /west bengal/i.test(String(properties.state)));
        })
        .sort((a, b) => Number(b.properties?.rank?.confidence || 0) - Number(a.properties?.rank?.confidence || 0))[0]
      : features[0];
    const coordinates = feature?.geometry?.coordinates;
    if (!Array.isArray(coordinates) || !validCoordinates(coordinates[1], coordinates[0])) return null;
    const properties = feature.properties || {};
    return {
      latitude: Number(coordinates[1]),
      longitude: Number(coordinates[0]),
      postcode: String(properties.postcode || '').match(/\b\d{6}\b/)?.[0] || null,
      state: String(properties.state || ''),
      resultType: String(properties.result_type || ''),
      confidence: Number(properties.rank?.confidence || 0),
      streetConfidence: Number(properties.rank?.confidence_street_level || 0),
      matchType: String(properties.rank?.match_type || ''),
      formatted: String(properties.formatted || ''),
    };
  } catch (error) {
    // Geocoding is an enhancement for precise street pricing. A timeout,
    // provider error, or network interruption must not bypass the local
    // postcode-coordinate fallback in resolveDestination(). Do not log the
    // URL because it contains the provider API key, or the address because
    // it may contain customer data.
    console.warn('Delivery geocoding is temporarily unavailable.');
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

async function resolveOrigin(db, settings) {
  let latitude = Number(settings.origin_latitude);
  let longitude = Number(settings.origin_longitude);
  if (validCoordinates(latitude, longitude)) return { latitude, longitude };
  const resolved = await geocodeAddress(settings.origin_address || DEFAULT_ORIGIN_ADDRESS);
  if (!resolved) throw new Error('RedVeg business address could not be located. Check GEOAPIFY_API_KEY and the delivery origin settings.');
  for (const [key, value] of [['origin_latitude', resolved.latitude], ['origin_longitude', resolved.longitude]]) {
    await db.execute({
      sql: `INSERT INTO delivery_pricing_settings (setting_key, setting_value) VALUES (?, ?)
        ON CONFLICT(setting_key) DO UPDATE SET setting_value = excluded.setting_value, updated_at = CURRENT_TIMESTAMP`,
      args: [key, String(value)],
    });
  }
  return resolved;
}

async function resolveDestination(destination = {}, postalLocation = null) {
  const pincode = String(destination.pincode || '').trim();
  const addressLine = String(destination.addressLine || '').trim();
  if (destination.source === 'geolocation' && validCoordinates(destination.latitude, destination.longitude)) {
    const latitude = Number(destination.latitude);
    const longitude = Number(destination.longitude);
    if (!isKolkataRegion(latitude, longitude)) {
      throw new DeliveryQuoteError('The detected location is outside the Kolkata delivery area. Choose a valid Kolkata delivery location.', 422);
    }
    const accuracy = Number(destination.accuracy);
    if (Number.isFinite(accuracy) && accuracy > 1000) {
      throw new DeliveryQuoteError('Your detected location is too imprecise to calculate delivery. Try detecting your location again.', 422);
    }
    return { latitude, longitude, precision: 'gps', accuracy: Number.isFinite(accuracy) ? accuracy : null, formatted: '' };
  }
  const hasSpecificAddress = addressLine.length >= 6;
  if (hasSpecificAddress && /^\d{6}$/.test(pincode)) {
    // Do not include the directory's area label here: some active records have
    // incorrect labels. A wrong locality can pull geocoding away from the
    // customer's typed street address even when the pincode is correct.
    const landmark = String(destination.landmark || '').trim();
    const address = [addressLine, landmark ? `near ${landmark}` : '', pincode, destination.city || 'Kolkata', destination.state || 'West Bengal', 'India']
      .map(value => String(value || '').trim()).filter(Boolean).join(', ');
    const exactAddress = await geocodeAddress(address, pincode);
    const isStreetLevel = exactAddress && ['building', 'street', 'amenity'].includes(exactAddress.resultType);
    const isConfident = exactAddress && exactAddress.confidence >= 0.7 &&
      (exactAddress.streetConfidence === 0 || exactAddress.streetConfidence >= 0.7);
    if (exactAddress && isStreetLevel && isConfident) {
      return { ...exactAddress, precision: 'street_address' };
    }
  }

  // Keep valid street matches for precise pricing. When a geocoder cannot
  // confidently match a typed address, use a known serviceable postcode point
  // so customers are not blocked by address-provider coverage or outages.
  if (postalLocation && validCoordinates(postalLocation.latitude, postalLocation.longitude) &&
      isKolkataRegion(postalLocation.latitude, postalLocation.longitude)) {
    return {
      latitude: Number(postalLocation.latitude),
      longitude: Number(postalLocation.longitude),
      precision: 'pincode_estimate',
      formatted: postalLocation.area ? `${postalLocation.area}, ${postalLocation.city || 'Kolkata'}, ${postalLocation.state || 'West Bengal'} ${pincode}` : '',
    };
  }
  const knownPostcode = POSTAL_COORDINATES.get(pincode);
  if (knownPostcode && isKolkataRegion(knownPostcode.latitude, knownPostcode.longitude)) {
    return { ...knownPostcode, precision: 'pincode_estimate' };
  }

  const city = destination.city || postalLocation?.city || 'Kolkata';
  const state = destination.state || postalLocation?.state || 'West Bengal';
  // Prefer the customer's locality over old directory labels. Some imported
  // serviceability rows used placeholder area names, which can steer postcode
  // geocoding to the wrong part of Kolkata.
  const areaCandidates = [...new Set([
    destination.area,
    destination.locality,
    postalLocation?.area,
    '',
  ].map(value => String(value || '').trim()).filter((value, index, values) => values.indexOf(value) === index))];
  let resolved = null;
  for (const area of areaCandidates) {
    const address = [area, pincode, city, state, 'India'].filter(Boolean).join(', ');
    if (address.length < 5) continue;
    resolved = await geocodeAddress(address, /^\d{6}$/.test(pincode) ? pincode : null);
    if (resolved && isKolkataRegion(resolved.latitude, resolved.longitude)) break;
    resolved = null;
  }
  if (!resolved) {
    throw new DeliveryQuoteError('This serviceable pincode does not have a mapped delivery point yet. Contact RedVeg so we can enable delivery pricing for this area.', 422);
  }
  return { ...resolved, precision: 'pincode_estimate' };
}

function isKolkataRegion(latitude, longitude) {
  return Number(latitude) >= 22.2 && Number(latitude) <= 23 && Number(longitude) >= 88 && Number(longitude) <= 88.8;
}

async function getDrivingDistanceMeters(origin, destination) {
  const apiKey = String(process.env.GEOAPIFY_API_KEY || '').trim();
  if (apiKey) {
    const url = new URL('https://api.geoapify.com/v1/routing');
    url.searchParams.set('waypoints', `${origin.latitude},${origin.longitude}|${destination.latitude},${destination.longitude}`);
    url.searchParams.set('mode', 'drive');
    url.searchParams.set('apiKey', apiKey);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    try {
      const response = await fetch(url, { signal: controller.signal });
      if (!response.ok) throw new Error(`Route lookup returned HTTP ${response.status}`);
      const payload = await response.json();
      const meters = Number(payload?.features?.[0]?.properties?.distance);
      if (Number.isFinite(meters) && meters >= 0) return { meters, method: 'road', provider: 'Geoapify' };
    } catch (error) {
      // Try the independent OSRM router if Geoapify is temporarily unavailable.
    } finally {
      clearTimeout(timeout);
    }
  }

  const osrmUrl = `https://router.project-osrm.org/route/v1/driving/${origin.longitude},${origin.latitude};${destination.longitude},${destination.latitude}?overview=false&alternatives=false&steps=false`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch(osrmUrl, { signal: controller.signal });
    if (!response.ok) throw new Error(`Route lookup returned HTTP ${response.status}`);
    const payload = await response.json();
    const meters = Number(payload?.routes?.[0]?.distance);
    if (payload?.code === 'Ok' && Number.isFinite(meters) && meters >= 0) return { meters, method: 'road', provider: 'OSRM' };
  } catch (error) {
    // Never substitute a straight-line estimate for a driving fee.
  } finally {
    clearTimeout(timeout);
  }
  throw new DeliveryQuoteError('A driving route could not be calculated right now. Please retry in a moment; no estimated distance was used.', 503);
}

async function quoteDeliveryFee(destination, options = {}) {
  const pincode = String(destination?.pincode || '').trim();
  if (!/^\d{6}$/.test(pincode)) {
    throw new DeliveryQuoteError('Choose a valid six-digit delivery pincode.', 400);
  }
  const locationsDb = await getDatabaseConnection('availablePincodes');
  const locationResult = await locationsDb.execute({
    sql: 'SELECT is_serviceable, area, city, state, latitude, longitude FROM available_pincodes WHERE pincode = ?',
    args: [pincode],
  });
  if (!locationResult.rows.length) {
    throw new DeliveryQuoteError('This pincode is not listed for RedVeg delivery. Contact us to check availability.');
  }
  if (Number(locationResult.rows[0].is_serviceable) !== 1) {
    throw new DeliveryQuoteError('Delivery is currently unavailable in this area. Choose another location or contact RedVeg.');
  }

  const catalogDb = await getDatabaseConnection('catalog');
  const settings = await readPricingSettings(catalogDb);
  const origin = await resolveOrigin(catalogDb, settings);
  const target = await resolveDestination(destination, locationResult.rows[0]);
  const distance = await getDrivingDistanceMeters(origin, target);
  const distanceKm = Math.round((distance.meters / 1000 + Number.EPSILON) * 100) / 100;
  const ratePerKm = Number(settings.rate_per_km) || DEFAULT_RATE_PER_KM;
  const freeDeliveryEnabled = false;
  const calculatedDeliveryFee = roundMoney(distanceKm * ratePerKm);
  return {
    originAddress: settings.origin_address || DEFAULT_ORIGIN_ADDRESS,
    distanceKm,
    ratePerKm,
    deliveryFee: calculatedDeliveryFee,
    calculatedDeliveryFee,
    freeDeliveryEnabled,
    deliveryRadiusKm: null,
    distanceMethod: distance.method,
    distanceProvider: distance.provider,
    locationPrecision: target.precision,
    matchedDestinationAddress: target.formatted || null,
    originLatitude: origin.latitude,
    originLongitude: origin.longitude,
    destinationLatitude: target.latitude,
    destinationLongitude: target.longitude,
  };
}

async function getDeliveryPricingSettings() {
  const db = await getDatabaseConnection('catalog');
  const settings = await readPricingSettings(db);
  return {
    originAddress: settings.origin_address || DEFAULT_ORIGIN_ADDRESS,
    ratePerKm: Number(settings.rate_per_km) || DEFAULT_RATE_PER_KM,
    deliveryRadiusKm: null,
    freeDeliveryEnabled: false,
  };
}

async function updateDeliveryPricingSettings(updates = {}) {
  const db = await getDatabaseConnection('catalog');
  await ensureDeliveryPricingSchema(db);
  const allowed = {
    originAddress: ['origin_address', value => typeof value === 'string' && value.trim().length >= 8 && value.trim().length <= 300 ? value.trim() : null],
    ratePerKm: ['rate_per_km', value => Number.isFinite(Number(value)) && Number(value) > 0 && Number(value) <= 100000 ? String(Number(value)) : null],
  };
  for (const [field, [key, normalize]] of Object.entries(allowed)) {
    if (!Object.prototype.hasOwnProperty.call(updates, field)) continue;
    const value = normalize(updates[field]);
    if (value === null) throw Object.assign(new Error(`Invalid value for ${field}.`), { statusCode: 400 });
    await db.execute({
      sql: `INSERT INTO delivery_pricing_settings (setting_key, setting_value) VALUES (?, ?)
        ON CONFLICT(setting_key) DO UPDATE SET setting_value = excluded.setting_value, updated_at = CURRENT_TIMESTAMP`,
      args: [key, value],
    });
    if (field === 'originAddress') {
      // Coordinates cached for the old business address must never be reused
      // after an admin changes that address.
      await db.execute({
        sql: "DELETE FROM delivery_pricing_settings WHERE setting_key IN ('origin_latitude', 'origin_longitude')",
        args: [],
      });
    }
  }
  return getDeliveryPricingSettings();
}

module.exports = { DeliveryQuoteError, quoteDeliveryFee, getDeliveryPricingSettings, updateDeliveryPricingSettings, ensureDeliveryPricingSchema };
