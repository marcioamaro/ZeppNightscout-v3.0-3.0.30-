#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const appJsonPath = path.join(__dirname, '..', 'app.json');
const appJson = JSON.parse(fs.readFileSync(appJsonPath, 'utf8'));
const version = appJson.app && appJson.app.version;

if (!version || typeof version.code !== 'number' || typeof version.name !== 'string') {
  throw new Error('app.json has no valid app.version object');
}

const parts = version.name.split('.').map(Number);
if (parts.length !== 3 || parts.some(Number.isNaN)) {
  throw new Error('app.version.name must use MAJOR.MINOR.PATCH format');
}

version.code += 1;
version.name = parts[0] + '.' + parts[1] + '.' + (parts[2] + 1);

fs.writeFileSync(appJsonPath, JSON.stringify(appJson, null, 2) + '\n');
console.log('[VERSION] ' + version.name + ' (code ' + version.code + ')');
