#!/usr/bin/env node

/**
 * Scrape MCP servers from the official registry API
 *
 * Fetches ALL servers from registry.modelcontextprotocol.io with pagination
 * and writes directly to a single consolidated JSON file.
 *
 * Architecture: Simple, efficient, and memory-conscious
 * - Fetch servers in batches with pagination
 * - Process incrementally to avoid memory overflow
 * - Deduplicate and transform in-place
 * - Write single consolidated file (data/all-servers.json)
 * - No individual files, no bloat, fast frontend loading
 *
 * Usage: node scripts/scrape-registry.js
 */

const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');

const REGISTRY_API = 'https://registry.modelcontextprotocol.io/v0/servers';
const OUTPUT_FILE = path.join(__dirname, '../data/all-servers.json');

// Configuration - optimized for speed and memory efficiency
const BATCH_SIZE = parseInt(process.env.SCRAPER_BATCH_SIZE || '50', 10); // Reduced to 50 to prevent OOM
const DELAY_MS = parseInt(process.env.SCRAPER_DELAY_MS || '20', 10); // Fast: 20ms delay between requests
const MAX_SERVERS = parseInt(process.env.SCRAPER_MAX_SERVERS || '0', 10); // 0 = unlimited (fetch ALL)

/**
 * Fetch JSON from URL with redirects
 */
function fetchJson(url) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const client = urlObj.protocol === 'https:' ? https : http;

    client.get(url, (res) => {
      // Handle redirects
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return fetchJson(res.headers.location).then(resolve).catch(reject);
      }

      if (res.statusCode !== 200) {
        return reject(new Error(`HTTP ${res.statusCode}: ${res.statusMessage}`));
      }

      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (error) {
          reject(new Error(`Invalid JSON: ${error.message}`));
        }
      });
    }).on('error', reject);
  });
}

/**
 * Sleep for rate limiting
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Generate unique ID from package name for deduplication
 */
function generateId(packageName) {
  return packageName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .replace(/--+/g, '-');
}

/**
 * Extract tags from server metadata
 */
function extractTags(server) {
  const tags = new Set();

  // Add vendor as tag
  if (server.vendor) {
    tags.add(server.vendor.toLowerCase());
  }

  // Extract from description
  const desc = (server.description || '').toLowerCase();

  // Common patterns
  const patterns = {
    'database': /database|sql|postgres|mysql|mongodb/i,
    'search': /search|query|find/i,
    'web': /web|http|api/i,
    'ai': /\b(ai|ml|machine learning|llm|gpt)\b/i,
    'analytics': /analytics|analysis|visualization/i,
    'vision': /vision|image|video|ocr/i,
    'file': /file|filesystem|storage/i,
    'cloud': /cloud|aws|azure|gcp/i,
    'security': /security|auth|encryption/i,
    'network': /network|pcap|packet/i,
    'crm': /crm|salesforce|customer/i,
    'social': /social|twitter|facebook|bilibili/i,
    'memory': /memory|context|conversation/i,
    'code': /code|programming|git|github/i,
  };

  for (const [tag, pattern] of Object.entries(patterns)) {
    if (pattern.test(desc) || pattern.test(server.name || '')) {
      tags.add(tag);
    }
  }

  return Array.from(tags);
}

/**
 * Infer capabilities from server metadata
 */
function inferCapabilities(server) {
  const caps = new Set();
  const desc = (server.description || '').toLowerCase();
  const name = (server.name || '').toLowerCase();

  // Look for capability hints
  if (/tool|function|action|execute|run/i.test(desc + name)) {
    caps.add('tool');
  }
  if (/resource|data|file|content|read|fetch|get/i.test(desc + name)) {
    caps.add('resource');
  }
  if (/prompt|template|instruction|guide/i.test(desc + name)) {
    caps.add('prompt');
  }

  // Default to tool if nothing detected
  if (caps.size === 0) {
    caps.add('tool');
  }

  return Array.from(caps);
}

/**
 * Extract repository URL from server metadata
 */
function extractRepository(server) {
  // Official registry schema: repository: { url, source }
  if (server.repository && typeof server.repository === 'object' && server.repository.url) {
    return server.repository.url;
  }

  // Older/string form
  if (typeof server.repository === 'string' && server.repository) {
    return server.repository;
  }

  // Legacy field names
  if (server.sourceUrl) {
    return server.sourceUrl;
  }

  // Homepage / website if it points at a known forge
  const web = server.websiteUrl || server.homepage;
  if (web && /github\.com|gitlab\.com|bitbucket\.org/.test(web)) {
    return web;
  }

  // Try to extract from description
  const desc = server.description || '';
  const match = desc.match(/(https?:\/\/(?:github|gitlab|bitbucket)\.(?:com|org)\/[^\s]+)/i);
  if (match) {
    return match[1];
  }

  return null;
}

/**
 * Derive a GitHub URL from a reverse-DNS registry name.
 * e.g. "io.github.Owner/repo-name" -> "https://github.com/Owner/repo-name"
 */
