const fs = require('fs');
const path = require('path');
const { initializeDatabaseConnections, getDatabaseConnection } = require('../server/config/turso');

const SOURCE_PATH = path.join(__dirname, '..', 'data', 'scribd-kolkata-pincodes-2014-missing.json');
const BACKUP_DIR = path.join(__dirname, '..', '.work', 'delivery-location-backups');

async function syncScribdKolkataPincodes() {
  const source = JSON.parse(fs.readFileSync(SOURCE_PATH, 'utf8'));
  const rows = source.postalCodes;
  const unique = new Set(rows.map(row => row.pincode));
  if (!rows.length || unique.size !== rows.length || rows.some(row => !/^\d{6}$/.test(row.pincode) || !row.area)) {
    throw new Error('The import list has invalid or duplicate postal records.');
  }

  await initializeDatabaseConnections();
  const db = await getDatabaseConnection('availablePincodes');
  const before = await db.execute({
    sql: 'SELECT pincode, area, city, state, is_serviceable, latitude, longitude, created_at, updated_at FROM available_pincodes ORDER BY pincode',
    args: [],
  });
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  const backupPath = path.join(BACKUP_DIR, `available-pincodes-before-scribd-sync-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
  fs.writeFileSync(backupPath, JSON.stringify({ capturedAt: new Date().toISOString(), rows: before.rows }, null, 2));

  const existing = new Set(before.rows.map(row => String(row.pincode).trim()));
  const additions = rows.filter(row => !existing.has(row.pincode));
  const transaction = await db.transaction('write');
  try {
    for (const location of additions) {
      await transaction.execute({
        sql: `INSERT INTO available_pincodes
          (pincode, area, city, state, is_serviceable, latitude, longitude, updated_at)
          VALUES (?, ?, 'Kolkata', 'West Bengal', 0, NULL, NULL, CURRENT_TIMESTAMP)
          ON CONFLICT(pincode) DO NOTHING`,
        args: [location.pincode, location.area],
      });
    }
    await transaction.commit();
  } catch (error) {
    await transaction.rollback().catch(() => {});
    throw error;
  }

  const verification = await db.execute({
    sql: `SELECT pincode, area, is_serviceable FROM available_pincodes
      WHERE pincode IN (${rows.map(() => '?').join(',')}) ORDER BY pincode`,
    args: rows.map(row => row.pincode),
  });
  const missing = rows.filter(location => !verification.rows.some(row => String(row.pincode) === location.pincode));
  const enabledAdditions = additions.filter(location => {
    const persisted = verification.rows.find(row => String(row.pincode) === location.pincode);
    return persisted && Number(persisted.is_serviceable) !== 0;
  });
  if (missing.length || enabledAdditions.length) {
    throw new Error(`Verification failed. Missing: ${missing.map(row => row.pincode).join(', ') || 'none'}; unexpectedly enabled: ${enabledAdditions.map(row => row.pincode).join(', ') || 'none'}`);
  }

  console.log(JSON.stringify({
    source: source.sourceUrl,
    sourceEntriesCompared: rows.length,
    insertedUnavailable: additions.length,
    existingRecordsPreserved: rows.length - additions.length,
    verifiedEntries: verification.rows.length,
    otherExistingRecordsPreserved: before.rows.length - existing.size,
    backupPath,
  }, null, 2));
}

if (require.main === module) {
  syncScribdKolkataPincodes().catch(error => {
    console.error(`Scribd Kolkata PIN-code sync failed: ${error.message}`);
    process.exitCode = 1;
  });
}

module.exports = { syncScribdKolkataPincodes };
