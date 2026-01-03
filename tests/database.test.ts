import { DatabaseManager, Blueprint, Hole, StressTest, Optimization } from '../src/database/schema';
import { setupTestEnvironment, cleanupTestEnvironment, getTestDatabase, SAMPLE_BLUEPRINTS } from './setup';

describe('DatabaseManager', () => {
  let db: DatabaseManager;

  beforeAll(() => {
    setupTestEnvironment();
  });

  beforeEach(() => {
    db = getTestDatabase();
  });

  afterEach(() => {
    db.close();
  });

  afterAll(() => {
    cleanupTestEnvironment();
  });

  describe('Blueprint CRUD', () => {
    it('should create a blueprint with default values', () => {
      const blueprint = db.createBlueprint(SAMPLE_BLUEPRINTS.simple);

      expect(blueprint.id).toBeDefined();
      expect(blueprint.original_content).toBe(SAMPLE_BLUEPRINTS.simple);
      expect(blueprint.current_content).toBe(SAMPLE_BLUEPRINTS.simple);
      expect(blueprint.status).toBe('pending');
      expect(blueprint.depth).toBe('standard');
      expect(blueprint.budget_tokens).toBe(5000);
      expect(blueprint.tokens_used).toBe(0);
      expect(blueprint.confidence_score).toBe(0);
    });

    it('should create a blueprint with custom depth', () => {
      const blueprint = db.createBlueprint(SAMPLE_BLUEPRINTS.simple, 'thorough');

      expect(blueprint.depth).toBe('thorough');
      expect(blueprint.budget_tokens).toBe(20000);
    });

    it('should create a blueprint with custom budget', () => {
      const blueprint = db.createBlueprint(SAMPLE_BLUEPRINTS.simple, 'standard', 10000);

      expect(blueprint.budget_tokens).toBe(10000);
    });

    it('should create a blueprint with source and metadata', () => {
      const blueprint = db.createBlueprint(
        SAMPLE_BLUEPRINTS.simple,
        'quick',
        undefined,
        'skill-builder',
        { skill_name: 'test-skill' }
      );

      expect(blueprint.source).toBe('skill-builder');
      expect(blueprint.metadata).toContain('test-skill');
    });

    it('should get a blueprint by id', () => {
      const created = db.createBlueprint(SAMPLE_BLUEPRINTS.simple);
      const retrieved = db.getBlueprint(created.id);

      expect(retrieved).not.toBeNull();
      expect(retrieved?.id).toBe(created.id);
    });

    it('should return null for non-existent blueprint', () => {
      const result = db.getBlueprint('non-existent-id');
      expect(result).toBeNull();
    });

    it('should update blueprint content', () => {
      const blueprint = db.createBlueprint(SAMPLE_BLUEPRINTS.simple);
      const newContent = 'Updated content';

      db.updateBlueprintContent(blueprint.id, newContent, 100);
      const updated = db.getBlueprint(blueprint.id);

      expect(updated?.current_content).toBe(newContent);
      expect(updated?.tokens_used).toBe(100);
    });

    it('should update blueprint status', () => {
      const blueprint = db.createBlueprint(SAMPLE_BLUEPRINTS.simple);

      db.updateBlueprintStatus(blueprint.id, 'percolating');
      let updated = db.getBlueprint(blueprint.id);
      expect(updated?.status).toBe('percolating');

      db.updateBlueprintStatus(blueprint.id, 'completed', 0.85);
      updated = db.getBlueprint(blueprint.id);
      expect(updated?.status).toBe('completed');
      expect(updated?.confidence_score).toBe(0.85);
      expect(updated?.completed_at).not.toBeNull();
    });

    it('should list blueprints', () => {
      db.createBlueprint(SAMPLE_BLUEPRINTS.simple);
      db.createBlueprint(SAMPLE_BLUEPRINTS.complex);

      const all = db.listBlueprints();
      expect(all.length).toBe(2);
    });

    it('should list blueprints by status', () => {
      const b1 = db.createBlueprint(SAMPLE_BLUEPRINTS.simple);
      db.createBlueprint(SAMPLE_BLUEPRINTS.complex);

      db.updateBlueprintStatus(b1.id, 'completed', 0.9);

      const completed = db.listBlueprints('completed');
      expect(completed.length).toBe(1);
      expect(completed[0].id).toBe(b1.id);
    });
  });

  describe('Hole CRUD', () => {
    let blueprintId: string;

    beforeEach(() => {
      const blueprint = db.createBlueprint(SAMPLE_BLUEPRINTS.simple);
      blueprintId = blueprint.id;
    });

    it('should create a hole', () => {
      const hole = db.createHole(
        blueprintId,
        'missing_step',
        'Test hole description',
        'medium'
      );

      expect(hole.id).toBeDefined();
      expect(hole.blueprint_id).toBe(blueprintId);
      expect(hole.hole_type).toBe('missing_step');
      expect(hole.status).toBe('open');
    });

    it('should create a hole with location and fix', () => {
      const hole = db.createHole(
        blueprintId,
        'security_risk',
        'Password not hashed',
        'critical',
        'Line 42',
        'Use bcrypt to hash passwords'
      );

      expect(hole.location).toBe('Line 42');
      expect(hole.suggested_fix).toBe('Use bcrypt to hash passwords');
    });

    it('should get a hole by id', () => {
      const created = db.createHole(blueprintId, 'test', 'test', 'low');
      const retrieved = db.getHole(created.id);

      expect(retrieved?.id).toBe(created.id);
    });

    it('should update hole status', () => {
      const hole = db.createHole(blueprintId, 'test', 'test', 'low');

      db.updateHoleStatus(hole.id, 'patched');
      const updated = db.getHole(hole.id);

      expect(updated?.status).toBe('patched');
      expect(updated?.patched_at).not.toBeNull();
    });

    it('should get holes for blueprint', () => {
      db.createHole(blueprintId, 'test1', 'test1', 'low');
      db.createHole(blueprintId, 'test2', 'test2', 'medium');

      const holes = db.getHolesForBlueprint(blueprintId);
      expect(holes.length).toBe(2);
    });

    it('should filter holes by status', () => {
      const h1 = db.createHole(blueprintId, 'test1', 'test1', 'low');
      db.createHole(blueprintId, 'test2', 'test2', 'medium');

      db.updateHoleStatus(h1.id, 'patched');

      const openHoles = db.getHolesForBlueprint(blueprintId, 'open');
      expect(openHoles.length).toBe(1);

      const patchedHoles = db.getHolesForBlueprint(blueprintId, 'patched');
      expect(patchedHoles.length).toBe(1);
    });

    it('should count open holes', () => {
      db.createHole(blueprintId, 'test1', 'test1', 'low');
      db.createHole(blueprintId, 'test2', 'test2', 'medium');

      const count = db.countOpenHoles(blueprintId);
      expect(count).toBe(2);
    });
  });

  describe('Stress Test CRUD', () => {
    let blueprintId: string;

    beforeEach(() => {
      const blueprint = db.createBlueprint(SAMPLE_BLUEPRINTS.simple);
      blueprintId = blueprint.id;
    });

    it('should create a stress test', () => {
      const test = db.createStressTest(
        blueprintId,
        'edge_case',
        5,
        true,
        '["No issues found"]',
        100
      );

      expect(test.id).toBeDefined();
      expect(test.blueprint_id).toBe(blueprintId);
      expect(test.test_type).toBe('edge_case');
      expect(test.passed).toBe(true);
    });

    it('should get stress test by id', () => {
      const created = db.createStressTest(blueprintId, 'test', 1, false, '[]', 50);
      const retrieved = db.getStressTest(created.id);

      expect(retrieved?.id).toBe(created.id);
      expect(retrieved?.passed).toBe(false);
    });

    it('should get stress tests for blueprint', () => {
      db.createStressTest(blueprintId, 'test1', 1, true, '[]', 50);
      db.createStressTest(blueprintId, 'test2', 2, false, '[]', 60);

      const tests = db.getStressTestsForBlueprint(blueprintId);
      expect(tests.length).toBe(2);
    });
  });

  describe('Optimization CRUD', () => {
    let blueprintId: string;

    beforeEach(() => {
      const blueprint = db.createBlueprint(SAMPLE_BLUEPRINTS.simple);
      blueprintId = blueprint.id;
    });

    it('should create an optimization', () => {
      const opt = db.createOptimization(
        blueprintId,
        'best_practices',
        'Added input validation',
        0.15,
        200
      );

      expect(opt.id).toBeDefined();
      expect(opt.blueprint_id).toBe(blueprintId);
      expect(opt.improvement_score).toBe(0.15);
    });

    it('should get optimization by id', () => {
      const created = db.createOptimization(blueprintId, 'test', 'test', 0.1, 100);
      const retrieved = db.getOptimization(created.id);

      expect(retrieved?.id).toBe(created.id);
    });

    it('should get optimizations for blueprint', () => {
      db.createOptimization(blueprintId, 'test1', 'test1', 0.1, 100);
      db.createOptimization(blueprintId, 'test2', 'test2', 0.2, 200);

      const opts = db.getOptimizationsForBlueprint(blueprintId);
      expect(opts.length).toBe(2);
    });
  });

  describe('Logging', () => {
    let blueprintId: string;

    beforeEach(() => {
      const blueprint = db.createBlueprint(SAMPLE_BLUEPRINTS.simple);
      blueprintId = blueprint.id;
    });

    it('should create a log entry', () => {
      const log = db.log(blueprintId, 'TEST_ACTION', { key: 'value' });

      expect(log.id).toBeDefined();
      expect(log.action).toBe('TEST_ACTION');
      expect(log.details).toContain('value');
    });

    it('should get logs for blueprint', () => {
      db.log(blueprintId, 'ACTION1', 'details1');
      db.log(blueprintId, 'ACTION2', 'details2');

      const logs = db.getLogsForBlueprint(blueprintId);
      expect(logs.length).toBe(2);
    });
  });

  describe('Statistics', () => {
    it('should return empty stats for new database', () => {
      const stats = db.getStats();

      expect(stats.total_blueprints).toBe(0);
      expect(stats.pending).toBe(0);
      expect(stats.total_holes).toBe(0);
    });

    it('should calculate correct statistics', () => {
      const b1 = db.createBlueprint(SAMPLE_BLUEPRINTS.simple);
      const b2 = db.createBlueprint(SAMPLE_BLUEPRINTS.complex);

      db.createHole(b1.id, 'test', 'test', 'low');
      db.createStressTest(b1.id, 'test', 1, true, '[]', 50);
      db.createOptimization(b1.id, 'test', 'test', 0.1, 100);

      db.updateBlueprintStatus(b2.id, 'completed', 0.9);

      const stats = db.getStats();

      expect(stats.total_blueprints).toBe(2);
      expect(stats.pending).toBe(1);
      expect(stats.completed).toBe(1);
      expect(stats.total_holes).toBe(1);
      expect(stats.total_tests).toBe(1);
      expect(stats.passed_tests).toBe(1);
      expect(stats.total_optimizations).toBe(1);
    });
  });

  describe('Cleanup', () => {
    it('should cleanup old completed blueprints', () => {
      // Create a blueprint and mark it completed
      const blueprint = db.createBlueprint(SAMPLE_BLUEPRINTS.simple);
      db.updateBlueprintStatus(blueprint.id, 'completed', 0.9);

      // Cleanup with 0 days should remove it
      const deleted = db.cleanup(0);
      expect(deleted).toBe(1);

      const remaining = db.listBlueprints();
      expect(remaining.length).toBe(0);
    });
  });
});
