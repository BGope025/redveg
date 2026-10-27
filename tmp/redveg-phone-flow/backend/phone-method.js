async function updateMyPhoneNumber(req, res) {
  const identity = requireIdentity(req, res);
  if (!identity) return;
  const phoneNumber = String(req.body?.phoneNumber || '').trim().slice(0, 24);
  const digits = phoneNumber.replace(/\D/g, '');
  if (digits.length < 10 || digits.length > 15) {
    return res.status(400).json({ success: false, message: 'Enter a valid phone number with 10 to 15 digits.' });
  }
  try {
    const db = await getOrdersDatabase();
    await saveIdentity(db, identity);
    await db.execute({
      sql: `UPDATE customer_profiles SET phone_number = ?, updated_at = CURRENT_TIMESTAMP WHERE firebase_uid = ?`,
      args: [phoneNumber, identity.uid],
    });
    return res.status(200).json({ success: true, data: { phoneNumber } });
  } catch (error) {
    logger.error('Error updating Firebase customer phone number:', error);
    return res.status(500).json({ success: false, message: 'Unable to save your phone number right now.' });
  }
}
