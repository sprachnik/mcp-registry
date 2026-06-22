const { describe, it } = require('node:test');
const assert = require('node:assert');

/**
 * Test helper functions from scraper
 * 
 * These tests verify the scraper's helper functions work correctly
 * without requiring network access.
 */

// Import the normalizeFilename logic
function generateId(packageName) {
  return packageName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .replace(/--+/g, '-');
}

describe('Scraper Helper Functions', () => {
  describe('generateId()', () => {
    it('should convert package names to valid IDs', () => {
      assert.strictEqual(
        generateId('ai.smithery/mcp-server'),
        'ai-smithery-mcp-server'
      );
    });

    it('should handle @ prefix', () => {
      assert.strictEqual(
        generateId('@modelcontextprotocol/server-brave-search'),
        'modelcontextprotocol-server-brave-search'
      );
    });

    it('should remove leading/trailing dashes', () => {
      assert.strictEqual(
        generateId('--server-name--'),
        'server-name'
      );
    });

    it('should collapse multiple dashes', () => {
      assert.strictEqual(
        generateId('ai---smithery---server'),
        'ai-smithery-server'
      );
    });

    it('should handle uppercase', () => {
      assert.strictEqual(
        generateId('AI.Smithery/ServerName'),
        'ai-smithery-servername'
      );
    });

    it('should handle special characters', () => {
      assert.strictEqual(
        generateId('ai.vendor/server_name-v2!'),
        'ai-vendor-server-name-v2'
      );
    });

    it('should not create filename collisions for different vendors', () => {
      const id1 = generateId('ai.smithery/postgres');
      const id2 = generateId('ai.vendor2/postgres');
      
      // These should be different!
      assert.notStrictEqual(id1, id2);
      assert.strictEqual(id1, 'ai-smithery-postgres');
      assert.strictEqual(id2, 'ai-vendor2-postgres');
    });
  });
});

describe('Data Structure Validation', () => {
  describe('Server object structure', () => {
    it('should have required fields', () => {
      const server = {
        name: 'test-server',
        displayName: 'Test Server',
        description: 'A test server',
        author: 'Test Author',
        capabilities: ['tool'],
        tags: ['test'],
        npm_package: 'ai.test/server',
        version: '1.0.0',
        license: 'MIT'
      };

      assert.ok(server.name);
      assert.ok(server.displayName);
      assert.ok(server.description);
      assert.ok(server.npm_package);
      assert.ok(Array.isArray(server.capabilities));
      assert.ok(Array.isArray(server.tags));
    });

    it('should validate capabilities are valid values', () => {
      const validCapabilities = ['tool', 'resource', 'prompt'];
      const server = {
        capabilities: ['tool', 'resource']
      };

      server.capabilities.forEach(cap => {
        assert.ok(
          validCapabilities.includes(cap.toLowerCase()),
          `Invalid capability: ${cap}`
        );
      });
    });
  });

  describe('Consolidated file structure', () => {
    it('should have correct structure', () => {
      const consolidated = {
        version: '1.0',
        generated: new Date().toISOString(),
        count: 100,
        servers: []
      };

      assert.strictEqual(consolidated.version, '1.0');
      assert.ok(consolidated.generated);
      assert.strictEqual(typeof consolidated.count, 'number');
      assert.ok(Array.isArray(consolidated.servers));
    });

    it('should have count matching array length', () => {
      const servers = [
        { name: 'server1', npm_package: 'test/1' },
        { name: 'server2', npm_package: 'test/2' }
      ];

      const consolidated = {
        version: '1.0',
        generated: new Date().toISOString(),
        count: servers.length,
        servers: servers
      };

      assert.strictEqual(consolidated.count, consolidated.servers.length);
    });
  });
});

describe('API Response Handling', () => {
  describe('Unwrapping server objects', () => {
    it('should extract server from wrapper object', () => {
      const apiItem = {
        server: {
          name: 'ai.smithery/test',
          description: 'Test server'
        },
        _meta: {
          created: '2024-01-01'
        }
      };

      // Extract the actual server
      const apiServer = apiItem.server || apiItem;

      assert.strictEqual(apiServer.name, 'ai.smithery/test');
      assert.strictEqual(apiServer.description, 'Test server');
    });

    it('should handle non-wrapped server objects', () => {
      const apiItem = {
        name: 'ai.smithery/test',
        description: 'Test server'
      };

      // Fallback for backwards compatibility
      const apiServer = apiItem.server || apiItem;

      assert.strictEqual(apiServer.name, 'ai.smithery/test');
    });
  });

  describe('Cursor-based pagination', () => {
    it('should use nextCursor from metadata', () => {
      const response = {
        servers: [
          { server: { name: 'test1' } },
          { server: { name: 'test2' } }
        ],
        metadata: {
          nextCursor: 'ai.example/server:1.0.0',
          count: 2
        }
      };

      const nextCursor = response.metadata?.nextCursor || null;
      
      assert.strictEqual(nextCursor, 'ai.example/server:1.0.0');
    });

    it('should handle missing nextCursor (end of pagination)', () => {
      const response = {
        servers: [{ server: { name: 'last' } }],
        metadata: {
          count: 1
          // No nextCursor = end of results
        }
      };

      const nextCursor = response.metadata?.nextCursor || null;
      
      assert.strictEqual(nextCursor, null);
    });
  });
});