function deriveSourceFromName(name) {
  if (!name) return null;
  const m = name.match(/^io\.github\.([^/]+)\/(.+)$/i);
  if (m) {
    return `https://github.com/${m[1]}/${m[2]}`;
  }
  return null;
}

/**
 * Extract installable package info (npm / pypi / oci / nuget) in a compact form.
 * Keeps only what the UI needs to build install commands and client config.
 */
function extractPackages(apiServer) {
  return (apiServer.packages || []).map((p) => {
    const out = { registry: p.registryType, id: p.identifier };
    if (p.version) out.version = p.version;
    const transport = p.transport && p.transport.type;
    if (transport && transport !== 'stdio') out.transport = transport;
    if (p.transport && p.transport.url) out.url = p.transport.url;
    if (p.runtimeHint) out.runtime = p.runtimeHint;
    const env = (p.environmentVariables || [])
      .filter((e) => e && e.name)
      .map((e) => ({ name: e.name, required: !!e.isRequired, secret: !!e.isSecret }));
    if (env.length) out.env = env;
    return out;
  }).filter((p) => p.id && p.registry);
}

/**
 * Extract hosted remote endpoints (streamable-http / sse).
 */
function extractRemotes(apiServer) {
  return (apiServer.remotes || [])
    .filter((r) => r && r.url)
    .map((r) => ({ type: r.type || 'streamable-http', url: r.url }));
}

/**
 * Convert registry server to our JSON schema
 */
let debugCount = 0;
function convertServer(apiServer) {
  // Skip servers with no name - they're invalid
  if (!apiServer.name || apiServer.name.trim() === '') {
    // DEBUG: Log why this server was skipped (only first 5)
    if (debugCount < 5 && typeof apiServer === 'object') {
      const keys = Object.keys(apiServer).join(', ');
      console.warn(`   🔍 DEBUG - Skipping server (no name). Keys: ${keys}`);
      console.warn(`   🔍 DEBUG - Sample data:`, JSON.stringify(apiServer).substring(0, 300));
      debugCount++;
    }
    return null;
  }

  const vendor = apiServer.vendor || 'unknown';
  const packageName = apiServer.name;
  const id = generateId(packageName);

  // Extract display name
  let displayName = apiServer.title || packageName.split('/').pop() || id;
  displayName = displayName
    .replace(/^mcp-/i, '')
    .replace(/-mcp$/i, '')
    .replace(/[-_]/g, ' ')
    .split(/\s+/)                 // split on any whitespace run (avoids empty words)
    .filter(Boolean)              // drop empties so we don't emit double spaces
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
    .trim();

  const description = apiServer.description || 'No description available.';
  // Prefer an explicit repository; otherwise derive one from io.github.* names.
  const repository = extractRepository(apiServer) || deriveSourceFromName(packageName);
  const capabilities = inferCapabilities(apiServer);
  const tags = extractTags(apiServer);

  // Get latest version
  const version = apiServer.latestVersion || apiServer.version || '1.0.0';

  const server = {
    name: id,
    displayName,
    description,
    author: vendor,
    capabilities,
    tags,
    npm_package: packageName,
    version,
    license: 'MIT' // Default, most MCP servers are MIT
  };

  // Add optional fields
  if (repository) {
    server.repository = repository;
  }

  // Website (registry calls this websiteUrl)
  const homepage = apiServer.websiteUrl || apiServer.homepage;
  if (homepage) {
    server.homepage = homepage;
  }

  // Install metadata (packages + hosted remotes) — drives the "quick install" UI
  const packages = extractPackages(apiServer);
  if (packages.length) {
    server.packages = packages;
  }

  const remotes = extractRemotes(apiServer);
  if (remotes.length) {
    server.remotes = remotes;
  }

  return server;
}

/**
 * Fetch and process all servers incrementally to avoid memory overflow
 */
