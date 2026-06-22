#!/usr/bin/env node

/**
 * Validate consolidated server data file
 *
 * Checks that data/all-servers.json:
 * - Is valid JSON
 * - Has proper structure (version, generated, count, servers)
 * - All servers have required fields
 * - All servers have unique npm_package keys
 * - Capabilities are valid
 */

const fs = require('fs');
const path = require('path');

const DATA_FILE = path.join(__dirname, '../data/all-servers.json');

function validateServers() {
  console.log('🔍 Validating consolidated server data...\n');

  try {
    // Check file exists
    if (!fs.existsSync(DATA_FILE)) {
      console.error(`❌ File not found: ${DATA_FILE}`);
      process.exit(1);
    }

    // Parse JSON
    const content = fs.readFileSync(DATA_FILE, 'utf8');
    const data = JSON.parse(content);

    let errors = 0;
    let warnings = 0;

    console.log('📋 Checking file structure...\n');

    // Validate structure
    if (!data.version) {
      console.error(`❌ Missing field: version`);
      errors++;
    }

    if (!data.generated) {
      console.error(`❌ Missing field: generated`);
      errors++;
    }

    if (typeof data.count !== 'number') {
      console.error(`❌ Missing or invalid field: count`);
      errors++;
    }

    if (!Array.isArray(data.servers)) {
      console.error(`❌ Missing or invalid field: servers (must be array)`);
      process.exit(1);
    }

    // Validate count matches array length
    if (data.count !== data.servers.length) {
      console.error(`❌ Count mismatch: count=${data.count}, actual=${data.servers.length}`);
      errors++;
    }

    console.log(`✅ Structure valid`);
    console.log(`   Version: ${data.version}`);
    console.log(`   Generated: ${data.generated}`);
    console.log(`   Servers: ${data.count}\n`);

    console.log('📦 Validating servers...\n');

    const uniqueKeys = new Map();
    const validCapabilities = ['tool', 'resource', 'prompt'];

    for (let i = 0; i < data.servers.length; i++) {
      const server = data.servers[i];
      const serverLabel = server.displayName || server.name || `Server #${i + 1}`;
      let serverErrors = 0;
      let serverWarnings = 0;

      // Required fields
      if (!server.name) {
        console.error(`  ❌ [${serverLabel}] Missing required field: name`);
        serverErrors++;
      }

      if (!server.description) {
        console.error(`  ❌ [${serverLabel}] Missing required field: description`);
        serverErrors++;
      }

      if (!server.npm_package) {
        console.error(`  ❌ [${serverLabel}] Missing required field: npm_package`);
        serverErrors++;
      }

      // Recommended fields
      if (!server.displayName) {
        console.warn(`  ⚠️  [${serverLabel}] Missing recommended field: displayName`);
        serverWarnings++;
      }

      if (!server.capabilities || server.capabilities.length === 0) {
        console.warn(`  ⚠️  [${serverLabel}] Missing capabilities array`);
        serverWarnings++;
      }

      if (!server.tags || server.tags.length === 0) {
        console.warn(`  ⚠️  [${serverLabel}] Missing tags array (affects searchability)`);
        serverWarnings++;
      }

      // Check for duplicate npm_package
      if (server.npm_package) {
        if (uniqueKeys.has(server.npm_package)) {
          console.error(`  ❌ [${serverLabel}] Duplicate npm_package: ${server.npm_package} (also in ${uniqueKeys.get(server.npm_package)})`);
          serverErrors++;
        } else {
          uniqueKeys.set(server.npm_package, serverLabel);
        }
      }

      // Validate capabilities
      if (server.capabilities) {
        for (const cap of server.capabilities) {
          if (!validCapabilities.includes(cap.toLowerCase())) {
            console.warn(`  ⚠️  [${serverLabel}] Unknown capability: "${cap}" (valid: ${validCapabilities.join(', ')})`);
            serverWarnings++;
          }
        }
      }

      errors += serverErrors;
      warnings += serverWarnings;

      // Only show success message for valid servers (no output for errors/warnings)
      if (serverErrors === 0 && serverWarnings === 0 && i < 10) {
        // Only show first 10 to avoid spam
        console.log(`  ✅ [${serverLabel}] Valid`);
      }
    }

    // Show ellipsis if we skipped some servers
    if (data.servers.length > 10 && errors === 0 && warnings === 0) {
      console.log(`  ... and ${data.servers.length - 10} more servers\n`);
    } else {
      console.log('');
    }

    // Summary
    console.log('━'.repeat(50));
    console.log(`\n📊 Summary:`);
    console.log(`   Servers validated: ${data.servers.length}`);
    console.log(`   Unique npm packages: ${uniqueKeys.size}`);
    console.log(`   Errors: ${errors}`);
    console.log(`   Warnings: ${warnings}\n`);

    if (errors > 0) {
      console.log('❌ Validation failed');
      process.exit(1);
    } else if (warnings > 0) {
      console.log('✅ Validation passed with warnings');
    } else {
      console.log('✅ All validations passed!');
    }

  } catch (error) {
    console.error(`\n❌ Fatal error: ${error.message}`);
    console.error(error.stack);
    process.exit(1);
  }
}

validateServers();
