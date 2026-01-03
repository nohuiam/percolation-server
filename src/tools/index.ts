// Tool implementations
export { submitBlueprint, submitBlueprintTool } from './submit-blueprint';
export { getBlueprintStatus, getBlueprintStatusTool } from './get-blueprint-status';
export { stressTest, stressTestTool } from './stress-test';
export { findHoles, findHolesTool } from './find-holes';
export { patchHole, patchHoleTool } from './patch-hole';
export { researchImprovements, researchImprovementsTool } from './research-improvements';
export { applyOptimization, applyOptimizationTool } from './apply-optimization';
export { getPercolationResult, getPercolationResultTool } from './get-percolation-result';

// All tool definitions for MCP registration
export const allTools = [
  {
    name: 'submit_blueprint',
    description: 'Submit a skill or pathway blueprint for percolation optimization',
    inputSchema: {
      type: 'object' as const,
      properties: {
        blueprint: { type: 'string', description: 'The blueprint content to optimize' },
        depth: { type: 'string', enum: ['quick', 'standard', 'thorough', 'exhaustive'], description: 'Percolation depth' },
        budget_tokens: { type: 'number', description: 'Optional token budget override' },
        source: { type: 'string', description: 'Source of the blueprint' },
        metadata: { type: 'object', description: 'Optional metadata' }
      },
      required: ['blueprint']
    }
  },
  {
    name: 'get_blueprint_status',
    description: 'Get the current percolation status of a blueprint',
    inputSchema: {
      type: 'object' as const,
      properties: {
        blueprint_id: { type: 'string', description: 'The UUID of the blueprint' }
      },
      required: ['blueprint_id']
    }
  },
  {
    name: 'stress_test',
    description: 'Run adversarial stress tests against a blueprint',
    inputSchema: {
      type: 'object' as const,
      properties: {
        blueprint_id: { type: 'string', description: 'The UUID of the blueprint' },
        test_type: { type: 'string', enum: ['edge_case', 'adversarial', 'load', 'boundary', 'security', 'consistency'], description: 'Type of stress test' },
        intensity: { type: 'number', minimum: 1, maximum: 10, description: 'Test intensity (1-10)' }
      },
      required: ['blueprint_id', 'test_type']
    }
  },
  {
    name: 'find_holes',
    description: 'Analyze a blueprint to identify weaknesses and gaps',
    inputSchema: {
      type: 'object' as const,
      properties: {
        blueprint_id: { type: 'string', description: 'The UUID of the blueprint' },
        analysis_depth: { type: 'string', enum: ['shallow', 'moderate', 'deep'], description: 'Depth of analysis' }
      },
      required: ['blueprint_id']
    }
  },
  {
    name: 'patch_hole',
    description: 'Apply a fix to an identified hole in the blueprint',
    inputSchema: {
      type: 'object' as const,
      properties: {
        blueprint_id: { type: 'string', description: 'The UUID of the blueprint' },
        hole_id: { type: 'string', description: 'The UUID of the hole to patch' },
        patch: { type: 'string', description: 'The patch content to apply' }
      },
      required: ['blueprint_id', 'hole_id', 'patch']
    }
  },
  {
    name: 'research_improvements',
    description: 'Query for optimization ideas to improve the blueprint',
    inputSchema: {
      type: 'object' as const,
      properties: {
        blueprint_id: { type: 'string', description: 'The UUID of the blueprint' },
        focus_areas: { type: 'array', items: { type: 'string' }, description: 'Focus areas for research' }
      },
      required: ['blueprint_id']
    }
  },
  {
    name: 'apply_optimization',
    description: 'Apply a researched improvement to the blueprint',
    inputSchema: {
      type: 'object' as const,
      properties: {
        blueprint_id: { type: 'string', description: 'The UUID of the blueprint' },
        optimization_id: { type: 'string', description: 'The UUID of the optimization' }
      },
      required: ['blueprint_id', 'optimization_id']
    }
  },
  {
    name: 'get_percolation_result',
    description: 'Get the final optimized blueprint with confidence score',
    inputSchema: {
      type: 'object' as const,
      properties: {
        blueprint_id: { type: 'string', description: 'The UUID of the blueprint' }
      },
      required: ['blueprint_id']
    }
  }
];
