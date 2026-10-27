const { randomUUID } = require('node:crypto');
const { getDatabaseConnection } = require('../../../config/turso');
const { ensureDeliverySlotsSchema } = require('./delivery-slots.schema');
const logger = require('../../../utils/logger');

const TIME_PATTERN = /^(?:[01]\d|2[0-3]):[0-5]\d$/;

function normalizeSlot(row) {
  return {
    id: String(row.id),
    name: String(row.name),
    startTime: String(row.start_time),
    endTime: String(row.end_time),
    isActive: Number(row.is_active) === 1,
    sortOrder: Number(row.sort_order) || 0,
    updatedAt: row.updated_at || null,
  };
}

function validateSlot(body = {}) {
  const name = String(body.name || '').trim().replace(/\s+/g, ' ').slice(0, 80);
  const startTime = String(body.startTime || '').trim();
  const endTime = String(body.endTime || '').trim();
  if (!name) return { error: 'Enter a name for this delivery slot.' };
  if (!TIME_PATTERN.test(startTime) || !TIME_PATTERN.test(endTime) || endTime <= startTime) {
    return { error: 'Choose valid 24-hour start and end times. The end must be later than the start.' };
  }
  return { name, startTime, endTime };
}

async function getDatabase() {
  const db = await getDatabaseConnection('catalog');
  await ensureDeliverySlotsSchema(db);
  return db;
}

const getActiveDeliverySlots = async (_req, res) => {
  try {
    const db = await getDatabase();
    const result = await db.execute({
      sql: 'SELECT id, name, start_time, end_time, is_active, sort_order, updated_at FROM delivery_slots WHERE is_active = 1 ORDER BY sort_order, start_time',
      args: [],
    });
    return res.status(200).json({ success: true, data: result.rows.map(normalizeSlot) });
  } catch (error) {
    logger.error('Could not load active delivery slots:', error);
    return res.status(500).json({ success: false, message: 'Delivery slots could not be loaded.' });
  }
};

const getAdminDeliverySlots = async (_req, res) => {
  try {
    const db = await getDatabase();
    const result = await db.execute({
      sql: 'SELECT id, name, start_time, end_time, is_active, sort_order, updated_at FROM delivery_slots ORDER BY sort_order, start_time',
      args: [],
    });
    return res.status(200).json({ success: true, data: result.rows.map(normalizeSlot) });
  } catch (error) {
    logger.error('Could not load admin delivery slots:', error);
    return res.status(500).json({ success: false, message: 'Delivery slots could not be loaded.' });
  }
};

const createDeliverySlot = async (req, res) => {
  const slot = validateSlot(req.body);
  if (slot.error) return res.status(400).json({ success: false, message: slot.error });
  try {
    const db = await getDatabase();
    const order = await db.execute({ sql: 'SELECT COALESCE(MAX(sort_order), 0) + 10 AS next_order FROM delivery_slots', args: [] });
    const id = `slot-${randomUUID()}`;
    await db.execute({
      sql: 'INSERT INTO delivery_slots (id, name, start_time, end_time, is_active, sort_order) VALUES (?, ?, ?, ?, 1, ?)',
      args: [id, slot.name, slot.startTime, slot.endTime, Number(order.rows[0]?.next_order) || 10],
    });
    const result = await db.execute({
      sql: 'SELECT id, name, start_time, end_time, is_active, sort_order, updated_at FROM delivery_slots WHERE id = ?',
      args: [id],
    });
    return res.status(201).json({ success: true, data: normalizeSlot(result.rows[0]) });
  } catch (error) {
    logger.error('Could not create delivery slot:', error);
    return res.status(500).json({ success: false, message: 'Delivery slot could not be saved.' });
  }
};

const updateDeliverySlot = async (req, res) => {
  const slot = validateSlot(req.body);
  if (slot.error) return res.status(400).json({ success: false, message: slot.error });
  if (typeof req.body?.isActive !== 'boolean') return res.status(400).json({ success: false, message: 'Slot availability must be on or off.' });
  try {
    const db = await getDatabase();
    const result = await db.execute({
      sql: `UPDATE delivery_slots SET name = ?, start_time = ?, end_time = ?, is_active = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?`,
      args: [slot.name, slot.startTime, slot.endTime, req.body.isActive ? 1 : 0, String(req.params.id)],
    });
    if (!Number(result.rowsAffected)) return res.status(404).json({ success: false, message: 'Delivery slot not found.' });
    const updated = await db.execute({
      sql: 'SELECT id, name, start_time, end_time, is_active, sort_order, updated_at FROM delivery_slots WHERE id = ?',
      args: [String(req.params.id)],
    });
    return res.status(200).json({ success: true, data: normalizeSlot(updated.rows[0]) });
  } catch (error) {
    logger.error('Could not update delivery slot:', error);
    return res.status(500).json({ success: false, message: 'Delivery slot could not be updated.' });
  }
};

module.exports = { getActiveDeliverySlots, getAdminDeliverySlots, createDeliverySlot, updateDeliverySlot };
