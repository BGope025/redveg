const { getDatabaseConnection } = require('../../../config/turso');
const { generateNotFoundError, generateValidationError } = require('../../../utils/error-classes');
const { generateCampaignId } = require('../../../utils/id-generator');
const logger = require('../../../utils/logger');

/**
 * Get campaigns with filtering
 * @route GET /api/v1/campaigns
 */
const getCampaigns = async (req, res) => {
  try {
    const { status, occasion, placement, activeOnly, limit, offset } = req.query;

    let sql = 'SELECT * FROM campaigns';
    const args = [];
    const conditions = [];

    // Add filtering conditions
    if (status) {
      conditions.push('status = ?');
      args.push(status);
    }

    if (occasion) {
      conditions.push('occasion = ?');
      args.push(occasion);
    }

    if (placement) {
      conditions.push('placement = ?');
      args.push(placement);
    }

    if (activeOnly !== undefined) {
      const now = new Date().toISOString();
      conditions.push('(startsAt <= ? AND endsAt >= ? AND status = "published")');
      args.push(now, now);
    }

    if (conditions.length > 0) {
      sql += ' WHERE ' + conditions.join(' AND ');
    }

    sql += ' ORDER BY priority DESC, createdAt DESC';

    // Add pagination
    if (limit !== undefined) {
      sql += ' LIMIT ?';
      args.push(parseInt(limit));
    }

    if (offset !== undefined) {
      sql += ' OFFSET ?';
      args.push(parseInt(offset));
    }

    const db = await getDatabaseConnection('catalog');
    const result = await db.execute({ sql, args });

    // Format dates for frontend compatibility
    const campaigns = result.rows.map(campaign => ({
      ...campaign,
      startsAt: campaign.startsAt || campaign.starts_at || new Date().toISOString(),
      endsAt: campaign.endsAt || campaign.ends_at || new Date(Date.now() + 30*24*60*60*1000).toISOString(),
      createdAt: campaign.createdAt || campaign.created_at || new Date().toISOString(),
      updatedAt: campaign.updatedAt || campaign.updated_at || new Date().toISOString()
    }));

    res.status(200).json({
      success: true,
      count: campaigns.length,
      data: campaigns
    });
  } catch (error) {
    if (error.type === 'validation-error') {
      return res.status(400).json({
        success: false,
        message: error.message
      });
    }

    logger.error('Error fetching campaigns:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

/**
 * Get campaign by ID
 * @route GET /api/v1/campaigns/:id
 */
const getCampaignById = async (req, res) => {
  try {
    const { id } = req.params;

    const db = await getDatabaseConnection('catalog');
    const result = await db.execute({
      sql: 'SELECT * FROM campaigns WHERE id = ?',
      args: [id]
    });

    if (result.rows.length === 0) {
      throw generateNotFoundError('Campaign not found');
    }

    const campaign = result.rows[0];

    // Format dates for frontend compatibility
    const formattedCampaign = {
      ...campaign,
      startsAt: campaign.startsAt || new Date().toISOString(),
      endsAt: campaign.endsAt || new Date(Date.now() + 30*24*60*60*1000).toISOString(),
      createdAt: campaign.createdAt || new Date().toISOString(),
      updatedAt: campaign.updatedAt || new Date().toISOString()
    };

    res.status(200).json({
      success: true,
      data: formattedCampaign
    });
  } catch (error) {
    if (error.type === 'not-found') {
      return res.status(404).json({
        success: false,
        message: error.message
      });
    }

    logger.error('Error fetching campaign by ID:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

/**
 * Create new campaign
 * @route POST /api/v1/campaigns
 */
const createCampaign = async (req, res) => {
  try {
    const {
      name,
      slug,
      occasion,
      placement,
      label,
      message,
      ctaLabel,
      destinationType,
      destinationValue,
      startsAt,
      endsAt,
      timezone,
      priority,
      backgroundColor,
      foregroundColor,
      accentColor,
      buttonColor,
      buttonTextColor,
      desktopImageUrl,
      mobileImageUrl,
      posterImageUrl,
      altText,
      targetLocations,
      targetDevice,
      analyticsCampaignId,
      status = 'draft'
    } = req.body;

    // Validate required fields
    const requiredFields = ['name', 'slug', 'occasion', 'placement'];
    for (const field of requiredFields) {
      if (!req.body[field]) {
        throw generateValidationError(`${field} is required`);
      }
    }
    if (status === 'published' && !desktopImageUrl && !mobileImageUrl && !posterImageUrl) {
      throw generateValidationError('A hero image is required before publishing a campaign');
    }

    const db = await getDatabaseConnection('catalog');
    const campaignId = generateCampaignId();

    await db.execute({
      sql: `
        INSERT INTO campaigns (
          id, name, slug, occasion, placement, label, message, ctaLabel,
          destinationType, destinationValue, startsAt, endsAt, timezone,
          priority, backgroundColor, foregroundColor, accentColor,
          buttonColor, buttonTextColor, desktopImageUrl, mobileImageUrl,
          posterImageUrl, altText, targetLocations, targetDevice,
          analyticsCampaignId, status, createdAt, updatedAt
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      args: [
        campaignId,
        name,
        slug,
        occasion,
        placement,
        label || null,
        message || null,
        ctaLabel || null,
        destinationType || null,
        destinationValue || null,
        startsAt || new Date().toISOString(),
        endsAt || new Date(Date.now() + 30*24*60*60*1000).toISOString(),
        timezone || 'UTC',
        priority !== undefined ? priority : 0,
        backgroundColor || null,
        foregroundColor || null,
        accentColor || null,
        buttonColor || null,
        buttonTextColor || null,
        desktopImageUrl || null,
        mobileImageUrl || null,
        posterImageUrl || null,
        altText || null,
        JSON.stringify(targetLocations || []),
        targetDevice || 'all',
        analyticsCampaignId || null,
        status,
        new Date().toISOString(),
        new Date().toISOString()
      ]
    });

    logger.info(`Campaign created: ${campaignId}`);

    // Fetch and return the created campaign
    const result = await db.execute({
      sql: 'SELECT * FROM campaigns WHERE id = ?',
      args: [campaignId]
    });

    const campaign = result.rows[0];
    const formattedCampaign = {
      ...campaign,
      startsAt: campaign.startsAt || new Date().toISOString(),
      endsAt: campaign.endsAt || new Date(Date.now() + 30*24*60*60*1000).toISOString(),
      createdAt: campaign.createdAt || new Date().toISOString(),
      updatedAt: campaign.updatedAt || new Date().toISOString()
    };

    res.status(201).json({
      success: true,
      message: 'Campaign created successfully',
      data: formattedCampaign
    });
  } catch (error) {
    if (error.type === 'validation-error') {
      return res.status(400).json({
        success: false,
        message: error.message
      });
    }

    logger.error('Error creating campaign:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

/**
 * Update campaign
 * @route PUT /api/v1/campaigns/:id
 */
const updateCampaign = async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = req.body;

    const db = await getDatabaseConnection('catalog');

    // Check if campaign exists
    const existing = await db.execute({
      sql: 'SELECT id, status, desktopImageUrl, mobileImageUrl, posterImageUrl FROM campaigns WHERE id = ?',
      args: [id]
    });

    if (existing.rows.length === 0) {
      throw generateNotFoundError('Campaign not found');
    }

    const existingCampaign = existing.rows[0];
    const nextStatus = updateData.status ?? existingCampaign.status;
    const hasHeroImage = updateData.desktopImageUrl || updateData.mobileImageUrl || updateData.posterImageUrl || existingCampaign.desktopImageUrl || existingCampaign.mobileImageUrl || existingCampaign.posterImageUrl;
    if (nextStatus === 'published' && !hasHeroImage) {
      throw generateValidationError('A hero image is required before publishing a campaign');
    }

    // Build update query dynamically
    const updates = [];
    const args = [];

    const allowedFields = [
      'name', 'slug', 'occasion', 'placement', 'label', 'message', 'ctaLabel',
      'destinationType', 'destinationValue', 'startsAt', 'endsAt', 'timezone',
      'priority', 'backgroundColor', 'foregroundColor', 'accentColor',
      'buttonColor', 'buttonTextColor', 'desktopImageUrl', 'mobileImageUrl',
      'posterImageUrl', 'altText', 'targetLocations', 'targetDevice',
      'analyticsCampaignId', 'status'
    ];

    for (const field of allowedFields) {
      if (updateData[field] !== undefined) {
        if (field === 'targetLocations' || field === 'targetDevice') {
          // Handle JSON fields
          updates.push(`${field} = ?`);
          args.push(field === 'targetLocations' ? JSON.stringify(updateData[field]) : updateData[field]);
        } else {
          updates.push(`${field} = ?`);
          args.push(updateData[field]);
        }
      }
    }

    // Always update the updatedAt timestamp
    updates.push('updatedAt = ?');
    args.push(new Date().toISOString());

    if (updates.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No fields to update'
      });
    }

    args.push(id);

    await db.execute({
      sql: `UPDATE campaigns SET ${updates.join(', ')} WHERE id = ?`,
      args
    });

    logger.info(`Campaign updated: ${id}`);

    // Fetch and return the updated campaign
    const result = await db.execute({
      sql: 'SELECT * FROM campaigns WHERE id = ?',
      args: [id]
    });

    const campaign = result.rows[0];
    const formattedCampaign = {
      ...campaign,
      startsAt: campaign.startsAt || new Date().toISOString(),
      endsAt: campaign.endsAt || new Date(Date.now() + 30*24*60*60*1000).toISOString(),
      createdAt: campaign.createdAt || new Date().toISOString(),
      updatedAt: campaign.updatedAt || new Date().toISOString()
    };

    res.status(200).json({
      success: true,
      message: 'Campaign updated successfully',
      data: formattedCampaign
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

    logger.error('Error updating campaign:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

/**
 * Delete campaign
 * @route DELETE /api/v1/campaigns/:id
 */
const deleteCampaign = async (req, res) => {
  try {
    const { id } = req.params;

    const db = await getDatabaseConnection('catalog');

    // Check if campaign exists
    const existing = await db.execute({
      sql: 'SELECT id FROM campaigns WHERE id = ?',
      args: [id]
    });

    if (existing.rows.length === 0) {
      throw generateNotFoundError('Campaign not found');
    }

    // Soft delete by setting status to archived
    await db.execute({
      sql: 'UPDATE campaigns SET status = "archived", updatedAt = CURRENT_TIMESTAMP WHERE id = ?',
      args: [id]
    });

    logger.info(`Campaign archived: ${id}`);

    res.status(200).json({
      success: true,
      message: 'Campaign archived successfully'
    });
  } catch (error) {
    if (error.type === 'not-found') {
      return res.status(404).json({
        success: false,
        message: error.message
      });
    }

    logger.error('Error deleting campaign:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

/**
 * Resolve active campaign based on time, location, and device
 * @route GET /api/v1/campaigns/active
 */
const resolveActiveCampaign = async (req, res) => {
  try {
    const { now, locationId, device } = req.query;
    const currentTime = now ? new Date(now) : new Date();
    const currentTimeISO = currentTime.toISOString();

    const db = await getDatabaseConnection('catalog');

    // Build query to find active campaigns
    let sql = `
      SELECT * FROM campaigns
      WHERE status = 'published'
      AND startsAt <= ?
      AND endsAt >= ?
    `;
    const args = [currentTimeISO, currentTimeISO];

    // Add location filtering if provided
    if (locationId) {
      sql += ` AND (targetLocations IS NULL OR targetLocations = '[]' OR JSON_EXTRACT(targetLocations, '$[*]') LIKE ?)`;
      args.push(`%${locationId}%`);
    }

    // Add device filtering if provided
    if (device && device !== 'all') {
      sql += ` AND (targetDevice = 'all' OR targetDevice = ?)`;
      args.push(device);
    }

    sql += ` ORDER BY priority DESC, updatedAt DESC LIMIT 1`;

    const result = await db.execute({ sql, args });

    if (result.rows.length === 0) {
      return res.status(200).json({
        success: true,
        data: null
      });
    }

    const campaign = result.rows[0];

    // Format dates for frontend compatibility
    const formattedCampaign = {
      ...campaign,
      startsAt: campaign.startsAt || new Date().toISOString(),
      endsAt: campaign.endsAt || new Date(Date.now() + 30*24*60*60*1000).toISOString(),
      createdAt: campaign.createdAt || new Date().toISOString(),
      updatedAt: campaign.updatedAt || new Date().toISOString()
    };

    res.status(200).json({
      success: true,
      data: formattedCampaign
    });
  } catch (error) {
    logger.error('Error resolving active campaign:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

module.exports = {
  getCampaigns,
  getCampaignById,
  createCampaign,
  updateCampaign,
  deleteCampaign,
  resolveActiveCampaign
};

