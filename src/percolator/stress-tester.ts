import { DatabaseManager, HoleSeverity } from '../database/schema';
import { HoleTypes, StressTestTypes } from '../types';

export interface StressTestRunResult {
  testId: string;
  passed: boolean;
  findings: string[];
  holesFound: number;
  durationMs: number;
}

interface HoleDetection {
  type: string;
  description: string;
  severity: HoleSeverity;
}

export class StressTester {
  private db: DatabaseManager;

  constructor(db: DatabaseManager) {
    this.db = db;
  }

  async runTest(
    blueprintId: string,
    testType: string,
    intensity: number
  ): Promise<StressTestRunResult> {
    const startTime = Date.now();

    const blueprint = this.db.getBlueprint(blueprintId);
    if (!blueprint) {
      throw new Error(`Blueprint not found: ${blueprintId}`);
    }

    // Run the appropriate test
    const result = this.executeTest(blueprint.current_content, testType, intensity);
    const durationMs = Date.now() - startTime;

    // Record the test
    const stressTest = this.db.createStressTest(
      blueprintId,
      testType,
      intensity,
      result.passed,
      JSON.stringify(result.findings),
      durationMs
    );

    // Create holes from findings
    let holesCreated = 0;
    for (const hole of result.holes) {
      this.db.createHole(
        blueprintId,
        hole.type,
        hole.description,
        hole.severity
      );
      holesCreated++;
    }

    return {
      testId: stressTest.id,
      passed: result.passed,
      findings: result.findings,
      holesFound: holesCreated,
      durationMs
    };
  }

  private executeTest(
    content: string,
    testType: string,
    intensity: number
  ): { passed: boolean; findings: string[]; holes: HoleDetection[] } {
    switch (testType) {
      case StressTestTypes.EDGE_CASE:
        return this.testEdgeCases(content, intensity);
      case StressTestTypes.ADVERSARIAL:
        return this.testAdversarial(content, intensity);
      case StressTestTypes.LOAD:
        return this.testLoad(content, intensity);
      case StressTestTypes.BOUNDARY:
        return this.testBoundary(content, intensity);
      case StressTestTypes.SECURITY:
        return this.testSecurity(content, intensity);
      case StressTestTypes.CONSISTENCY:
        return this.testConsistency(content, intensity);
      default:
        return { passed: true, findings: [], holes: [] };
    }
  }

  private testEdgeCases(content: string, intensity: number): { passed: boolean; findings: string[]; holes: HoleDetection[] } {
    const findings: string[] = [];
    const holes: HoleDetection[] = [];
    let issues = 0;

    // Check for null/empty handling
    if (!content.match(/null|empty|undefined|none|missing/i)) {
      findings.push('No handling for null/empty values detected');
      if (intensity >= 5) {
        holes.push({
          type: HoleTypes.EDGE_CASE_UNHANDLED,
          description: 'Blueprint does not handle null/empty input cases',
          severity: 'medium'
        });
        issues++;
      }
    }

    // Check for error handling
    if (!content.match(/error|exception|fail|catch|handle/i)) {
      findings.push('No error handling patterns detected');
      if (intensity >= 4) {
        holes.push({
          type: HoleTypes.EDGE_CASE_UNHANDLED,
          description: 'Blueprint lacks error handling',
          severity: 'high'
        });
        issues++;
      }
    }

    // Check for timeout handling
    if (content.match(/wait|async|fetch|request/i) && !content.match(/timeout/i)) {
      findings.push('Async operations without timeout handling');
      if (intensity >= 6) {
        holes.push({
          type: HoleTypes.EDGE_CASE_UNHANDLED,
          description: 'Async operations lack timeout handling',
          severity: 'medium'
        });
        issues++;
      }
    }

    return { passed: issues === 0, findings, holes };
  }

  private testAdversarial(content: string, intensity: number): { passed: boolean; findings: string[]; holes: HoleDetection[] } {
    const findings: string[] = [];
    const holes: HoleDetection[] = [];
    let issues = 0;

    // Check for injection vulnerabilities
    const injectionPatterns = /exec|eval|shell|command|sql|query/i;
    if (content.match(injectionPatterns)) {
      findings.push('Potential injection vulnerability patterns detected');
      if (!content.match(/sanitize|escape|parameterize|validate/i)) {
        holes.push({
          type: HoleTypes.SECURITY_RISK,
          description: 'Potential injection vulnerability without sanitization',
          severity: 'critical'
        });
        issues++;
      }
    }

    // Check for input validation
    if (!content.match(/validate|verify|check|schema|type/i)) {
      findings.push('No input validation detected');
      if (intensity >= 5) {
        holes.push({
          type: HoleTypes.INCOMPLETE_VALIDATION,
          description: 'Blueprint lacks input validation',
          severity: 'high'
        });
        issues++;
      }
    }

    // Check for authorization
    if (content.match(/user|access|permission|role/i) && !content.match(/authorize|auth|permission check/i)) {
      findings.push('User/access concepts without explicit authorization');
      if (intensity >= 7) {
        holes.push({
          type: HoleTypes.SECURITY_RISK,
          description: 'Missing authorization checks',
          severity: 'high'
        });
        issues++;
      }
    }

    return { passed: issues === 0, findings, holes };
  }

