const PIECE_SIZE_OPTIONS = ['Small', 'Medium', 'Large'];

function normalizePieceSize(value) {
  if (value == null || String(value).trim() === '') return null;
  const normalized = String(value).trim().toLowerCase();
  return PIECE_SIZE_OPTIONS.find((option) => option.toLowerCase() === normalized) || undefined;
}

async function ensureVariantPieceSizeSchema(db) {
  const result = await db.execute('PRAGMA table_info(variants)');
  if ((result.rows || []).some((column) => column.name === 'piece_size')) return;
  try {
    await db.execute(`ALTER TABLE variants ADD COLUMN piece_size TEXT CHECK (piece_size IS NULL OR piece_size IN ('Small', 'Medium', 'Large'))`);
  } catch (error) {
    if (!/duplicate column/i.test(String(error?.message || error))) throw error;
  }
}

module.exports = { PIECE_SIZE_OPTIONS, normalizePieceSize, ensureVariantPieceSizeSchema };
