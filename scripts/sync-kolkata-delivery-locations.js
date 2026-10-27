const fs = require('fs');
const path = require('path');
const { getDatabaseConnection, initializeDatabaseConnections } = require('../server/config/turso');

const SOURCE_PATH = path.join(__dirname, '..', 'data', 'kolkata-postal-locations-2026-06.json');
const BACKUP_DIR = path.join(__dirname, '..', '.work', 'delivery-location-backups');

function cleanOfficeName(value) {
  return String(value || '')
    .replace(/\s+Kolkata$/i, '')
    .replace(/\s+(?:S\.O\.|H\.O\.|SO|HO|PO|BO)$/i, '')
    .trim();
}

async function syncKolkataDeliveryLocations() {
  const source = JSON.parse(fs.readFileSync(SOURCE_PATH, 'utf8'));
  const locations = source.postalCodes;
  if (!Array.isArray(locations) || locations.length !== 73) {
    throw new Error(`Expected 73 standard Kolkata postal codes; received ${locations?.length ?? 0}.`);
  }
  for (const location of locations) {
    if (!/^\d{6}$/.test(location.pincode) || !location.area || location.city !== 'Kolkata' || location.state !== 'West Bengal') {
      throw new Error(`Invalid Kolkata postal directory record: ${JSON.stringify(location)}`);
    }
  }

  await initializeDatabaseConnections();
  const db = await getDatabaseConnection('availablePincodes');
  const before = await db.execute({
    sql: 'SELECT pincode, area, city, state, is_serviceable, latitude, longitude, created_at, updated_at FROM available_pincodes ORDER BY pincode',
    args: [],
  });

  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  const backupPath = path.join(BACKUP_DIR, `available-pincodes-before-kolkata-sync-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
  fs.writeFileSync(backupPath, JSON.stringify({ capturedAt: new Date().toISOString(), rows: before.rows }, null, 2));

  const originalByPincode = new Map(before.rows.map(row => [String(row.pincode), row]));
  const transaction = await db.transaction('write');
  let inserted = 0;
  let metadataUpdated = 0;
  try {
    for (const location of locations) {
      const pincode = String(location.pincode);
      const area = cleanOfficeName(location.sourceOffice || location.area);
      if (originalByPincode.has(pincode)) {
        // Refresh the postal label while preserving admin availability and all coordinates
        // already used by delivery-fee estimates.
        await transaction.execute({
          sql: 'UPDATE available_pincodes SET area = ?, city = ?, state = ?, updated_at = CURRENT_TIMESTAMP WHERE pincode = ?',
          args: [area, 'Kolkata', 'West Bengal', pincode],
        });
        metadataUpdated += 1;
      } else {
        // Postal inclusion is not proof that RedVeg serves the address. New entries start
        // unavailable and the admin can enable them from Delivery areas after review.
        await transaction.execute({
          sql: `INSERT INTO available_pincodes
            (pincode, area, city, state, is_serviceable, latitude, longitude, updated_at)
            VALUES (?, ?, 'Kolkata', 'West Bengal', 0, NULL, NULL, CURRENT_TIMESTAMP)
            ON CONFLICT(pincode) DO UPDATE SET
              area = excluded.area,
              city = excluded.city,
              state = excluded.state,
              is_serviceable = 0,
              updated_at = CURRENT_TIMESTAMP`,
          args: [pincode, area],
        });
        inserted += 1;
      }
    }
    await transaction.commit();
  } catch (error) {
    await transaction.rollback().catch(() => {});
    throw error;
  }

  const after = await db.execute({
    sql: `SELECT pincode, area, city, state, is_serviceable
      FROM available_pincodes WHERE pincode IN (${locations.map(() => '?').join(',')}) ORDER BY pincode`,
    args: locations.map(location => location.pincode),
  });
  const missing = locations.map(location => location.pincode).filter(pincode => !after.rows.some(row => String(row.pincode) === pincode));
  if (missing.length) throw new Error(`Post-sync verification failed for: ${missing.join(', ')}`);

  const outsideRows = await db.execute({
    sql: 'SELECT COUNT(*) AS total FROM available_pincodes WHERE pincode NOT IN (' + locations.map(() => '?').join(',') + ')',
    args: locations.map(location => location.pincode),
  });
  console.log(JSON.stringify({
    source: source.source,
    postalCodes: locations.length,
    inserted,
    postalLabelsRefreshed: metadataUpdated,
    serviceableCount: after.rows.filter(row => Number(row.is_serviceable) === 1).length,
    unavailableCount: after.rows.filter(row => Number(row.is_serviceable) !== 1).length,
    missing,
    unrelatedRowsPreserved: Number(outsideRows.rows[0]?.total || 0),
    backupPath,
  }, null, 2));
}

if (require.main === module) {
  syncKolkataDeliveryLocations().catch(error => {
    console.error('Kolkata delivery-location sync failed:', error.message);
    process.exitCode = 1;
  });
}

module.exports = { cleanOfficeName, syncKolkataDeliveryLocations };
