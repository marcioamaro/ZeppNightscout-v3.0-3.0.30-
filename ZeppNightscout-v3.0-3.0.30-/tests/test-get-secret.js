/**
 * Test for GET_SECRET message type and functionality
 */

// Import MESSAGE_TYPES from shared/message.js
const path = require('path');
const fs = require('fs');

// Read and evaluate the module content
const messagePath = path.join(__dirname, '../shared/message.js');
const messageContent = fs.readFileSync(messagePath, 'utf8');

// Parse MESSAGE_TYPES from the actual file content
const messageTypesMatch = messageContent.match(/export const MESSAGE_TYPES = \{([^}]+)\}/s);
let MESSAGE_TYPES = {};
if (messageTypesMatch) {
  const typesContent = messageTypesMatch[1];
  const typeMatches = typesContent.matchAll(/(\w+):\s*['"](\w+)['"]/g);
  for (const match of typeMatches) {
    MESSAGE_TYPES[match[1]] = match[2];
  }
}

console.log('==================================================');
console.log('Testing GET_SECRET Message Type');
console.log('==================================================\n');

let passed = 0;
let failed = 0;

function test(description, condition) {
  if (condition) {
    console.log(`✓ ${description}`);
    passed++;
  } else {
    console.error(`✗ ${description}`);
    failed++;
  }
}

// Test 1: GET_SECRET message type exists
console.log('Test 1: Message Type Validation');
console.log('--------------------------------------------------');
test('GET_SECRET message type should exist', MESSAGE_TYPES.GET_SECRET !== undefined);
test('GET_SECRET should equal "GET_SECRET"', MESSAGE_TYPES.GET_SECRET === 'GET_SECRET');

// Test 2: All expected message types exist
console.log('\nTest 2: All Message Types Present');
console.log('--------------------------------------------------');
test('FETCH_DATA should exist', MESSAGE_TYPES.FETCH_DATA === 'FETCH_DATA');
test('UPDATE_SETTINGS should exist', MESSAGE_TYPES.UPDATE_SETTINGS === 'UPDATE_SETTINGS');
test('VERIFY_URL should exist', MESSAGE_TYPES.VERIFY_URL === 'VERIFY_URL');
test('VALIDATE_TOKEN should exist', MESSAGE_TYPES.VALIDATE_TOKEN === 'VALIDATE_TOKEN');
test('GET_SECRET should exist', MESSAGE_TYPES.GET_SECRET === 'GET_SECRET');

// Test 3: Message file contains GET_SECRET
console.log('\nTest 3: Source File Validation');
console.log('--------------------------------------------------');
test('shared/message.js should contain GET_SECRET', messageContent.includes('GET_SECRET'));
test('shared/message.js should export GET_SECRET in MESSAGE_TYPES', 
     MESSAGE_TYPES.GET_SECRET === 'GET_SECRET');

// Test 4: App-side index.js contains getSecret handler
console.log('\nTest 4: App-Side Handler Validation');
console.log('--------------------------------------------------');
const appSidePath = path.join(__dirname, '../app-side/index.js');
const appSideContent = fs.readFileSync(appSidePath, 'utf8');
test('app-side/index.js should check for GET_SECRET message', 
     appSideContent.includes('MESSAGE_TYPES.GET_SECRET'));
test('app-side/index.js should have getSecret method', 
     appSideContent.includes('getSecret()'));
test('app-side/index.js should call sendSecretToDevice', 
     appSideContent.includes('sendSecretToDevice'));

// Test 5: Page2.js contains button and messaging
console.log('\nTest 5: Page2 Implementation Validation');
console.log('--------------------------------------------------');
const page2Path = path.join(__dirname, '../page/page2.js');
const page2Content = fs.readFileSync(page2Path, 'utf8');
test('page2.js should NOT import @zos/ble (uses global hmBle instead)', 
     !page2Content.includes('@zos/ble'));
test('page2.js should access MESSAGE_TYPES from globalData', 
     page2Content.includes('getApp().globalData'));
test('page2.js should have "get secret" button', 
     page2Content.includes('get secret'));
test('page2.js should send GET_SECRET message', 
     page2Content.includes('MESSAGE_TYPES.GET_SECRET'));
test('page2.js should use hmBle.createConnect for receiving messages', 
     page2Content.includes('hmBle.createConnect'));
test('page2.js should use hmBle.send for sending messages', 
     page2Content.includes('hmBle.send'));
test('page2.js should use hmBle.buf2str for parsing messages', 
     page2Content.includes('hmBle.buf2str'));
test('page2.js should use hmBle.str2buf for encoding messages', 
     page2Content.includes('hmBle.str2buf'));
test('page2.js should handle secret response', 
     page2Content.includes('data.secret'));
test('page2.js should display token', 
     page2Content.includes('Token:'));
test('page2.js should display error', 
     page2Content.includes('Error:'));
test('page2.js should have "Swipe right..." text', 
     page2Content.includes('Swipe right...'));

console.log('\n==================================================');
console.log('Test Summary');
console.log('==================================================');
console.log(`Passed: ${passed}`);
console.log(`Failed: ${failed}`);

if (failed === 0) {
  console.log('\n✓ All tests passed!');
  process.exit(0);
} else {
  console.log(`\n✗ ${failed} test(s) failed!`);
  process.exit(1);
}
