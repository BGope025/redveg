const fs = require('fs');
const path = require('path');
const { getDatabaseConnection, initializeDatabaseConnections } = require('../server/config/turso');

async function repair() {
  const backupPath = process.argv[2];
  if (!backupPath) throw new Error('Pass the pre-sync backup JSON path as the first argument.');
  const backup = JSON.parse(fs.readFileSync(path.resolve(backupPath), 'utf8'));
  const source = require('../data/kolkata-postal-locations-2026-06.json');
  const existing = new Set(backup.rows.map(row => String(row.pincode)));
  const insertedDuringThisSync = source.postalCodes.filter(row => !existing.has(row.pincode)).map(row => row.pincode);
  await initializeDatabaseConnections();
  const db = await getDatabaseConnection('availablePincodes');
  const transaction = await db.transaction('write');
  try {
    for (const pincode of insertedDuringThisSync) {
      await transaction.execute({
        sql: 'UPDATE available_pincodes SET is_serviceable = 0, updated_at = CURRENT_TIMESTAMP WHERE pincode = ?',
        args: [pincode],
      });
    }
    await transaction.commit();
  } catch (error) {
    await transaction.rollback().catch(() => {});
    throw error;
  }
  const verification = await db.execute({
    sql: `SELECT pincode, is_serviceable FROM available_pincodes WHERE pincode IN (${insertedDuringThisSync.map(() => '?').join(',')}) ORDER BY pincode`,
    args: insertedDuringThisSync,
  });
  const enabled = verification.rows.filter(row => Number(row.is_serviceable) !== 0);
  if (enabled.length) throw new Error(`New postal rows still marked serviceable: ${enabled.map(row => row.pincode).join(', ')}`);
  console.log(JSON.stringify({ updated: verification.rows.length, unavailable: verification.rows.length, pincodes: verification.rows.map(row => row.pincode) }, null, 2));
}

repair().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});
