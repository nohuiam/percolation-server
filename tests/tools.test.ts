import { DatabaseManager } from '../src/database/schema';
import {
  submitBlueprint,
  getBlueprintStatus,
  stressTest,
  findHoles,
  patchHole,
  researchImprovements,
  applyOptimization,
  getPercolationResult
} from '../src/tools';
import { setupTestEnvironment, cleanupTestEnvironment, getTestDatabase, SAMPLE_BLUEPRINTS } from './setup';

describe('MCP Tools', () => {
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

  describe('submit_blueprint', () => {
    it('should submit a blueprint with default settings', async () => {
      const result = await submitBlueprint({
        blueprint: SAMPLE_BLUEPRINTS.simple
      }, db);

      expect(result.blueprint_id).toBeDefined();
      expect(result.status).toBe('pending');
      expect(result.depth).toBe('standard');
      expect(result.budget_tokens).toBe(5000);
    });

    it('should submit a blueprint with custom depth', async () => {
      const result = await submitBlueprint({
        blueprint: SAMPLE_BLUEPRINTS.simple,
        depth: 'thorough'
      }, db);

      expect(result.depth).toBe('thorough');
      expect(result.budget_tokens).toBe(20000);
    });

    it('should submit a blueprint with custom budget', async () => {
      const result = await submitBlueprint({
        blueprint: SAMPLE_BLUEPRINTS.simple,
        budget_tokens: 3000
      }, db);

      expect(result.budget_tokens).toBe(3000);
    });

    it('should submit a blueprint with source and metadata', async () => {
      const result = await submitBlueprint({
        blueprint: SAMPLE_BLUEPRINTS.simple,
        source: 'test-source',
        metadata: { key: 'value' }
      }, db);

      expect(result.blueprint_id).toBeDefined();
    });

    it('should reject empty blueprint', async () => {
      await expect(submitBlueprint({
        blueprint: ''
      }, db)).rejects.toThrow();
    });
  });

  describe('get_blueprint_status', () => {
    let blueprintId: string;

    beforeEach(async () => {
      const result = await submitBlueprint({
        blueprint: SAMPLE_BLUEPRINTS.simple
      }, db);
      blueprintId = result.blueprint_id;
    });

    it('should get blueprint status', async () => {
      const status = await getBlueprintStatus({
        blueprint_id: blueprintId
      }, db);

      expect(status.id).toBe(blueprintId);
      expect(status.status).toBe('pending');
      expect(status.open_holes).toBe(0);
      expect(status.stress_tests_run).toBe(0);
    });

    it('should reject invalid blueprint id', async () => {
      await expect(getBlueprintStatus({
        blueprint_id: 'invalid-id'
      }, db)).rejects.toThrow();
    });

    it('should reject non-existent blueprint', async () => {
      await expect(getBlueprintStatus({
        blueprint_id: '00000000-0000-0000-0000-000000000000'
      }, db)).rejects.toThrow('Blueprint not found');
    });
  });

  describe('stress_test', () => {
    let blueprintId: string;

    beforeEach(async () => {
      const result = await submitBlueprint({
        blueprint: SAMPLE_BLUEPRINTS.simple
      }, db);
      blueprintId = result.blueprint_id;
    });

    it('should run edge_case test', async () => {
      const result = await stressTest({
        blueprint_id: blueprintId,
        test_type: 'edge_case',
        intensity: 5
      }, db);

      expect(result.test_id).toBeDefined();
      expect(result.test_type).toBe('edge_case');
      expect(result.intensity).toBe(5);
      expect(typeof result.passed).toBe('boolean');
    });

    it('should run adversarial test', async () => {
      const result = await stressTest({
        blueprint_id: blueprintId,
        test_type: 'adversarial',
        intensity: 7
      }, db);

      expect(result.test_type).toBe('adversarial');
    });

    it('should run security test on secure blueprint', async () => {
      const secureResult = await submitBlueprint({
        blueprint: SAMPLE_BLUEPRINTS.withSecurity
      }, db);

      const result = await stressTest({
        blueprint_id: secureResult.blueprint_id,
        test_type: 'security',
        intensity: 8
      }, db);

      expect(result.findings).toBeDefined();
    });

    it('should use default intensity', async () => {
      const result = await stressTest({
        blueprint_id: blueprintId,
        test_type: 'boundary'
      }, db);

      expect(result.intensity).toBe(5);
    });

    it('should find holes on problematic blueprint', async () => {
      const problematic = await submitBlueprint({
        blueprint: SAMPLE_BLUEPRINTS.withErrors
      }, db);

      const result = await stressTest({
        blueprint_id: problematic.blueprint_id,
        test_type: 'edge_case',
        intensity: 7
      }, db);

      expect(result.holes_found).toBeGreaterThan(0);
    });
  });

  describe('find_holes', () => {
    let blueprintId: string;

    beforeEach(async () => {
      const result = await submitBlueprint({
        blueprint: SAMPLE_BLUEPRINTS.withErrors
      }, db);
      blueprintId = result.blueprint_id;
    });

    it('should find holes with shallow analysis', async () => {
      const result = await findHoles({
        blueprint_id: blueprintId,
        analysis_depth: 'shallow'
      }, db);

      expect(result.blueprint_id).toBe(blueprintId);
      expect(result.holes_found).toBeGreaterThan(0);
    });

    it('should find more holes with deep analysis', async () => {
      const shallow = await findHoles({
        blueprint_id: blueprintId,
        analysis_depth: 'shallow'
      }, db);

      // Create new blueprint to avoid accumulation
      const newBlueprint = await submitBlueprint({
        blueprint: SAMPLE_BLUEPRINTS.withErrors
      }, db);

      const deep = await findHoles({
        blueprint_id: newBlueprint.blueprint_id,
        analysis_depth: 'deep'
      }, db);

      expect(deep.holes_found).toBeGreaterThanOrEqual(shallow.holes_found);
    });

    it('should use default analysis depth', async () => {
      const result = await findHoles({
        blueprint_id: blueprintId
      }, db);

      expect(result.holes).toBeDefined();
    });

    it('should return hole details', async () => {
      const result = await findHoles({
        blueprint_id: blueprintId,
        analysis_depth: 'deep'
      }, db);

      if (result.holes.length > 0) {
        const hole = result.holes[0];
        expect(hole.id).toBeDefined();
        expect(hole.type).toBeDefined();
        expect(hole.description).toBeDefined();
        expect(hole.severity).toBeDefined();
      }
    });
  });

  describe('patch_hole', () => {
    let blueprintId: string;
    let holeId: string;

    beforeEach(async () => {
      const result = await submitBlueprint({
        blueprint: SAMPLE_BLUEPRINTS.withErrors
      }, db);
      blueprintId = result.blueprint_id;

      const holes = await findHoles({
        blueprint_id: blueprintId,
        analysis_depth: 'deep'
      }, db);

      if (holes.holes.length > 0) {
        holeId = holes.holes[0].id;
      }
    });

    it('should patch a hole', async () => {
      if (!holeId) {
        // Create a hole manually if none found
        const hole = db.createHole(blueprintId, 'test', 'test hole', 'medium');
        holeId = hole.id;
      }

      const result = await patchHole({
        blueprint_id: blueprintId,
        hole_id: holeId,
        patch: 'This is the fix for the issue.'
      }, db);

      expect(result.hole_id).toBe(holeId);
      expect(result.patch_applied).toBe(true);
      expect(result.status).toBe('patched');
    });

    it('should reject patching non-existent hole', async () => {
      await expect(patchHole({
        blueprint_id: blueprintId,
        hole_id: '00000000-0000-0000-0000-000000000000',
        patch: 'fix'
      }, db)).rejects.toThrow('Hole not found');
    });

    it('should reject patching already patched hole', async () => {
      if (!holeId) {
        const hole = db.createHole(blueprintId, 'test', 'test', 'low');
        holeId = hole.id;
      }

      // Patch once
      await patchHole({
        blueprint_id: blueprintId,
        hole_id: holeId,
        patch: 'first patch'
      }, db);

      // Try to patch again
      await expect(patchHole({
        blueprint_id: blueprintId,
        hole_id: holeId,
        patch: 'second patch'
      }, db)).rejects.toThrow('Hole is not open');
    });
  });

  describe('research_improvements', () => {
    let blueprintId: string;

    beforeEach(async () => {
      const result = await submitBlueprint({
        blueprint: SAMPLE_BLUEPRINTS.simple
      }, db);
      blueprintId = result.blueprint_id;
    });

    it('should return improvement suggestions', async () => {
      const result = await researchImprovements({
        blueprint_id: blueprintId
      }, db);

      expect(result.blueprint_id).toBe(blueprintId);
      expect(result.improvements).toBeDefined();
      expect(Array.isArray(result.improvements)).toBe(true);
    });

    it('should return improvements with focus areas', async () => {
      const result = await researchImprovements({
        blueprint_id: blueprintId,
        focus_areas: ['security', 'performance']
      }, db);

      expect(result.improvements.length).toBeGreaterThan(0);
    });

    it('should include improvement details', async () => {
      const result = await researchImprovements({
        blueprint_id: blueprintId
      }, db);

      if (result.improvements.length > 0) {
        const improvement = result.improvements[0];
        expect(improvement.id).toBeDefined();
        expect(improvement.source).toBeDefined();
        expect(improvement.description).toBeDefined();
        expect(improvement.estimated_improvement).toBeDefined();
        expect(improvement.tokens_cost).toBeDefined();
      }
    });
  });

  describe('apply_optimization', () => {
    let blueprintId: string;

    beforeEach(async () => {
      const result = await submitBlueprint({
        blueprint: SAMPLE_BLUEPRINTS.simple
      }, db);
      blueprintId = result.blueprint_id;
    });

    it('should apply an optimization', async () => {
      const research = await researchImprovements({
        blueprint_id: blueprintId
      }, db);

      if (research.improvements.length > 0) {
        const result = await applyOptimization({
          blueprint_id: blueprintId,
          optimization_id: research.improvements[0].id
        }, db);

        expect(result.blueprint_id).toBe(blueprintId);
        expect(result.applied).toBe(true);
        expect(result.tokens_used).toBeGreaterThan(0);
      }
    });
  });

  describe('get_percolation_result', () => {
    let blueprintId: string;

    beforeEach(async () => {
      const result = await submitBlueprint({
        blueprint: SAMPLE_BLUEPRINTS.complex
      }, db);
      blueprintId = result.blueprint_id;
    });

    it('should return percolation result', async () => {
      const result = await getPercolationResult({
        blueprint_id: blueprintId
      }, db);

      expect(result.blueprint_id).toBe(blueprintId);
      expect(result.original_content).toBeDefined();
      expect(result.optimized_content).toBeDefined();
      expect(result.summary).toBeDefined();
      expect(result.recommendations).toBeDefined();
    });

    it('should include summary statistics', async () => {
      // Run some operations first
      await stressTest({
        blueprint_id: blueprintId,
        test_type: 'edge_case'
      }, db);

      const result = await getPercolationResult({
        blueprint_id: blueprintId
      }, db);

      expect(result.summary.stress_tests_run).toBe(1);
      expect(typeof result.summary.tokens_used).toBe('number');
      expect(typeof result.summary.budget_tokens).toBe('number');
    });

    it('should provide recommendations', async () => {
      const result = await getPercolationResult({
        blueprint_id: blueprintId
      }, db);

      expect(Array.isArray(result.recommendations)).toBe(true);
      expect(result.recommendations.length).toBeGreaterThan(0);
    });
  });
});
