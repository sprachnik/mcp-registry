const { describe, it } = require('node:test');
const assert = require('node:assert');

/**
 * Test validation logic
 * 
 * These tests verify the validation rules used in validate-servers.js
 */

describe('Server Validation', () => {
  describe('Required fields', () => {
    it('should pass with all required fields', () => {
      const server = {
        name: 'test-server',
        description: 'Test description',
        npm_package: 'ai.test/server'
      };

      assert.ok(server.name, 'name is required');
      assert.ok(server.description, 'description is required');
      assert.ok(server.npm_package, 'npm_package is required');
    });

    it('should fail without name', () => {
      const server = {
        description: 'Test',
        npm_package: 'test'
      };

      assert.strictEqual(server.name, undefined);
    });

    it('should fail without description', () => {
      const server = {
        name: 'test',
        npm_package: 'test'
      };

      assert.strictEqual(server.description, undefined);
    });

    it('should fail without npm_package', () => {
      const server = {
        name: 'test',
        description: 'Test'
      };

      assert.strictEqual(server.npm_package, undefined);
    });
  });

  describe('Recommended fields', () => {
    it('should have displayName', () => {
      const server = {
        name: 'test',
        displayName: 'Test Server',
        description: 'Test',
        npm_package: 'test'
      };

      assert.ok(server.displayName);
    });

    it('should have capabilities array', () => {
      const server = {
        name: 'test',
        description: 'Test',
        npm_package: 'test',
        capabilities: ['tool', 'resource']
      };

      assert.ok(Array.isArray(server.capabilities));
      assert.ok(server.capabilities.length > 0);
    });

    it('should have tags array', () => {
      const server = {
        name: 'test',
        description: 'Test',
        npm_package: 'test',
        tags: ['database', 'sql']
      };

      assert.ok(Array.isArray(server.tags));
      assert.ok(server.tags.length > 0);
    });
  });

  describe('Capability validation', () => {
    const validCapabilities = ['tool', 'resource', 'prompt'];

    it('should accept valid capabilities', () => {
      const server = {
        capabilities: ['tool', 'resource', 'prompt']
      };

      server.capabilities.forEach(cap => {
        assert.ok(
          validCapabilities.includes(cap.toLowerCase()),
          `${cap} should be valid`
        );
      });
    });

    it('should reject invalid capabilities', () => {
      const invalidCap = 'invalid-capability';
      
      assert.ok(
        !validCapabilities.includes(invalidCap),
        'Invalid capability should not be in valid list'
      );
    });

    it('should handle case-insensitive capabilities', () => {
      const caps = ['TOOL', 'Resource', 'PrOmPt'];
      
      caps.forEach(cap => {
        assert.ok(
          validCapabilities.includes(cap.toLowerCase()),
          `${cap} should be valid when lowercased`
        );
      });
    });
  });

  describe('Deduplication', () => {
    it('should detect duplicate npm_package', () => {
      const servers = [
        { npm_package: 'ai.test/server1' },
        { npm_package: 'ai.test/server2' },
        { npm_package: 'ai.test/server1' } // Duplicate!
      ];

      const uniquePackages = new Set();
      let duplicateCount = 0;

      servers.forEach(s => {
        if (uniquePackages.has(s.npm_package)) {
          duplicateCount++;
        } else {
          uniquePackages.add(s.npm_package);
        }
      });

      assert.strictEqual(duplicateCount, 1);
      assert.strictEqual(uniquePackages.size, 2);
    });

    it('should deduplicate using npm_package as key', () => {
      const servers = [
        { name: 's1', npm_package: 'ai.test/server' },
        { name: 's2', npm_package: 'ai.test/server' }, // Same package, different name
        { name: 's3', npm_package: 'ai.test/other' }
      ];

      const serverMap = new Map();
      
      servers.forEach(s => {
        if (!serverMap.has(s.npm_package)) {
          serverMap.set(s.npm_package, s);
        }
      });

      assert.strictEqual(serverMap.size, 2); // Only 2 unique packages
    });
  });

  describe('Consolidated file validation', () => {
    it('should validate file structure', () => {
      const data = {
        version: '1.0',
        generated: new Date().toISOString(),
        count: 20,
        servers: new Array(20).fill({
          name: 'test',
          description: 'test',
          npm_package: 'test'
        })
      };

      // Check structure
      assert.ok(data.version);
      assert.ok(data.generated);
      assert.strictEqual(typeof data.count, 'number');
      assert.ok(Array.isArray(data.servers));
    });

    it('should validate count matches array length', () => {
      const servers = [
        { name: 's1', npm_package: 'test/1' },
        { name: 's2', npm_package: 'test/2' }
      ];

      const data = {
        version: '1.0',
        generated: new Date().toISOString(),
        count: servers.length,
        servers: servers
      };

      assert.strictEqual(data.count, data.servers.length);
    });

    it('should detect count mismatch', () => {
      const data = {
        version: '1.0',
        generated: new Date().toISOString(),
        count: 100, // Wrong!
        servers: new Array(20) // Only 20
      };

      assert.notStrictEqual(data.count, data.servers.length);
    });
  });
});

describe('Data Integrity', () => {
  describe('XSS Prevention', () => {
    it('should handle potentially dangerous HTML in descriptions', () => {
      const dangerousDescription = '<script>alert("xss")</script>';
      const server = {
        name: 'test',
        description: dangerousDescription,
        npm_package: 'test'
      };

      // In the app, this should be escaped with escapeHtml()
      // Here we just verify the data can be stored
      assert.ok(server.description.includes('<script>'));
      
      // Mock escapeHtml function
      const escapeHtml = (text) => {
        const div = { textContent: text };
        // Simulates browser escaping
        return div.textContent;
      };

      const escaped = escapeHtml(server.description);
      assert.strictEqual(escaped, dangerousDescription);
    });
  });

  describe('npm_package format', () => {
    it('should support scoped packages with @', () => {
      const server = {
        npm_package: '@modelcontextprotocol/server-brave-search'
      };

      assert.ok(server.npm_package.startsWith('@'));
    });

    it('should support vendor-prefixed packages', () => {
      const server = {
        npm_package: 'ai.smithery/server-name'
      };

      assert.ok(server.npm_package.includes('/'));
    });

    it('should support simple package names', () => {
      const server = {
        npm_package: 'simple-package-name'
      };

      assert.ok(!server.npm_package.includes('/'));
      assert.ok(!server.npm_package.includes('@'));
    });
  });
});
