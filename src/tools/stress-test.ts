import { DatabaseManager, HoleSeverity } from '../database/schema';
import { StressTestSchema, StressTestResult, HoleTypes } from '../types';
import { z } from 'zod';

export type StressTestInput = z.infer<typeof StressTestSchema>;

// Stress test scenarios for each test type
const testScenarios: Record<string, (content: string, intensity: number) => { passed: boolean; findings: string[]; holes: Array<{ type: string; description: string; severity: HoleSeverity }> }> = {
  edge_case: (content, intensity) => {
    const findings: string[] = [];
    const holes: Array<{ type: string; description: string; severity: HoleSeverity }> = [];
    let passed = true;

    // Check for edge case handling
    if (!content.includes('error') && !content.includes('exception') && !content.includes('handle')) {
      findings.push('No explicit error handling detected');
      if (intensity >= 5) {
        holes.push({
          type: HoleTypes.EDGE_CASE_UNHANDLED,
          description: 'Blueprint lacks explicit error handling for edge cases',
          severity: 'medium'
        });
        passed = false;
      }
    }

    if (!content.includes('empty') && !content.includes('null') && !content.includes('undefined')) {
      findings.push('No handling for empty/null inputs detected');
      if (intensity >= 7) {
        holes.push({
          type: HoleTypes.EDGE_CASE_UNHANDLED,
          description: 'Blueprint does not address empty or null input scenarios',
          severity: 'high'
        });
        passed = false;
      }
    }

    return { passed, findings, holes };
  },

  adversarial: (content, intensity) => {
    const findings: string[] = [];
    const holes: Array<{ type: string; description: string; severity: HoleSeverity }> = [];
    let passed = true;

    // Check for security considerations
    if (!content.includes('validat') && !content.includes('sanitiz') && !content.includes('verify')) {
      findings.push('No input validation mentioned');
      if (intensity >= 5) {
        holes.push({
          type: HoleTypes.SECURITY_RISK,
          description: 'Blueprint lacks input validation steps',
          severity: 'high'
        });
        passed = false;
      }
    }

    if (content.includes('exec') || content.includes('eval') || content.includes('shell')) {
      findings.push('Potential code execution detected');
      holes.push({
        type: HoleTypes.SECURITY_RISK,
        description: 'Blueprint contains potentially dangerous execution patterns',
        severity: 'critical'
      });
      passed = false;
    }

    return { passed, findings, holes };
  },

  load: (content, intensity) => {
    const findings: string[] = [];
    const holes: Array<{ type: string; description: string; severity: HoleSeverity }> = [];
    let passed = true;

    // Check for performance considerations
    if (!content.includes('batch') && !content.includes('chunk') && !content.includes('pagina')) {
      findings.push('No batching or pagination strategy');
      if (intensity >= 6) {
        holes.push({
          type: HoleTypes.PERFORMANCE_ISSUE,
          description: 'Blueprint lacks batching strategy for large datasets',
          severity: 'medium'
        });
        passed = false;
      }
    }

    if (!content.includes('timeout') && !content.includes('limit')) {
      findings.push('No timeout or rate limiting mentioned');
      if (intensity >= 7) {
        holes.push({
          type: HoleTypes.PERFORMANCE_ISSUE,
          description: 'Blueprint lacks timeout and rate limiting considerations',
          severity: 'medium'
        });
        passed = false;
      }
    }

    return { passed, findings, holes };
  },

  boundary: (content, intensity) => {
    const findings: string[] = [];
    const holes: Array<{ type: string; description: string; severity: HoleSeverity }> = [];
    let passed = true;

    // Check for boundary handling
    if (!content.includes('max') && !content.includes('min') && !content.includes('limit')) {
      findings.push('No boundary conditions specified');
      if (intensity >= 5) {
        holes.push({
          type: HoleTypes.INCOMPLETE_VALIDATION,
          description: 'Blueprint does not define boundary conditions',
          severity: 'medium'
        });
        passed = false;
      }
    }

    return { passed, findings, holes };
  },

  security: (content, intensity) => {
    const findings: string[] = [];
    const holes: Array<{ type: string; description: string; severity: HoleSeverity }> = [];
    let passed = true;

    // Security checks
    const sensitivePatterns = ['password', 'secret', 'token', 'key', 'credential'];
    for (const pattern of sensitivePatterns) {
      if (content.toLowerCase().includes(pattern)) {
        findings.push(`Sensitive data pattern found: ${pattern}`);
        if (!content.includes('encrypt') && !content.includes('hash') && !content.includes('secure')) {
          holes.push({
            type: HoleTypes.SECURITY_RISK,
            description: `Blueprint handles ${pattern} without apparent security measures`,
            severity: 'critical'
          });
          passed = false;
        }
      }
    }

    return { passed, findings, holes };
  },

  consistency: (content, intensity) => {
    const findings: string[] = [];
    const holes: Array<{ type: string; description: string; severity: HoleSeverity }> = [];
    let passed = true;

    // Check for consistency
    const steps = content.split(/\d+\.\s+/).filter(s => s.trim());
    if (steps.length > 1) {
      // Check if steps reference each other properly
      const hasReferences = steps.some(s => s.includes('previous') || s.includes('above') || s.includes('step'));
      if (!hasReferences && steps.length > 3) {
        findings.push('Steps may lack proper sequencing references');
        if (intensity >= 6) {
          holes.push({
            type: HoleTypes.INCONSISTENCY,
            description: 'Blueprint steps lack clear sequencing and references',
            severity: 'low'
          });
          passed = false;
        }
      }
    }

    return { passed, findings, holes };
  }
};

