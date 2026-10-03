const { getDatabaseConnection } = require('../../../config/turso');
const { generateNotFoundError, generateValidationError } = require('../../../utils/error-classes');
const logger = require('../../../utils/logger');

/**
 * Get delivery locations with filtering
 * @route GET /api/v1/delivery-locations
 */
const getLocations = async (req, res) => {
  try {
    const { serviceableOnly, limit, offset } = req.query;

    let sql = 'SELECT * FROM available_pincodes';
    const args = [];
    const conditions = [];

    // Add filtering conditions
    if (serviceableOnly !== undefined) {
      conditions.push('is_serviceable = ?');
      args.push(serviceableOnly === 'true' ? 1 : 0);
    }

    if (conditions.length > 0) {
      sql += ' WHERE ' + conditions.join(' AND ');
    }

    sql += ' ORDER BY pincode';

    // Add pagination
    if (limit !== undefined) {
      sql += ' LIMIT ?';
      args.push(parseInt(limit));
    }

    if (offset !== undefined) {
      sql += ' OFFSET ?';
      args.push(parseInt(offset));
    }

    const db = await getDatabaseConnection('availablePincodes');
    const result = await db.execute({ sql, args });

    // Format for frontend compatibility
    const locations = result.rows.map(location => ({
      pincode: location.pincode,
      area: location.area || '',
      city: location.city || '',
      state: location.state || '',
      isServiceable: location.is_serviceable === 1
    }));

    res.status(200).json({
      success: true,
      count: locations.length,
      data: locations
    });
  } catch (error) {
    if (error.type === 'validation-error') {
      return res.status(400).json({
        success: false,
        message: error.message
      });
    }

    logger.error('Error fetching delivery locations:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

/**
 * Get delivery location by pincode
 * @route GET /api/v1/delivery-locations/:pincode
 */
const getLocationByPincode = async (req, res) => {
  try {
    const { pincode } = req.params;

    // Validate pincode format
    if (!/^\d{6}$/.test(pincode)) {
      throw generateValidationError('Invalid pincode format');
    }

    const db = await getDatabaseConnection('availablePincodes');
    const result = await db.execute({
      sql: 'SELECT * FROM available_pincodes WHERE pincode = ?',
      args: [pincode]
    });

    if (result.rows.length === 0) {
      throw generateNotFoundError('Delivery location not found');
    }

    const location = result.rows[0];

    res.status(200).json({
      success: true,
      data: {
        pincode: location.pincode,
        area: location.area || '',
        city: location.city || '',
        state: location.state || '',
        isServiceable: location.is_serviceable === 1
      }
    });
  } catch (error) {
    if (error.type === 'validation-error') {
      return res.status(400).json({
        success: false,
        message: error.message
      });
    }

    if (error.type === 'not-found') {
      return res.status(404).json({
        success: false,
        message: error.message
      });
    }

    logger.error('Error fetching delivery location by pincode:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

/**
 * Search delivery locations by area/city/state
 * @route GET /api/v1/delivery-locations/search
 */
const searchLocations = async (req, res) => {
  try {
    const { q, limit, offset, serviceableOnly } = req.query;

    if (!q) {
      throw generateValidationError('Search query is required');
    }

    let sql = `
      SELECT * FROM available_pincodes
      WHERE (area LIKE ?
         OR city LIKE ?
         OR state LIKE ?
         OR pincode LIKE ?)
    `;
    const args = [`%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`];

    if (serviceableOnly === 'true') {
      sql += ' AND is_serviceable = 1';
    }

    // Add pagination
    if (limit !== undefined) {
      sql += ' LIMIT ?';
      args.push(parseInt(limit));
    }

    if (offset !== undefined) {
      sql += ' OFFSET ?';
      args.push(parseInt(offset));
    }

    const db = await getDatabaseConnection('availablePincodes');
    const result = await db.execute({ sql, args });

    // Format for frontend compatibility
    const locations = result.rows.map(location => ({
      pincode: location.pincode,
      area: location.area || '',
      city: location.city || '',
      state: location.state || '',
      isServiceable: location.is_serviceable === 1
    }));

    res.status(200).json({
      success: true,
      count: locations.length,
      data: locations
    });
  } catch (error) {
    if (error.type === 'validation-error') {
      return res.status(400).json({
        success: false,
        message: error.message
      });
    }

    logger.error('Error searching delivery locations:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

/**
 * Reverse geocode latitude/longitude to get location details
 * @route POST /api/v1/delivery-locations/reverse-geocode
 */
const reverseGeocode = async (req, res) => {
  try {
    const { latitude, longitude } = req.body;

    // Validate input
    if (typeof latitude !== 'number' || typeof longitude !== 'number') {
      throw generateValidationError('Latitude and longitude must be numbers');
    }

    // Validate coordinate ranges
    if (latitude < -90 || latitude > 90) {
      throw generateValidationError('Latitude must be between -90 and 90 degrees');
    }

    if (longitude < -180 || longitude > 180) {
      throw generateValidationError('Longitude must be between -180 and 180 degrees');
    }

    // 1. Try Geoapify Reverse Geocoding API first. The key is server-side only;
    // never expose it in the browser bundle.
    let extractedPincode = null;
    try {
      const apiKey = String(process.env.GEOAPIFY_API_KEY || '').trim();
      if (apiKey) {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 7000);
        const geocodeUrl = new URL('https://api.geoapify.com/v1/geocode/reverse');
        geocodeUrl.searchParams.set('lat', String(latitude));
        geocodeUrl.searchParams.set('lon', String(longitude));
        geocodeUrl.searchParams.set('apiKey', apiKey);
        geocodeUrl.searchParams.set('lang', 'en');

        let geoResponse;
        try {
          geoResponse = await fetch(geocodeUrl, { signal: controller.signal });
        } finally {
          clearTimeout(timeout);
        }

        if (!geoResponse.ok) {
          throw new Error(`Geoapify returned HTTP ${geoResponse.status}`);
        }
        const geoData = await geoResponse.json();

        if (Array.isArray(geoData.features)) {
          for (const feature of geoData.features) {
            const properties = feature?.properties || {};
            const postcode = properties.postcode || properties.post_code || properties.postal_code;
            const normalizedPincode = String(postcode || '').match(/\b\d{6}\b/)?.[0];
            if (normalizedPincode) {
              extractedPincode = normalizedPincode;
              break;
            }
          }
        }
      }
    } catch (e) {
      logger.warn('Geoapify reverse geocoding failed; using database fallback:', e.message);
    }

    const db = await getDatabaseConnection('availablePincodes');
    let location = null;

    if (extractedPincode) {
      // 2. Verify the extracted pincode against our local database
      const result = await db.execute({
        sql: 'SELECT * FROM available_pincodes WHERE pincode = ?',
        args: [extractedPincode]
      });

      if (result.rows.length > 0) {
        location = result.rows[0];
      }
    }

    // 3. Fallback: Find nearest location using Euclidean distance
    if (!location) {
      const sql = `
        SELECT * 
        FROM available_pincodes 
        WHERE latitude IS NOT NULL AND longitude IS NOT NULL
        ORDER BY ((latitude - ?) * (latitude - ?) + (longitude - ?) * (longitude - ?)) ASC
        LIMIT 1
      `;
      const args = [latitude, latitude, longitude, longitude];
      const result = await db.execute({ sql, args });
      
      if (result.rows.length === 0) {
        return res.status(200).json({
          success: false,
          code: 'LOCATION_NOT_FOUND',
          message: 'The location detected could not be found in our service database. Please search by pincode instead.'
        });
      }
      location = result.rows[0];
    }

    // Never mark an unavailable pincode as deliverable
    res.status(200).json({
      success: true,
      data: {
        pincode: location.pincode,
        area: location.area || '',
        city: location.city || '',
        state: location.state || '',
        isServiceable: location.is_serviceable === 1,
        latitude: location.latitude,
        longitude: location.longitude
      }
    });
  } catch (error) {
    if (error.type === 'validation-error') {
      return res.status(400).json({
        success: false,
        message: error.message
      });
    }

    if (error.type === 'not-found') {
      return res.status(404).json({
        success: false,
        message: error.message
      });
    }

    logger.error('Error reverse geocoding location:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

module.exports = {
  getLocations,
  getLocationByPincode,
  searchLocations,
  reverseGeocode
};
