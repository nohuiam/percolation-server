import { DatabaseManager } from '../database/schema';
import { GetPercolationResultSchema, PercolationResult, BlueprintStatus } from '../types';
import { z } from 'zod';

export type GetPercolationResultInput = z.infer<typeof GetPercolationResultSchema>;

export async function getPercolationResult(
  input: unknown,
  db: DatabaseManager
): Promise<PercolationResult> {
  // Validate input
  const parsed = GetPercolationResultSchema.parse(input);

  // Get blueprint
  const blueprint = db.getBlueprint(parsed.blueprint_id);
  if (!blueprint) {
    throw new Error(`Blueprint not found: ${parsed.blueprint_id}`);
  }

  // Get all related data
  const holes = db.getHolesForBlueprint(blueprint.id);
  const stressTests = db.getStressTestsForBlueprint(blueprint.id);
  const optimizations = db.getOptimizationsForBlueprint(blueprint.id);

  // Calculate statistics
  const totalHoles = holes.length;
  const patchedHoles = holes.filter(h => h.status === 'patched').length;
  const totalTests = stressTests.length;
  const passedTests = stressTests.filter(t => t.passed).length;

  // Generate recommendations based on current state
  const recommendations: string[] = [];

  // Check for open holes
  const openHoles = holes.filter(h => h.status === 'open');
  if (openHoles.length > 0) {
    recommendations.push(`${openHoles.length} holes remain open - consider patching before deployment`);
    for (const hole of openHoles.slice(0, 3)) {
      recommendations.push(`  - [${hole.severity}] ${hole.hole_type}: ${hole.description.substring(0, 50)}...`);
    }
  }

  // Check test coverage
  if (totalTests < 3) {
    recommendations.push('Run more stress tests for comprehensive coverage');
  }

  // Check test pass rate
  if (totalTests > 0 && passedTests / totalTests < 0.8) {
    recommendations.push('Test pass rate is below 80% - review failing test findings');
  }

  // Check token usage
  const usagePercent = (blueprint.tokens_used / blueprint.budget_tokens) * 100;
  if (usagePercent > 90) {
    recommendations.push('Token budget nearly exhausted - consider increasing for more optimization');
  } else if (usagePercent < 50) {
    recommendations.push('Token budget underutilized - consider deeper percolation');
  }

  // Check confidence score
  if (blueprint.confidence_score < 0.7) {
    recommendations.push('Confidence score is low - more testing and optimization recommended');
  }

  // If no recommendations, blueprint looks good
  if (recommendations.length === 0) {
    recommendations.push('Blueprint appears well-optimized and ready for deployment');
  }

  // Log the result retrieval
  db.log(blueprint.id, 'GET_RESULT', {
    status: blueprint.status,
    confidence_score: blueprint.confidence_score,
    holes_patched: patchedHoles,
    tests_passed: passedTests,
    optimizations_applied: optimizations.length
  });

  return {
    blueprint_id: blueprint.id,
    status: blueprint.status as BlueprintStatus,
    original_content: blueprint.original_content,
    optimized_content: blueprint.current_content,
    confidence_score: blueprint.confidence_score,
    summary: {
      total_holes_found: totalHoles,
      holes_patched: patchedHoles,
      stress_tests_run: totalTests,
      stress_tests_passed: passedTests,
      optimizations_applied: optimizations.length,
      tokens_used: blueprint.tokens_used,
      budget_tokens: blueprint.budget_tokens
    },
    recommendations
  };
}

export const getPercolationResultTool = {
  name: 'get_percolation_result',
  description: 'Get the final optimized blueprint with confidence score and summary of all percolation activities.',
  inputSchema: {
    type: 'object',
    properties: {
      blueprint_id: {
        type: 'string',
        description: 'The UUID of the blueprint'
      }
    },
    required: ['blueprint_id']
  }
};