  private testLoad(content: string, intensity: number): { passed: boolean; findings: string[]; holes: HoleDetection[] } {
    const findings: string[] = [];
    const holes: HoleDetection[] = [];
    let issues = 0;

    // Check for batching
    if (!content.match(/batch|chunk|page|limit/i)) {
      findings.push('No batching or pagination strategy');
      if (intensity >= 6) {
        holes.push({
          type: HoleTypes.PERFORMANCE_ISSUE,
          description: 'Blueprint lacks batching for large datasets',
          severity: 'medium'
        });
        issues++;
      }
    }

    // Check for rate limiting
    if (content.match(/api|request|call/i) && !content.match(/rate|limit|throttle/i)) {
      findings.push('API calls without rate limiting');
      if (intensity >= 7) {
        holes.push({
          type: HoleTypes.PERFORMANCE_ISSUE,
          description: 'API interactions lack rate limiting',
          severity: 'medium'
        });
        issues++;
      }
    }

    // Check for caching
    if (content.match(/fetch|get|query|load/i) && !content.match(/cache|memo|store/i)) {
      findings.push('Data fetching without caching strategy');
      if (intensity >= 8) {
        holes.push({
          type: HoleTypes.PERFORMANCE_ISSUE,
          description: 'No caching strategy for data fetching',
          severity: 'low'
        });
        issues++;
      }
    }

    return { passed: issues === 0, findings, holes };
  }

  private testBoundary(content: string, intensity: number): { passed: boolean; findings: string[]; holes: HoleDetection[] } {
    const findings: string[] = [];
    const holes: HoleDetection[] = [];
    let issues = 0;

    // Check for min/max constraints
    if (!content.match(/min|max|limit|bound|range/i)) {
      findings.push('No boundary constraints defined');
      if (intensity >= 5) {
        holes.push({
          type: HoleTypes.INCOMPLETE_VALIDATION,
          description: 'Blueprint lacks boundary definitions',
          severity: 'medium'
        });
        issues++;
      }
    }

    // Check for size limits
    if (content.match(/file|upload|input|data/i) && !content.match(/size|length|limit/i)) {
      findings.push('Data handling without size limits');
      if (intensity >= 6) {
        holes.push({
          type: HoleTypes.INCOMPLETE_VALIDATION,
          description: 'No size limits for data handling',
          severity: 'medium'
        });
        issues++;
      }
    }

    return { passed: issues === 0, findings, holes };
  }

  private testSecurity(content: string, intensity: number): { passed: boolean; findings: string[]; holes: HoleDetection[] } {
    const findings: string[] = [];
    const holes: HoleDetection[] = [];
    let issues = 0;

    // Check for sensitive data handling
    const sensitivePatterns = ['password', 'secret', 'token', 'key', 'credential', 'api_key'];
    for (const pattern of sensitivePatterns) {
      if (content.toLowerCase().includes(pattern)) {
        findings.push(`Sensitive data type detected: ${pattern}`);
        if (!content.match(/encrypt|hash|secure|protect|mask/i)) {
          holes.push({
            type: HoleTypes.SECURITY_RISK,
            description: `Sensitive data (${pattern}) without security measures`,
            severity: 'critical'
          });
          issues++;
        }
      }
    }

    // Check for logging sensitive data
    if (content.match(/log|print|debug|trace/i) && content.match(/password|secret|token/i)) {
      findings.push('Potential sensitive data in logs');
      holes.push({
        type: HoleTypes.SECURITY_RISK,
        description: 'Sensitive data may be logged',
        severity: 'high'
      });
      issues++;
    }

    return { passed: issues === 0, findings, holes };
  }

  private testConsistency(content: string, intensity: number): { passed: boolean; findings: string[]; holes: HoleDetection[] } {
    const findings: string[] = [];
    const holes: HoleDetection[] = [];
    let issues = 0;

    // Check for numbered steps
    const steps = content.split(/\n/).filter(line => line.match(/^\s*\d+[\.\)]/));
    if (steps.length > 1) {
      // Verify sequential numbering
      const numbers = steps.map(s => parseInt(s.match(/\d+/)![0], 10));
      for (let i = 1; i < numbers.length; i++) {
        if (numbers[i] !== numbers[i - 1] + 1) {
          findings.push(`Step numbering inconsistency: ${numbers[i - 1]} → ${numbers[i]}`);
          if (intensity >= 4) {
            holes.push({
              type: HoleTypes.INCONSISTENCY,
              description: 'Step numbering is inconsistent',
              severity: 'low'
            });
            issues++;
          }
          break;
        }
      }
    }

    // Check for contradicting terms
    const contradictions = [
      ['always', 'never'],
      ['required', 'optional'],
      ['must', 'should not']
    ];

    for (const [term1, term2] of contradictions) {
      if (content.toLowerCase().includes(term1) && content.toLowerCase().includes(term2)) {
        findings.push(`Potentially contradicting terms: "${term1}" and "${term2}"`);
        if (intensity >= 6) {
          holes.push({
            type: HoleTypes.AMBIGUOUS_INSTRUCTION,
            description: `Contradicting language: "${term1}" vs "${term2}"`,
            severity: 'medium'
          });
          issues++;
        }
      }
    }

    return { passed: issues === 0, findings, holes };
  }
}

export default StressTester;
