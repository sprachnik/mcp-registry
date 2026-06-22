#!/usr/bin/env node

/**
 * Inject build metadata into index.html.
 *
 * Replaces the *contents* of known elements so the script is idempotent and
 * safe to re-run on every CI build:
 *   - <code id="buildId">…</code>      -> short git commit hash
 *   - <strong id="serverCount">…</strong> -> formatted server count (for SEO / no-JS)
 *
 * Usage: node scripts/inject-build-id.js
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const INDEX_FILE = path.join(__dirname, '../index.html');
const DATA_FILE = path.join(__dirname, '../data/all-servers.json');

/** Replace the inner content of an element matched by id, leaving tags intact. */
function replaceElementContent(html, tag, id, content) {
  const re = new RegExp(`(<${tag}\\s+id="${id}"[^>]*>)([\\s\\S]*?)(</${tag}>)`, 'i');
  if (!re.test(html)) {
    console.warn(`⚠️  Could not find <${tag} id="${id}"> in index.html — skipping`);
    return html;
  }
  return html.replace(re, `$1${content}$3`);
}

function injectBuildId() {
  try {
    let html = fs.readFileSync(INDEX_FILE, 'utf8');

    // Build hash (git short SHA, falls back to "dev").
    let buildId = 'dev';
    try {
      buildId = execSync('git rev-parse --short HEAD', { encoding: 'utf8' }).trim();
    } catch (e) {
      console.warn('⚠️  git hash unavailable, using "dev"');
    }
    console.log(`🔨 Build ID: ${buildId}`);
    html = replaceElementContent(html, 'code', 'buildId', buildId);

    // Server count (for SEO and no-JS rendering).
    if (fs.existsSync(DATA_FILE)) {
      try {
        const data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
        const count = Number(data.count || (data.servers || []).length || 0);
        const formatted = count.toLocaleString('en-US');
        console.log(`🔢 Server count: ${formatted}`);
        html = replaceElementContent(html, 'strong', 'serverCount', formatted);
      } catch (e) {
        console.warn(`⚠️  Could not read server count: ${e.message}`);
      }
    }

    fs.writeFileSync(INDEX_FILE, html);
    console.log('✅ Build metadata injected into index.html');
  } catch (error) {
    console.error('❌ Error injecting build metadata:', error.message);
    // Never fail the build over cosmetic metadata.
    console.warn('⚠️  Continuing without injection');
  }
}

injectBuildId();
