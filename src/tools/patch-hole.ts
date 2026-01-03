import { DatabaseManager } from '../database/schema';
import { PatchHoleSchema, PatchHoleResult, HoleStatus } from '../types';
import { z } from 'zod';

export type PatchHoleInput = z.infer<typeof PatchHoleSchema>;

// Estimate tokens for a string (rough approximation)
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

export async function patchHole(
  input: unknown,
  db: DatabaseManager
): Promise<PatchHoleResult> {
  // Validate input
  const parsed = PatchHoleSchema.parse(input);

  // Get blueprint
  const blueprint = db.getBlueprint(parsed.blueprint_id);
  if (!blueprint) {
    throw new Error(`Blueprint not found: ${parsed.blueprint_id}`);
  }

  // Get hole
  const hole = db.getHole(parsed.hole_id);
  if (!hole) {
    throw new Error(`Hole not found: ${parsed.hole_id}`);
  }

  if (hole.blueprint_id !== blueprint.id) {
    throw new Error('Hole does not belong to this blueprint');
  }

  if (hole.status !== 'open') {
    throw new Error(`Hole is not open (status: ${hole.status})`);
  }

  // Apply the patch
  // For now, we append the patch to the content with a marker
  const patchMarker = `\n\n<!-- PATCH for ${hole.hole_type}: ${hole.description.substring(0, 50)}... -->\n`;
  const newContent = blueprint.current_content + patchMarker + parsed.patch;

  const tokensUsed = estimateTokens(parsed.patch);

  // Update blueprint content
  db.updateBlueprintContent(blueprint.id, newContent, tokensUsed);

  // Mark hole as patched
  db.updateHoleStatus(hole.id, 'patched');

  // Log the patch
  db.log(blueprint.id, 'PATCH_HOLE', {
    hole_id: hole.id,
    hole_type: hole.hole_type,
    patch_length: parsed.patch.length,
    tokens_used: tokensUsed
  });

  // Get preview
  const previewLength = 200;
  const newContentPreview = newContent.length > previewLength
    ? newContent.substring(newContent.length - previewLength) + '...'
    : newContent;

  return {
    hole_id: hole.id,
    blueprint_id: blueprint.id,
    status: 'patched' as HoleStatus,
    patch_applied: true,
    new_content_preview: newContentPreview,
    tokens_used: tokensUsed
  };
}

export const patchHoleTool = {
  name: 'patch_hole',
  description: 'Apply a fix to an identified hole in the blueprint.',
  inputSchema: {
    type: 'object',
    properties: {
      blueprint_id: {
        type: 'string',
        description: 'The UUID of the blueprint'
      },
      hole_id: {
        type: 'string',
        description: 'The UUID of the hole to patch'
      },
      patch: {
        type: 'string',
        description: 'The patch content to apply (additional instructions, fixes, or clarifications)'
      }
    },
    required: ['blueprint_id', 'hole_id', 'patch']
  }
};
