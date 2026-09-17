const assert = require('assert');
const fs = require('fs');
const settingsSource = fs.readFileSync('shared/settings.js', 'utf8');
const phoneSource = fs.readFileSync('app-side/index.js', 'utf8');

assert(settingsSource.includes('tokenConfigured: false'), 'watch settings must retain only token state');
assert(!settingsSource.includes('apiToken:'), 'watch settings must not persist the raw token');
assert(phoneSource.includes("getStoredSetting('zightscout_nightscout_token', '')"), 'phone must restore its token');
assert(phoneSource.includes("setStoredSetting('zightscout_nightscout_token', configuredToken)"), 'phone must persist its token');
assert(phoneSource.includes('encodeURIComponent(clean)'), 'token must be URL encoded');
assert(phoneSource.includes('this.fetchNightscoutData(configuredUrl, configuredToken, data.backgroundCycle)'), 'background fetch must use the phone token');
assert(!phoneSource.includes("data.apiToken || ''"), 'fetch must not require the watch to resend a token');
assert(phoneSource.includes("Token invalido ou sem permissao de leitura"), '401/403 must have an actionable message');
console.log('PASS token flow: masked watch state, phone storage, encoded request, and auth errors');
