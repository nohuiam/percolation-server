import { DatabaseManager, Hole } from '../database/schema';
import { HoleTypes } from '../types';

interface ResearchResult {
  source: string;
  description: string;
  patch: string;
  improvement_score: number;
  tokens_cost: number;
}

export class Optimizer {
  private db: DatabaseManager;

  constructor(db: DatabaseManager) {
    this.db = db;
  }

  async researchForHole(blueprintId: string, hole: Hole): Promise<ResearchResult | null> {
    // In production, this would call research-bus HTTP API
    // For now, generate appropriate patches based on hole type

    const patches = this.getPatchesForHoleType(hole.hole_type);
    if (patches.length === 0) return null;

    const selectedPatch = patches[0];

    return {
      source: `${hole.hole_type}_research`,
      description: `Fix for ${hole.hole_type}: ${hole.description.substring(0, 50)}`,
      patch: selectedPatch.content,
      improvement_score: selectedPatch.score,
      tokens_cost: this.estimateTokens(selectedPatch.content)
    };
  }

  async applyPatch(blueprintId: string, holeId: string, patch: string): Promise<boolean> {
    const blueprint = this.db.getBlueprint(blueprintId);
    if (!blueprint) {
      throw new Error(`Blueprint not found: ${blueprintId}`);
    }

    const hole = this.db.getHole(holeId);
    if (!hole) {
      throw new Error(`Hole not found: ${holeId}`);
    }

    if (hole.blueprint_id !== blueprintId) {
      throw new Error('Hole does not belong to this blueprint');
    }

    // Apply the patch
    const patchMarker = `\n\n<!-- FIX: ${hole.hole_type} -->\n`;
    const newContent = blueprint.current_content + patchMarker + patch;
    const tokensUsed = this.estimateTokens(patch);

    // Update blueprint
    this.db.updateBlueprintContent(blueprintId, newContent, tokensUsed);

    // Mark hole as patched
    this.db.updateHoleStatus(holeId, 'patched');

    // Log the patch
    this.db.log(blueprintId, 'OPTIMIZER_PATCH', {
      hole_id: holeId,
      hole_type: hole.hole_type,
      patch_length: patch.length,
      tokens_used: tokensUsed
    });

    return true;
  }

  async applyOptimization(
    blueprintId: string,
    source: string,
    description: string,
    content: string
  ): Promise<string> {
    const blueprint = this.db.getBlueprint(blueprintId);
    if (!blueprint) {
      throw new Error(`Blueprint not found: ${blueprintId}`);
    }

    const tokensUsed = this.estimateTokens(content);
    const remainingBudget = blueprint.budget_tokens - blueprint.tokens_used;

    if (tokensUsed > remainingBudget) {
      throw new Error(`Insufficient budget: need ${tokensUsed}, have ${remainingBudget}`);
    }

    // Apply optimization
    const optMarker = `\n\n<!-- OPTIMIZATION: ${source} -->\n`;
    const newContent = blueprint.current_content + optMarker + content;

    // Update blueprint
    this.db.updateBlueprintContent(blueprintId, newContent, tokensUsed);

    // Record optimization
    const optimization = this.db.createOptimization(
      blueprintId,
      source,
      description,
      0.1, // Default improvement score
      tokensUsed
    );

    // Log
    this.db.log(blueprintId, 'OPTIMIZATION_APPLIED', {
      optimization_id: optimization.id,
      source,
      tokens_used: tokensUsed
    });

    return optimization.id;
  }

  private getPatchesForHoleType(holeType: string): Array<{ content: string; score: number }> {
    const patches: Record<string, Array<{ content: string; score: number }>> = {
      [HoleTypes.MISSING_STEP]: [
        {
          content: `
## Verification Step

After completing the main operation:
1. Verify the expected outcome was achieved
2. Check all postconditions
3. Log the result for audit trail
4. If verification fails, trigger error handling
`,
          score: 0.15
        }
      ],

      [HoleTypes.AMBIGUOUS_INSTRUCTION]: [
        {
          content: `
## Clarification

To avoid ambiguity:
- Use specific, measurable criteria
- Define exact thresholds and limits
- Provide concrete examples
- Eliminate vague qualifiers
`,
          score: 0.10
        }
      ],

      [HoleTypes.EDGE_CASE_UNHANDLED]: [
        {
          content: `
## Edge Case Handling

Handle the following edge cases:
1. **Empty input**: Return early with appropriate message
2. **Null values**: Check for null before processing
3. **Timeout**: Set maximum wait time and handle expiry
4. **Network failure**: Implement retry with backoff
`,
          score: 0.18
        }
      ],

      [HoleTypes.SECURITY_RISK]: [
        {
          content: `
## Security Hardening

Apply these security measures:
1. **Input validation**: Validate all inputs against schema
2. **Sanitization**: Escape special characters
3. **Authentication**: Verify identity before action
4. **Authorization**: Check permissions
5. **Audit logging**: Log security-relevant events
`,
          score: 0.25
        }
      ],

      [HoleTypes.PERFORMANCE_ISSUE]: [
        {
          content: `
## Performance Optimization

Improve performance with:
1. **Batching**: Process items in batches of 100
2. **Caching**: Cache repeated lookups for 5 minutes
3. **Pagination**: Limit results to 50 per page
4. **Rate limiting**: Max 100 requests per minute
`,
          score: 0.15
        }
      ],

      [HoleTypes.DEPENDENCY_MISSING]: [
        {
          content: `
## Prerequisites

Before starting, ensure:
1. All dependencies are installed
2. Configuration files are in place
3. Required permissions are granted
4. Environment variables are set

Installation:
\`\`\`
npm install required-package
\`\`\`
`,
          score: 0.12
        }
      ],

      [HoleTypes.INCONSISTENCY]: [
        {
          content: `
## Consistency Rules

Maintain consistency by:
1. Using consistent naming conventions
2. Following established patterns
3. Keeping terminology uniform
4. Aligning with existing structure
`,
          score: 0.08
        }
      ],

      [HoleTypes.INCOMPLETE_VALIDATION]: [
        {
          content: `
## Validation Checklist

Before proceeding, validate:
1. [ ] Input format is correct
2. [ ] Required fields are present
3. [ ] Values are within bounds
4. [ ] Dependencies are available
5. [ ] Permissions are sufficient
`,
          score: 0.14
        }
      ]
    };

    return patches[holeType] || [];
  }

  private estimateTokens(text: string): number {
    return Math.ceil(text.length / 4);
  }
}

export default Optimizer;
