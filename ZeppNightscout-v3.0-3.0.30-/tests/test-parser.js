/**
 * Test script for Nightscout data parser
 * Run with: node test-parser.js
 */

// Mock API response data
const mockApiResponse = [
  {
    sgv: 120,
    direction: 'Flat',
    dateString: new Date().toISOString(),
    date: Date.now()
  },
  {
    sgv: 118,
    direction: 'Flat',
    dateString: new Date(Date.now() - 300000).toISOString(),
    date: Date.now() - 300000
  },
  {
    sgv: 115,
    direction: 'FortyFiveDown',
    dateString: new Date(Date.now() - 600000).toISOString(),
    date: Date.now() - 600000
  }
];

// Test data parsing logic
// Note: This is a duplicate of the function in app-side/index.js for testing purposes.
// If you modify the production function, update this test copy as well.
function parseNightscoutData(entries) {
  if (!entries || entries.length === 0) {
    return null;
  }

  const latest = entries[0];
  const previous = entries[1];

  let delta = 0;
  let deltaDisplay = '--';
  if (previous && latest.sgv && previous.sgv) {
    delta = latest.sgv - previous.sgv;
    deltaDisplay = (delta >= 0 ? '+' : '') + delta;
  }

  const trendMap = {
    'DoubleUp': '⇈',
    'SingleUp': '↑',
    'FortyFiveUp': '↗',
    'Flat': '→',
    'FortyFiveDown': '↘',
    'SingleDown': '↓',
    'DoubleDown': '⇊',
    'NOT COMPUTABLE': '-',
    'RATE OUT OF RANGE': '⇕'
  };
  const trend = trendMap[latest.direction] || '?';

  const dataPoints = entries.map(entry => entry.sgv || 0);

  return {
    currentBG: latest.sgv ? latest.sgv.toString() : '--',
    trend: trend,
    delta: deltaDisplay,
    dataPoints: dataPoints.slice().reverse(), // Reverse to show oldest to newest (use slice to avoid mutation)
    rawData: latest
  };
}

function formatTimeSince(timestamp) {
  try {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now - date;
    const diffMin = Math.floor(diffMs / 60000);

    if (diffMin < 1) return 'Just now';
    if (diffMin === 1) return '1 min ago';
    if (diffMin < 60) return `${diffMin} min ago`;
    
    const diffHour = Math.floor(diffMin / 60);
    if (diffHour === 1) return '1 hour ago';
    return `${diffHour} hours ago`;
  } catch (error) {
    console.error('Error formatting time:', error);
    return 'Unknown';
  }
}

// Run tests
console.log('='.repeat(50));
console.log('Testing Nightscout Data Parser');
console.log('='.repeat(50));
console.log();

console.log('Test 1: Parse valid data');
console.log('-'.repeat(50));
const result = parseNightscoutData(mockApiResponse);
console.log('Result:', JSON.stringify(result, null, 2));
console.log();

// Verify results
console.log('Test 2: Assertions');
console.log('-'.repeat(50));

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    console.log('✓', message);
    passed++;
  } else {
    console.log('✗', message);
    failed++;
  }
}

assert(result !== null, 'Result should not be null');
assert(result.currentBG === '120', 'Current BG should be 120');
assert(result.trend === '→', 'Trend should be Flat arrow (→)');
assert(result.delta === '+2', 'Delta should be +2');
assert(Array.isArray(result.dataPoints), 'Data points should be an array');
assert(result.dataPoints.length === 3, 'Data points should have 3 entries');
assert(result.dataPoints[0] === 115, 'First data point should be 115 (oldest)');
assert(result.dataPoints[2] === 120, 'Last data point should be 120 (newest)');
console.log();

// Test edge cases
console.log('Test 3: Edge cases');
console.log('-'.repeat(50));

// Empty data
const emptyResult = parseNightscoutData([]);
assert(emptyResult === null, 'Empty array should return null');

// Single entry
const singleEntryResult = parseNightscoutData([mockApiResponse[0]]);
assert(singleEntryResult !== null, 'Single entry should return result');
assert(singleEntryResult.delta === '--', 'Single entry delta should be --');

// Negative delta
const negativeData = [
  { sgv: 100, direction: 'SingleDown' },
  { sgv: 115, direction: 'Flat' }
];
const negativeResult = parseNightscoutData(negativeData);
assert(negativeResult.delta === '-15', 'Negative delta should be -15');
console.log();

// Test time formatting
console.log('Test 4: Time formatting');
console.log('-'.repeat(50));

const now = Date.now();
const oneMinAgo = now - 60000;
const fiveMinAgo = now - 300000;
const oneHourAgo = now - 3600000;
const twoHoursAgo = now - 7200000;

assert(formatTimeSince(now) === 'Just now', 'Current time should be "Just now"');
assert(formatTimeSince(oneMinAgo) === '1 min ago', 'One minute ago should be "1 min ago"');
assert(formatTimeSince(fiveMinAgo) === '5 min ago', 'Five minutes ago should be "5 min ago"');
assert(formatTimeSince(oneHourAgo) === '1 hour ago', 'One hour ago should be "1 hour ago"');
assert(formatTimeSince(twoHoursAgo) === '2 hours ago', 'Two hours ago should be "2 hours ago"');
console.log();

// Test all trend arrows
console.log('Test 5: Trend arrows');
console.log('-'.repeat(50));

const trendTests = [
  { direction: 'DoubleUp', expected: '⇈' },
  { direction: 'SingleUp', expected: '↑' },
  { direction: 'FortyFiveUp', expected: '↗' },
  { direction: 'Flat', expected: '→' },
  { direction: 'FortyFiveDown', expected: '↘' },
  { direction: 'SingleDown', expected: '↓' },
  { direction: 'DoubleDown', expected: '⇊' },
  { direction: 'NOT COMPUTABLE', expected: '-' },
  { direction: 'RATE OUT OF RANGE', expected: '⇕' },
];

trendTests.forEach(test => {
  const data = [{ sgv: 100, direction: test.direction }];
  const trendResult = parseNightscoutData(data);
  assert(
    trendResult.trend === test.expected,
    `${test.direction} should map to ${test.expected}`
  );
});
console.log();

// Summary
console.log('='.repeat(50));
console.log('Test Summary');
console.log('='.repeat(50));
console.log(`Passed: ${passed}`);
console.log(`Failed: ${failed}`);
console.log();

if (failed === 0) {
  console.log('✓ All tests passed!');
  process.exit(0);
} else {
  console.log('✗ Some tests failed!');
  process.exit(1);
}