export async function stressTest(
  input: unknown,
  db: DatabaseManager
): Promise<StressTestResult> {
  const startTime = Date.now();

  // Validate input
  const parsed = StressTestSchema.parse(input);

  // Get blueprint
  const blueprint = db.getBlueprint(parsed.blueprint_id);
  if (!blueprint) {
    throw new Error(`Blueprint not found: ${parsed.blueprint_id}`);
  }

  // Run the stress test
  const testFn = testScenarios[parsed.test_type];
  if (!testFn) {
    throw new Error(`Unknown test type: ${parsed.test_type}`);
  }

  const result = testFn(blueprint.current_content, parsed.intensity);
  const durationMs = Date.now() - startTime;

  // Record the stress test
  const stressTest = db.createStressTest(
    blueprint.id,
    parsed.test_type,
    parsed.intensity,
    result.passed,
    JSON.stringify(result.findings),
    durationMs
  );

  // Create holes if found
  let holesCreated = 0;
  for (const hole of result.holes) {
    db.createHole(
      blueprint.id,
      hole.type,
      hole.description,
      hole.severity
    );
    holesCreated++;
  }

  // Log the test
  db.log(blueprint.id, 'STRESS_TEST', {
    test_type: parsed.test_type,
    intensity: parsed.intensity,
    passed: result.passed,
    findings_count: result.findings.length,
    holes_found: holesCreated,
    duration_ms: durationMs
  });

  return {
    test_id: stressTest.id,
    blueprint_id: blueprint.id,
    test_type: parsed.test_type,
    intensity: parsed.intensity,
    passed: result.passed,
    findings: result.findings,
    holes_found: holesCreated,
    duration_ms: durationMs
  };
}

export const stressTestTool = {
  name: 'stress_test',
  description: 'Run adversarial stress tests against a blueprint to identify weaknesses and potential failure modes.',
  inputSchema: {
    type: 'object',
    properties: {
      blueprint_id: {
        type: 'string',
        description: 'The UUID of the blueprint to test'
      },
      test_type: {
        type: 'string',
        enum: ['edge_case', 'adversarial', 'load', 'boundary', 'security', 'consistency'],
        description: 'Type of stress test to run'
      },
      intensity: {
        type: 'number',
        minimum: 1,
        maximum: 10,
        description: 'Test intensity from 1 (gentle) to 10 (aggressive). Default: 5'
      }
    },
    required: ['blueprint_id', 'test_type']
  }
};
