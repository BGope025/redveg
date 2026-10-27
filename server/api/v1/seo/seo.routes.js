const express = require('express');
const { getCatalogSitemap } = require('./seo.controller');

const router = express.Router();
router.get('/sitemap.xml', getCatalogSitemap);

module.exports = router;
