#!/usr/bin/env node

/**
 * Update sitemap.xml with current date
 *
 * Usage: node scripts/update-sitemap.js
 */

const fs = require('fs');
const path = require('path');

const SITEMAP_FILE = path.join(__dirname, '../sitemap.xml');

function updateSitemap() {
  try {
    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD format

    const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
        xsi:schemaLocation="http://www.sitemaps.org/schemas/sitemap/0.9
        http://www.sitemaps.org/schemas/sitemap/0.9/sitemap.xsd">

  <!-- Main page -->
  <url>
    <loc>https://mcp-registry.netlify.app/</loc>
    <lastmod>${today}</lastmod>
    <changefreq>daily</changefreq>
    <priority>1.0</priority>
  </url>

  <!-- Data endpoint (for API discovery) -->
  <url>
    <loc>https://mcp-registry.netlify.app/data/all-servers.json</loc>
    <lastmod>${today}</lastmod>
    <changefreq>daily</changefreq>
    <priority>0.8</priority>
  </url>

</urlset>
`;

    fs.writeFileSync(SITEMAP_FILE, sitemap);
    console.log(`✅ Updated sitemap.xml with date: ${today}`);

  } catch (error) {
    console.error('❌ Error updating sitemap:', error.message);
    process.exit(1);
  }
}

updateSitemap();