async function fetchAndProcessServers() {
  console.log('🔍 Fetching servers from MCP Registry API...\n');

  const serverMap = new Map(); // Deduplicate by npm_package as we go
  let cursor = null; // API uses cursor-based pagination, not offset!
  let hasMore = true;
  let pageNum = 1;
  let totalFetched = 0;
  let invalidCount = 0;
  let duplicateCount = 0;

  while (hasMore) {
    try {
      // Use cursor-based pagination (not offset!)
      const url = cursor
        ? `${REGISTRY_API}?limit=${BATCH_SIZE}&cursor=${encodeURIComponent(cursor)}`
        : `${REGISTRY_API}?limit=${BATCH_SIZE}`;

      console.log(`📄 Fetching page ${pageNum}${cursor ? ` (cursor: ${cursor.substring(0, 30)}...)` : ' (initial)'}...`);

      const response = await fetchJson(url);
      const batchItems = response.servers || [];

      if (batchItems.length === 0) {
        hasMore = false;
        break;
      }

      console.log(`   ✓ Got ${batchItems.length} servers`);
      totalFetched += batchItems.length;

      // Track batch-specific stats
      let batchAdded = 0;
      let batchInvalid = 0;
      let batchDuplicate = 0;

      // Process this batch immediately to free memory
      for (const item of batchItems) {
        try {
          // Extract the actual server object from the wrapper
          const apiServer = item.server || item;

          // DEBUG: Log first server of first batch to see structure
          if (pageNum === 1 && serverMap.size === 0 && invalidCount === 0) {
            console.log(`   🔍 DEBUG - Sample API item:`, JSON.stringify(item, null, 2).substring(0, 500));
            console.log(`   🔍 DEBUG - Extracted server:`, JSON.stringify(apiServer, null, 2).substring(0, 500));
          }

          const server = convertServer(apiServer);

          // Skip invalid servers
          if (!server) {
            invalidCount++;
            batchInvalid++;
            if (invalidCount <= 5) {
              console.log(`   ⚠️  Invalid server skipped: ${apiServer?.name || item?.name || 'no name'}`);
            }
            continue;
          }

          // Deduplicate by npm_package
          if (serverMap.has(server.npm_package)) {
            duplicateCount++;
            batchDuplicate++;
            if (duplicateCount <= 5) {
              console.log(`   ⚠️  Duplicate skipped: ${server.npm_package}`);
            }
            continue;
          }

          serverMap.set(server.npm_package, server);
          batchAdded++;

        } catch (error) {
          console.error(`   ❌ Error processing server:`, error.message);
          invalidCount++;
          batchInvalid++;
        }
      }

      console.log(`   📦 Batch: +${batchAdded} added, ${batchDuplicate} duplicates, ${batchInvalid} invalid`);
      console.log(`   📊 Total: ${serverMap.size} unique servers so far`);

      // Check if we've reached the max limit (if set)
      if (MAX_SERVERS > 0 && totalFetched >= MAX_SERVERS) {
        console.log(`\n⚠️  Reached max server limit (${MAX_SERVERS}), stopping fetch.`);
        hasMore = false;
        break;
      }

      // Get next cursor from metadata (API uses cursor-based pagination)
      cursor = response.metadata?.nextCursor || null;

      // Check if there are more pages
      if (!cursor || batchItems.length < BATCH_SIZE) {
        hasMore = false;
        if (!cursor) {
          console.log(`   ℹ️  No more pages (no nextCursor in metadata)`);
        }
      } else {
        pageNum++;

        // Rate limiting
        await sleep(DELAY_MS);
      }

    } catch (error) {
      console.error(`   ❌ Error fetching page ${pageNum}:`, error.message);
      hasMore = false;
    }
  }

  console.log(`\n✅ Fetched ${totalFetched} servers total`);
  console.log(`📊 Processing summary:`);
  console.log(`   Invalid (skipped): ${invalidCount}`);
  console.log(`   Duplicates (skipped): ${duplicateCount}`);
  console.log(`   Unique servers: ${serverMap.size}\n`);

  return serverMap;
}

/**
 * Save servers to consolidated JSON file
 */
function saveServers(serverMap) {
  console.log('💾 Saving to consolidated file...\n');

  // Convert to array
  const servers = Array.from(serverMap.values());

  // Sort by displayName for consistency
  servers.sort((a, b) => a.displayName.localeCompare(b.displayName));

  // Create consolidated file
  const consolidated = {
    version: "1.0",
    generated: new Date().toISOString(),
    count: servers.length,
    servers: servers
  };

  // Ensure data directory exists
  const dataDir = path.dirname(OUTPUT_FILE);
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  // Write consolidated file
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(consolidated, null, 2) + '\n');

  console.log(`✅ Saved ${servers.length} servers to ${OUTPUT_FILE}\n`);
}

/**
 * Main execution
 */
async function main() {
  try {
    console.log('🚀 MCP Registry Scraper\n');
    console.log('━'.repeat(50) + '\n');

    // Display configuration
    console.log('⚙️  Configuration:');
    console.log(`   Batch size: ${BATCH_SIZE} servers per request`);
    console.log(`   Delay: ${DELAY_MS}ms between requests`);
    console.log(`   Max servers: ${MAX_SERVERS === 0 ? 'unlimited (ALL)' : MAX_SERVERS}`);
    console.log(`   Output: ${OUTPUT_FILE}\n`);

    // Fetch and process servers incrementally
    const serverMap = await fetchAndProcessServers();

    if (serverMap.size === 0) {
      console.log('⚠️  No servers found. Exiting.');
      return;
    }

    // Save to file
    saveServers(serverMap);

    console.log('━'.repeat(50));
    console.log('\n✅ Scraping complete!');
    console.log('\n💡 Next step:');
    console.log('   Run: node scripts/validate-servers.js\n');

  } catch (error) {
    console.error('\n❌ Fatal error:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

// Run the scraper
main();
