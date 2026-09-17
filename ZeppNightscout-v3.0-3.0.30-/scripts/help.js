#!/usr/bin/env node

/**
 * Display help information for npm scripts
 */

console.log('\n=== ZeppNightscout - Available Commands ===\n');
console.log('Testing:');
console.log('  npm test              - Run unit tests (test-parser.js)');
console.log('  npm run test:syntax   - Check JavaScript syntax');
console.log('  npm run test:build    - Validate build requirements');
console.log('');
console.log('Development (requires Zeus CLI):');
console.log('  npm run dev           - Start development server');
console.log('  npm run simulator     - Start simulator');
console.log('');
console.log('Building (requires Zeus CLI):');
console.log('  npm run build         - Build app');
console.log('  npm run build:prod    - Build for production');
console.log('');
console.log('Quick Testing (requires Zeus CLI + zeus login):');
console.log('  npm run preview       - Generate QR code for quick install to watch');
console.log('');
console.log('Deployment (requires Zeus CLI):');
console.log('  npm run install:device - Install to connected device');
console.log('');
console.log('Documentation:');
console.log('  See docs/TESTING.md for comprehensive testing guide');
console.log('  See docs/TESTING-QUICK-REFERENCE.md for quick command reference');
console.log('  See README.md for project overview');
console.log('  See DEVELOPMENT.md for development setup');
console.log('');
console.log('Prerequisites:');
console.log('  Install Zeus CLI: npm install -g @zeppos/zeus-cli');
console.log('  Login to Zeus: zeus login (required for preview)');
console.log('');
