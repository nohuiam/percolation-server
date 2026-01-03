import { DatabaseManager } from '../database/schema';
import { GetBlueprintStatusSchema, BlueprintStatusResult, HoleStatus } from '../types';
import { z } from 'zod';

export type GetBlueprintStatusInput = z.infer<typeof GetBlueprintStatusSchema>;

export async function getBlueprintStatus(
  input: unknown,
  db: DatabaseManager
): Promise<BlueprintStatusResult> {
  // Validate input
  const parsed = GetBlueprintStatusSchema.parse(input);

  // Get blueprint
  const blueprint = db.getBlueprint(parsed.blueprint_id);
  if (!blueprint) {
    throw new Error(`Blueprint not found: ${parsed.blueprint_id}`);
  }

  // Get related data
  const allHoles = db.getHolesForBlueprint(blueprint.id);
  const openHoles = allHoles.filter(h => h.status === 'open').length;
  const patchedHoles = allHoles.filter(h => h.status === 'patched').length;

  const stressTests = db.getStressTestsForBlueprint(blueprint.id);
  const passedTests = stressTests.filter(t => t.passed).length;

  const optimizations = db.getOptimizationsForBlueprint(blueprint.id);

  return {
    id: blueprint.id,
    status: blueprint.status as any,
    depth: blueprint.depth as any,
    budget_tokens: blueprint.budget_tokens,
    tokens_used: blueprint.tokens_used,
    confidence_score: blueprint.confidence_score,
    open_holes: openHoles,
    patched_holes: patchedHoles,
    stress_tests_run: stressTests.length,
    stress_tests_passed: passedTests,
    optimizations_applied: optimizations.length,
    submitted_at: blueprint.submitted_at,
    completed_at: blueprint.completed_at
  };
}

export const getBlueprintStatusTool = {
  name: 'get_blueprint_status',
  description: 'Get the current percolation status of a blueprint including holes found, tests run, and optimizations applied.',
  inputSchema: {
    type: 'object',
    properties: {
      blueprint_id: {
        type: 'string',
        description: 'The UUID of the blueprint to check'
      }
    },
    required: ['blueprint_id']
  }
};
