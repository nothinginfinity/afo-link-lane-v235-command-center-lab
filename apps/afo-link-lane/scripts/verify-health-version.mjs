import fs from 'node:fs';

const healthPath = process.argv[2];
const expectedVersion = process.argv[3];

if (!healthPath) {
  throw new Error('Usage: node scripts/verify-health-version.mjs <health-json-path> <expected-version>');
}

if (!expectedVersion) {
  throw new Error('Expected version argument is required');
}

const raw = fs.readFileSync(healthPath, 'utf8');
let data;

try {
  data = JSON.parse(raw);
} catch (error) {
  throw new Error(`Health response is not valid JSON: ${error.message}`);
}

if (!data || typeof data !== 'object') {
  throw new Error('Health response must be a JSON object');
}

if (typeof data.version !== 'string' || data.version.length === 0) {
  throw new Error('Health response is missing a non-empty version string');
}

if (data.version !== expectedVersion) {
  throw new Error(`Expected ${expectedVersion} but found ${data.version}`);
}

console.log(`Live Worker version verified: ${data.version}`);
