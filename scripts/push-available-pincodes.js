const { getDatabaseConnection, initializeDatabaseConnections } = require('../server/config/turso');
const { generateValidationError } = require('../server/utils/error-classes');
const ACTIVE_POSTAL_FALLBACKS = new Map(
  require('../data/active-delivery-pincode-fallbacks.json').postalCodes.map(location => [location.pincode, location])
);

const PINCODE_DATA = [
  ['700001', 'Kolkata GPO', 'Kolkata', 'West Bengal', 1, null, null],
  ['700002', 'Park Circus', 'Kolkata', 'West Bengal', 1, null, null],
  ['700003', 'Bowbazar', 'Kolkata', 'West Bengal', 1, null, null],
  ['700004', 'Shyambazar', 'Kolkata', 'West Bengal', 1, null, null],
  ['700005', 'Sovabazar', 'Kolkata', 'West Bengal', 1, null, null],
  ['700006', 'Burtolla', 'Kolkata', 'West Bengal', 1, null, null],
  ['700007', 'Colootola', 'Kolkata', 'West Bengal', 1, null, null],
  ['700008', 'Taltala', 'Kolkata', 'West Bengal', 1, null, null],
  ['700009', 'Bhawanipur', 'Kolkata', 'West Bengal', 1, null, null],
  ['700010', 'Kalikapur', 'Kolkata', 'West Bengal', 1, null, null],
  ['700011', 'Topsia', 'Kolkata', 'West Bengal', 1, null, null],
  ['700012', 'Phoolbagan', 'Kolkata', 'West Bengal', 1, null, null],
  ['700013', 'Manicktala', 'Kolkata', 'West Bengal', 1, null, null],
  ['700014', 'Park Street', 'Kolkata', 'West Bengal', 1, null, null],
  ['700015', 'Shakespeare Sarani', 'Kolkata', 'West Bengal', 1, null, null],
  ['700016', 'Camac Street', 'Kolkata', 'West Bengal', 1, null, null],
  ['700017', 'Chowringhee', 'Kolkata', 'West Bengal', 1, null, null],
  ['700018', 'Park Lane', 'Kolkata', 'West Bengal', 1, null, null],
  ['700019', 'Lord Sinha Road', 'Kolkata', 'West Bengal', 1, null, null],
  ['700020', 'Russel Street', 'Kolkata', 'West Bengal', 1, null, null],
  ['700021', 'Shakespeare Sarani', 'Kolkata', 'West Bengal', 1, null, null],
  ['700022', 'Park Street', 'Kolkata', 'West Bengal', 1, null, null],
  ['700023', 'Camac Street', 'Kolkata', 'West Bengal', 1, null, null],
  ['700024', 'Chowringhee Road', 'Kolkata', 'West Bengal', 1, null, null],
  ['700025', 'Park Street', 'Kolkata', 'West Bengal', 1, null, null],
  ['700026', 'Lord Sinha Road', 'Kolkata', 'West Bengal', 1, null, null],
  ['700027', 'Russel Street', 'Kolkata', 'West Bengal', 1, null, null],
  ['700028', 'Shakespeare Sarani', 'Kolkata', 'West Bengal', 1, null, null],
  ['700029', 'Park Street', 'Kolkata', 'West Bengal', 1, null, null],
  ['700030', 'Camac Street', 'Kolkata', 'West Bengal', 1, null, null],
  ['700031', 'Chowringhee', 'Kolkata', 'West Bengal', 1, null, null],
  ['700032', 'Park Lane', 'Kolkata', 'West Bengal', 1, null, null],
  ['700033', 'Lord Sinha Road', 'Kolkata', 'West Bengal', 1, null, null],
  ['700034', 'Russel Street', 'Kolkata', 'West Bengal', 1, null, null],
  ['700035', 'Shakespeare Sarani', 'Kolkata', 'West Bengal', 1, null, null],
  ['700036', 'Park Street', 'Kolkata', 'West Bengal', 1, null, null],
  ['700037', 'Camac Street', 'Kolkata', 'West Bengal', 1, null, null],
  ['700038', 'Chowringhee', 'Kolkata', 'West Bengal', 1, null, null],
  ['700039', 'Park Lane', 'Kolkata', 'West Bengal', 1, null, null],
  ['700040', 'Lord Sinha Road', 'Kolkata', 'West Bengal', 1, null, null],
  ['700041', 'Russel Street', 'Kolkata', 'West Bengal', 1, null, null],
  ['700042', 'Shakespeare Sarani', 'Kolkata', 'West Bengal', 1, null, null],
  ['700043', 'Park Street', 'Kolkata', 'West Bengal', 1, null, null],
  ['700044', 'Camac Street', 'Kolkata', 'West Bengal', 1, null, null],
  ['700045', 'Chowringhee', 'Kolkata', 'West Bengal', 1, null, null],
  ['700046', 'Park Lane', 'Kolkata', 'West Bengal', 1, null, null],
  ['700047', 'Lord Sinha Road', 'Kolkata', 'West Bengal', 1, null, null],
  ['700048', 'Russel Street', 'Kolkata', 'West Bengal', 1, null, null],
  ['700049', 'Shakespeare Sarani', 'Kolkata', 'West Bengal', 1, null, null],
  ['700050', 'Park Street', 'Kolkata', 'West Bengal', 1, null, null],
  ['700051', 'Camac Street', 'Kolkata', 'West Bengal', 1, null, null],
  ['700052', 'Chowringhee', 'Kolkata', 'West Bengal', 1, null, null],
  ['700053', 'Lord Sinha Road', 'Kolkata', 'West Bengal', 1, null, null],
  ['700054', 'Russel Street', 'Kolkata', 'West Bengal', 1, null, null],
  ['700055', 'Shakespeare Sarani', 'Kolkata', 'West Bengal', 1, null, null],
  ['700056', 'Park Street', 'Kolkata', 'West Bengal', 1, null, null],
  ['700057', 'Camac Street', 'Kolkata', 'West Bengal', 1, null, null],
  ['700058', 'Chowringhee', 'Kolkata', 'West Bengal', 1, null, null],
  // Keep the Baguiati reference point for PIN 700059. Its routed distance from
  // the configured RedVeg origin is approximately 8.8 km.
  ['700059', 'Baguiati', 'Kolkata', 'West Bengal', 1, 22.6094952294, 88.4359881952],
  ['700060', 'Lord Sinha Road', 'Kolkata', 'West Bengal', 1, null, null],
  ['700061', 'Russel Street', 'Kolkata', 'West Bengal', 1, null, null],
  ['700062', 'Shakespeare Sarani', 'Kolkata', 'West Bengal', 1, null, null],
  ['700063', 'Park Street', 'Kolkata', 'West Bengal', 1, null, null],
  ['700064', 'Camac Street', 'Kolkata', 'West Bengal', 1, null, null],
  ['700065', 'Dumdum', 'Kolkata', 'West Bengal', 1, null, null],
  ['700066', 'Dumdum Cantonment', 'Kolkata', 'West Bengal', 1, null, null],
  ['700067', 'Jorasanko', 'Kolkata', 'West Bengal', 1, null, null],
  ['700068', 'Bagbazar', 'Kolkata', 'West Bengal', 1, null, null],
  ['700069', 'Shyambazar', 'Kolkata', 'West Bengal', 1, null, null],
  ['700070', 'Cossipore', 'Kolkata', 'West Bengal', 1, null, null]
];

