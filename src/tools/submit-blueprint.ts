import { DatabaseManager, DepthLevel } from '../database/schema';
import { SubmitBlueprintSchema, SubmitBlueprintResult } from '../types';
import { z } from 'zod';

export type SubmitBlueprintInput = z.infer<typeof SubmitBlueprintSchema>;

export async function submitBlueprint(
  input: unknown,
  db: DatabaseManager
): Promise<SubmitBlueprintResult> {
  // Validate input
  const parsed = SubmitBlueprintSchema.parse(input);

  // Create blueprint in database
  const blueprint = db.createBlueprint(
    parsed.blueprint,
    parsed.depth as DepthLevel,
    parsed.budget_tokens,
    parsed.source,
    parsed.metadata
  );

  // Log the submission
  db.log(blueprint.id, 'SUBMITTED', {
    depth: blueprint.depth,
    budget_tokens: blueprint.budget_tokens,
    source: parsed.source || 'direct',
    content_length: parsed.blueprint.length
  });

  return {
    blueprint_id: blueprint.id,
    status: blueprint.status as any,
    depth: blueprint.depth as any,
    budget_tokens: blueprint.budget_tokens,
    message: `Blueprint submitted for ${blueprint.depth} percolation with ${blueprint.budget_tokens} token budget`
  };
}

export const submitBlueprintTool = {
  name: 'submit_blueprint',
  description: 'Submit a skill or pathway blueprint for percolation optimization. The percolator will stress test, find holes, and patch until the blueprint is bulletproof.',
  inputSchema: {
    type: 'object',
    properties: {
      blueprint: {
        type: 'string',
        description: 'The blueprint content to optimize (skill definition, workflow, or pathway)'
      },
      depth: {
        type: 'string',
        enum: ['quick', 'standard', 'thorough', 'exhaustive'],
        description: 'Percolation depth - determines budget and thoroughness. Default: standard'
      },
      budget_tokens: {
        type: 'number',
        description: 'Optional token budget override. If not set, uses depth default.'
      },
      source: {
        type: 'string',
        description: 'Source of the blueprint (e.g., "skill-builder", "manual")'
      },
      metadata: {
        type: 'object',
        description: 'Optional metadata to attach to the blueprint'
      }
    },
    required: ['blueprint']
  }
};
