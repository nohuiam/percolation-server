import path from 'path';
import fs from 'fs';
import { DatabaseManager } from '../src/database/schema';

// Test data directory
export const TEST_DATA_DIR = path.join(__dirname, '../test-data');

// Setup test environment
export function setupTestEnvironment() {
  // Ensure test data directory exists
  if (!fs.existsSync(TEST_DATA_DIR)) {
    fs.mkdirSync(TEST_DATA_DIR, { recursive: true });
  }
}

// Cleanup test environment
export function cleanupTestEnvironment() {
  // Reset singletons first
  DatabaseManager.resetInstance();

  // Remove test data directory with retry
  try {
    if (fs.existsSync(TEST_DATA_DIR)) {
      fs.rmSync(TEST_DATA_DIR, { recursive: true, force: true });
    }
  } catch (e) {
    // Ignore cleanup errors in tests
  }
}

// Get a fresh database for testing
export function getTestDatabase(): DatabaseManager {
  const dbDir = path.join(TEST_DATA_DIR, `db-${Date.now()}`);
  return new DatabaseManager(dbDir);
}

// Sample blueprints for testing
export const SAMPLE_BLUEPRINTS = {
  simple: `# Simple Blueprint

## Steps
1. Start the process
2. Execute the main logic
3. Finish
`,

  withErrors: `# Blueprint with Issues

TODO: Add validation here

1. Get input somehow
2. Maybe process it
3. etc.
`,

  withSecurity: `# Secure Blueprint

1. Validate input using schema
2. Check user password for authentication
3. Handle errors properly
4. Log all actions for audit
`,

  complex: `# Complex Blueprint

## Prerequisites
Requires Node.js 18+

## Steps
1. Connect to the API endpoint
2. Fetch data with retry logic
3. Validate response against schema
4. Process in batches of 100
5. Log progress and errors
6. Handle timeout gracefully
7. Rollback on failure
8. Verify final state
`
};