async function run() {
  let db;

  try {
    console.log('Initializing database connections...');
    await initializeDatabaseConnections();

    console.log('Connecting to Turso database for available pincodes...');
    db = await getDatabaseConnection('availablePincodes');
    console.log('Connected successfully');

    // Ensure the table exists with correct schema
    console.log('Ensuring available_pincodes table exists...');
    await db.execute(`
      CREATE TABLE IF NOT EXISTS available_pincodes (
        pincode TEXT PRIMARY KEY,
        area TEXT NOT NULL,
        city TEXT NOT NULL,
        state TEXT NOT NULL,
        is_serviceable INTEGER NOT NULL DEFAULT 1 CHECK (is_serviceable IN (0, 1)),
        latitude REAL,
        longitude REAL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create indexes for better query performance
    console.log('Creating indexes...');
    await db.execute(`CREATE INDEX IF NOT EXISTS idx_available_pincodes_is_serviceable ON available_pincodes(is_serviceable)`);
    await db.execute(`CREATE INDEX IF NOT EXISTS idx_available_pincodes_city ON available_pincodes(city)`);
    await db.execute(`CREATE INDEX IF NOT EXISTS idx_available_pincodes_state ON available_pincodes(state)`);

    // Import/upsert the data
    console.log(`Importing ${PINCODE_DATA.length} pincode records...`);

    let importedCount = 0;
    let skippedCount = 0;

    for (const [pincode, area, city, state, isServiceable, latitude, longitude] of PINCODE_DATA) {
      try {
        const fallback = ACTIVE_POSTAL_FALLBACKS.get(pincode);
        const deliveryLatitude = latitude ?? fallback?.latitude ?? null;
        const deliveryLongitude = longitude ?? fallback?.longitude ?? null;
        // Validate pincode
        if (!/^\d{6}$/.test(pincode)) {
          console.warn(`Skipping invalid pincode format: ${pincode}`);
          skippedCount++;
          continue;
        }

        // Validate area, city, state
        if (!area || !city || !state) {
          console.warn(`Skipping record with missing required fields: ${pincode}`);
          skippedCount++;
          continue;
        }

        // Validate latitude and longitude if provided
        if (deliveryLatitude !== null && (typeof deliveryLatitude !== 'number' || deliveryLatitude < -90 || deliveryLatitude > 90)) {
          console.warn(`Skipping invalid latitude for pincode ${pincode}: ${deliveryLatitude}`);
          skippedCount++;
          continue;
        }

        if (deliveryLongitude !== null && (typeof deliveryLongitude !== 'number' || deliveryLongitude < -180 || deliveryLongitude > 180)) {
          console.warn(`Skipping invalid longitude for pincode ${pincode}: ${deliveryLongitude}`);
          skippedCount++;
          continue;
        }

        // Upsert the record - preserve existing is_serviceable values (don't overwrite admin availability settings)
        const result = await db.execute({
          sql: `
            INSERT INTO available_pincodes
              (pincode, area, city, state, is_serviceable, latitude, longitude, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
            ON CONFLICT(pincode) DO UPDATE SET
              latitude = COALESCE(excluded.latitude, available_pincodes.latitude),
              longitude = COALESCE(excluded.longitude, available_pincodes.longitude),
              updated_at = CURRENT_TIMESTAMP
          `,
            args: [pincode, area, city, state, isServiceable ? 1 : 0, deliveryLatitude, deliveryLongitude]
        });

        if (result.rowsAffected > 0) {
          importedCount++;
        } else {
          skippedCount++;
        }
      } catch (error) {
        console.error(`Error processing pincode ${pincode}:`, error.message);
        skippedCount++;
      }
    }

    console.log(`Import completed:`);
    console.log(`  - Successfully imported: ${importedCount} records`);
    console.log(`  - Skipped: ${skippedCount} records`);
    console.log(`  - Total processed: ${importedCount + skippedCount} records`);

    // Show final count
    const countResult = await db.execute({
      sql: 'SELECT COUNT(*) as total, SUM(is_serviceable) as serviceable FROM available_pincodes',
      args: []
    });

    const total = countResult.rows[0].total;
    const serviceable = countResult.rows[0].serviceable;

    console.log(`Final database state:`);
    console.log(`  - Total records: ${total}`);
    console.log(`  - Serviceable records: ${serviceable}`);
    console.log(`  - Unserviceable records: ${total - serviceable}`);

  } catch (error) {
    console.error('Failed to import pincode data:', error);
    process.exit(1);
  } finally {
    // Note: We don't explicitly close the connection as the pool manages it
  }
}

// Run the import if this script is executed directly
if (require.main === module) {
  run().catch(error => {
    console.error('Script execution failed:', error);
    process.exit(1);
  });
}

module.exports = { run };
