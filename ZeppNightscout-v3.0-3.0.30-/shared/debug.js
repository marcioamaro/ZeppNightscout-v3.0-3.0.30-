let context = 'module';
let sequence = 0;
const instance = String(Date.now());

export function setDebugContext(value) { context = value; }

export function safeUrl(value) {
  return String(value || '').replace(/(https?:\/\/)[^/@]+@/i, '$1[credentials]@').replace(/[?#].*$/, '[parameters omitted]');
}

export function errorDetails(error) {
  return { message: safeUrl(String(error && error.message || error)), stack: safeUrl(String(error && error.stack || '')) };
}

export function trace(event, details) {
  console.log('[ZIGHTSCOUT][TRACE] ' + JSON.stringify({
    timestamp: Date.now(), version: '3.0.36', appId: 1127422,
    context: context, instance: instance, sequence: ++sequence,
    event: event, ...(details || {})
  }));
}

export function valueInfo(value) {
  const text = value === undefined ? '' : JSON.stringify(value);
  let fingerprint = 0;
  for (let i = 0; i < text.length; i++) fingerprint = ((fingerprint << 5) - fingerprint + text.charCodeAt(i)) | 0;
  return { found: value !== undefined && value !== null, length: text.length, fingerprint: fingerprint };
}
