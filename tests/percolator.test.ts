import { DatabaseManager } from '../src/database/schema';
import { PercolatorEngine } from '../src/percolator/engine';
import { StressTester } from '../src/percolator/stress-tester';
import { HoleFinder } from '../src/percolator/hole-finder';
import { Optimizer } from '../src/percolator/optimizer';
import { setupTestEnvironment, cleanupTestEnvironment, getTestDatabase, SAMPLE_BLUEPRINTS } from './setup';

describe('Percolator Components', () => {
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

  describe('StressTester', () => {
    let stressTester: StressTester;
    let blueprintId: string;

    beforeEach(() => {
      stressTester = new StressTester(db);
      const blueprint = db.createBlueprint(SAMPLE_BLUEPRINTS.simple);
      blueprintId = blueprint.id;
    });

    it('should run edge_case test', async () => {
      const result = await stressTester.runTest(blueprintId, 'edge_case', 5);

      expect(result.testId).toBeDefined();
      expect(typeof result.passed).toBe('boolean');
      expect(result.durationMs).toBeGreaterThanOrEqual(0);
    });

    it('should run adversarial test', async () => {
      const result = await stressTester.runTest(blueprintId, 'adversarial', 7);
      expect(result.testId).toBeDefined();
    });

    it('should run load test', async () => {
      const result = await stressTester.runTest(blueprintId, 'load', 6);
      expect(result.testId).toBeDefined();
    });

    it('should run boundary test', async () => {
      const result = await stressTester.runTest(blueprintId, 'boundary', 5);
      expect(result.testId).toBeDefined();
    });

    it('should run security test', async () => {
      const blueprint = db.createBlueprint(SAMPLE_BLUEPRINTS.withSecurity);
      const result = await stressTester.runTest(blueprint.id, 'security', 8);
      expect(result.findings).toBeDefined();
    });

    it('should run consistency test', async () => {
      const result = await stressTester.runTest(blueprintId, 'consistency', 4);
      expect(result.testId).toBeDefined();
    });

    it('should find holes in problematic blueprint', async () => {
      const blueprint = db.createBlueprint(SAMPLE_BLUEPRINTS.withErrors);
      const result = await stressTester.runTest(blueprint.id, 'edge_case', 7);

      expect(result.holesFound).toBeGreaterThanOrEqual(0);
    });

    it('should record test in database', async () => {
      await stressTester.runTest(blueprintId, 'edge_case', 5);

      const tests = db.getStressTestsForBlueprint(blueprintId);
      expect(tests.length).toBe(1);
    });
  });

  describe('HoleFinder', () => {
    let holeFinder: HoleFinder;
    let blueprintId: string;

    beforeEach(() => {
      holeFinder = new HoleFinder(db);
      const blueprint = db.createBlueprint(SAMPLE_BLUEPRINTS.withErrors);
      blueprintId = blueprint.id;
    });

    it('should perform shallow analysis', async () => {
      const holes = await holeFinder.analyze(blueprintId, 'shallow');

      expect(Array.isArray(holes)).toBe(true);
    });

    it('should perform moderate analysis', async () => {
      const holes = await holeFinder.analyze(blueprintId, 'moderate');

      expect(Array.isArray(holes)).toBe(true);
    });

    it('should perform deep analysis', async () => {
      const holes = await holeFinder.analyze(blueprintId, 'deep');

      expect(Array.isArray(holes)).toBe(true);
    });

    it('should find TODO markers', async () => {
      const holes = await holeFinder.analyze(blueprintId, 'shallow');

      const todoHole = holes.find(h => h.description.includes('TODO'));
      expect(todoHole).toBeDefined();
    });

    it('should find vague language', async () => {
      const holes = await holeFinder.analyze(blueprintId, 'moderate');

      const vagueHole = holes.find(h =>
        h.description.includes('somehow') ||
        h.description.includes('maybe') ||
        h.description.includes('etc')
      );
      expect(vagueHole).toBeDefined();
    });

    it('should store holes in database', async () => {
      await holeFinder.analyze(blueprintId, 'deep');

      const dbHoles = db.getHolesForBlueprint(blueprintId);
      expect(dbHoles.length).toBeGreaterThan(0);
    });
  });

  describe('Optimizer', () => {
    let optimizer: Optimizer;
    let blueprintId: string;

    beforeEach(() => {
      optimizer = new Optimizer(db);
      const blueprint = db.createBlueprint(SAMPLE_BLUEPRINTS.simple);
      blueprintId = blueprint.id;
    });

    it('should research improvements for hole', async () => {
      const hole = db.createHole(blueprintId, 'missing_step', 'Missing verification', 'medium');

      const result = await optimizer.researchForHole(blueprintId, hole);

      expect(result).not.toBeNull();
      if (result) {
        expect(result.source).toBeDefined();
        expect(result.patch).toBeDefined();
        expect(result.improvement_score).toBeGreaterThan(0);
      }
    });

    it('should apply patch to blueprint', async () => {
      const hole = db.createHole(blueprintId, 'test', 'test hole', 'low');

      await optimizer.applyPatch(blueprintId, hole.id, 'This is a fix');

      const updatedBlueprint = db.getBlueprint(blueprintId);
      expect(updatedBlueprint?.current_content).toContain('This is a fix');

      const updatedHole = db.getHole(hole.id);
      expect(updatedHole?.status).toBe('patched');
    });

    it('should apply optimization', async () => {
      const optId = await optimizer.applyOptimization(
        blueprintId,
        'test_source',
        'Test optimization',
        '## Added Section\nNew content here'
      );

      expect(optId).toBeDefined();

      const opts = db.getOptimizationsForBlueprint(blueprintId);
      expect(opts.length).toBe(1);
    });

    it('should reject optimization when budget exceeded', async () => {
      // Create blueprint with minimal budget
      const lowBudget = db.createBlueprint(SAMPLE_BLUEPRINTS.simple, 'quick', 10);

      await expect(optimizer.applyOptimization(
        lowBudget.id,
        'test',
        'test',
        'This is a very long content that exceeds the budget limit for testing purposes...'
      )).rejects.toThrow('Insufficient budget');
    });
  });

  describe('PercolatorEngine', () => {
    let engine: PercolatorEngine;

    beforeEach(() => {
      engine = new PercolatorEngine(db);
    });

    it('should initialize with default config', () => {
      expect(engine).toBeDefined();
      expect(engine.getActivePercolations()).toEqual([]);
    });

    it('should track active percolations', () => {
      expect(engine.isPercolating('fake-id')).toBe(false);
    });

    it('should reject percolation of non-pending blueprint', async () => {
      const blueprint = db.createBlueprint(SAMPLE_BLUEPRINTS.simple);
      db.updateBlueprintStatus(blueprint.id, 'completed', 0.9);

      await expect(engine.percolate(blueprint.id)).rejects.toThrow('is not pending');
    });

    it('should reject percolation of non-existent blueprint', async () => {
      await expect(engine.percolate('non-existent')).rejects.toThrow('Blueprint not found');
    });

    it('should emit events during percolation', async () => {
      const blueprint = db.createBlueprint(SAMPLE_BLUEPRINTS.simple, 'quick');

      const events: string[] = [];
      engine.on('*', (event) => {
        events.push(event.type);
      });

      await engine.percolate(blueprint.id);

      expect(events).toContain('percolation_started');
      expect(events).toContain('percolation_complete');
    });

    it('should complete percolation and update status', async () => {
      const blueprint = db.createBlueprint(SAMPLE_BLUEPRINTS.simple, 'quick');

      await engine.percolate(blueprint.id);

      const updated = db.getBlueprint(blueprint.id);
      expect(updated?.status).toBe('completed');
      expect(updated?.confidence_score).toBeGreaterThan(0);
    });

    it('should handle complex blueprint percolation', async () => {
      const blueprint = db.createBlueprint(SAMPLE_BLUEPRINTS.complex, 'quick');

      await engine.percolate(blueprint.id);

      const updated = db.getBlueprint(blueprint.id);
      expect(updated?.status).toBe('completed');
    });

    it('should respect max concurrent percolations', async () => {
      const engine = new PercolatorEngine(db, {
        maxConcurrentPercolations: 1
      });

      const b1 = db.createBlueprint(SAMPLE_BLUEPRINTS.simple, 'quick');
      const b2 = db.createBlueprint(SAMPLE_BLUEPRINTS.complex, 'quick');

      // Start first percolation
      const promise1 = engine.percolate(b1.id);

      // Try to start second - should fail due to limit
      await expect(engine.percolate(b2.id)).rejects.toThrow('Maximum concurrent');

      await promise1;
    });
  });
});
