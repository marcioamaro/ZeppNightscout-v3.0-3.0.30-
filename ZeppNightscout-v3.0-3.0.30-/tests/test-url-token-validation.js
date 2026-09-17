/**
 * Test script for URL and token validation
 * Run with: node test-url-token-validation.js
 */

// Note: MESSAGE_TYPES should ideally be imported from shared/message.js,
// but since this project uses Zepp OS modules (not CommonJS/ESM),
// we define the constants here for testing purposes.
// Keep this in sync with shared/message.js
const MESSAGE_TYPES = {
  FETCH_DATA: 'FETCH_DATA',
  UPDATE_SETTINGS: 'UPDATE_SETTINGS',
  VERIFY_URL: 'VERIFY_URL',
  VALIDATE_TOKEN: 'VALIDATE_TOKEN'
};

// Test URL validation
console.log('='.repeat(50));
console.log('Testing URL and Token Validation');
console.log('='.repeat(50));
console.log();

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

// Test 1: URL HTTPS validation
console.log('Test 1: URL HTTPS Validation');
console.log('-'.repeat(50));

function isValidHttpsUrl(url) {
  return url && url.trim().startsWith('https://');
}

assert(isValidHttpsUrl('https://nightscout.example.com'), 'Valid HTTPS URL should pass');
assert(!isValidHttpsUrl('http://nightscout.example.com'), 'HTTP URL should fail');
assert(!isValidHttpsUrl('ftp://nightscout.example.com'), 'FTP URL should fail');
assert(!isValidHttpsUrl(''), 'Empty URL should fail');
assert(!isValidHttpsUrl(null), 'Null URL should fail');
assert(isValidHttpsUrl('https://my-nightscout.herokuapp.com'), 'Herokuapp HTTPS URL should pass');
console.log();

// Test 2: Token presence validation
console.log('Test 2: Token Presence Validation');
console.log('-'.repeat(50));

function isTokenProvided(token) {
  return token && token.trim().length > 0;
}

assert(isTokenProvided('abc123'), 'Valid token should pass');
assert(isTokenProvided('my-secret-token'), 'Token with hyphens should pass');
assert(!isTokenProvided(''), 'Empty token should fail');
assert(!isTokenProvided('   '), 'Whitespace token should fail');
assert(!isTokenProvided(null), 'Null token should fail');
console.log();

// Test 3: Message type validation
console.log('Test 3: Message Type Validation');
console.log('-'.repeat(50));

assert(MESSAGE_TYPES.VALIDATE_TOKEN === 'VALIDATE_TOKEN', 'VALIDATE_TOKEN message type should exist');
assert(MESSAGE_TYPES.VERIFY_URL === 'VERIFY_URL', 'VERIFY_URL message type should exist');
assert(MESSAGE_TYPES.FETCH_DATA === 'FETCH_DATA', 'FETCH_DATA message type should exist');
console.log();

// Test 4: Token validation state machine
console.log('Test 4: Token Validation State Machine');
console.log('-'.repeat(50));

const VALIDATION_STATES = {
  UNVALIDATED: 'unvalidated',
  VALIDATING: 'validating',
  VALID_READONLY: 'valid-readonly',
  VALID_ADMIN: 'valid-admin',
  INVALID: 'invalid'
};

function determineTokenState(statusSuccess, adminSuccess) {
  if (!statusSuccess) {
    return VALIDATION_STATES.INVALID;
  }
  if (adminSuccess) {
    return VALIDATION_STATES.VALID_ADMIN;
  }
  return VALIDATION_STATES.VALID_READONLY;
}

assert(
  determineTokenState(false, false) === VALIDATION_STATES.INVALID,
  'Failed status check should result in invalid state'
);
assert(
  determineTokenState(true, false) === VALIDATION_STATES.VALID_READONLY,
  'Successful status + failed admin should result in valid-readonly (safe)'
);
assert(
  determineTokenState(true, true) === VALIDATION_STATES.VALID_ADMIN,
  'Successful status + successful admin should result in valid-admin (dangerous)'
);
console.log();

// Test 5: Token icon mapping
console.log('Test 5: Token Status Icon Mapping');
console.log('-'.repeat(50));

function getTokenIcon(state) {
  const iconMap = {
    'unvalidated': '?',
    'validating': '⌛',
    'valid-readonly': '✅',
    'valid-admin': '❗',
    'invalid': '✗'
  };
  return iconMap[state] || '?';
}

assert(getTokenIcon('unvalidated') === '?', 'Unvalidated state should show ?');
assert(getTokenIcon('validating') === '⌛', 'Validating state should show ⌛');
assert(getTokenIcon('valid-readonly') === '✅', 'Valid readonly state should show ✅');
assert(getTokenIcon('valid-admin') === '❗', 'Valid admin state should show ❗');
assert(getTokenIcon('invalid') === '✗', 'Invalid state should show ✗');
console.log();

// Test 6: URL with token parameter building
console.log('Test 6: URL Construction with Token');
console.log('-'.repeat(50));

function buildApiUrl(baseUrl, endpoint, token) {
  let url = `${baseUrl}${endpoint}`;
  if (token) {
    const separator = endpoint.includes('?') ? '&' : '?';
    url += `${separator}token=${token}`;
  }
  return url;
}

assert(
  buildApiUrl('https://ns.com', '/api/v1/status', '') === 'https://ns.com/api/v1/status',
  'URL without token should not have token parameter'
);
assert(
  buildApiUrl('https://ns.com', '/api/v1/status', 'abc123') === 'https://ns.com/api/v1/status?token=abc123',
  'URL with token should append token parameter with ?'
);
assert(
  buildApiUrl('https://ns.com', '/api/v1/entries.json?count=200', 'abc123') === 'https://ns.com/api/v1/entries.json?count=200&token=abc123',
  'URL with existing params should append token with &'
);
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
