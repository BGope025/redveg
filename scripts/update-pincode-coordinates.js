const { getDatabaseConnection, initializeDatabaseConnections } = require('../server/config/turso');

// Base coordinates for Kolkata
const BASE_LAT = 22.5726;
const BASE_LON = 88.3639;

// Only use verified area centroids here. Do not invent random coordinates:
// reverse-geocoding fallback must never silently point a customer to a wrong area.
const AREA_MAP = {
  'Kolkata GPO': { lat: 22.5736, lon: 88.3486 },
  'Dumdum': { lat: 22.6224, lon: 88.4239 },
  'Park Street': { lat: 22.5539, lon: 88.3524 },
  'Shyambazar': { lat: 22.6022, lon: 88.3732 },
  'Bhawanipur': { lat: 22.5348, lon: 88.3481 }
};

function getVerifiedCoordinates(area) {
  for (const [key, coords] of Object.entries(AREA_MAP)) {
    if (area.includes(key)) {
      return coords;
    }
  }
  return null;
}

async function run() {
  let db;

  try {
    console.log('Initializing database connections...');
    await initializeDatabaseConnections();

    console.log('Connecting to Turso database for available pincodes...');
    db = await getDatabaseConnection('availablePincodes');
    
    // Get all pincodes that don't have coordinates
    const result = await db.execute({
      sql: 'SELECT pincode, area FROM available_pincodes WHERE latitude IS NULL OR longitude IS NULL',
      args: []
    });

    const locations = result.rows;
    console.log(`Found ${locations.length} locations needing coordinates.`);

    let updatedCount = 0;

    for (const loc of locations) {
      const coords = getVerifiedCoordinates(loc.area);
      if (!coords) {
        console.warn(`Skipping ${loc.pincode}: no verified coordinates for ${loc.area}`);
        continue;
      }
      
      await db.execute({
        sql: 'UPDATE available_pincodes SET latitude = ?, longitude = ?, updated_at = CURRENT_TIMESTAMP WHERE pincode = ?',
        args: [coords.lat, coords.lon, loc.pincode]
      });
      
      updatedCount++;
    }

    console.log(`\nFinished! Successfully updated ${updatedCount}/${locations.length} locations with local Kolkata coordinates.`);

  } catch (error) {
    console.error('Script failed:', error);
    process.exit(1);
  }
}

run();
