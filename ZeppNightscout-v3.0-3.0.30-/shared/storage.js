import { trace, valueInfo, errorDetails } from './debug';
import { LocalStorage, localStorage as legacyStorage } from '@zos/storage';

// Native LocalStorage instances cache the entire JSON document. Separate keys into
// separate files and reopen on every access so UI/service snapshots cannot replace
// each other's settings when updating a heartbeat, command queue or debug entry.
function openKey(key) {
  if (!/^[a-zA-Z0-9_]+$/.test(key)) throw new Error('Invalid storage key');
  return new LocalStorage('zightscout_v2_' + key + '.json');
}

const seenReads = {};

const migratable = ['zightscout_settings', 'zightscout_last_data'];

export const localStorage = {
  getItem(key, fallback) {
    const store = openKey(key);
    if (store.getItem('present') === true) {
      const value = store.getItem('value');
      const info = valueInfo(value);
      if (seenReads[key] !== info.fingerprint) {
        trace('STORAGE_READ', { key: key, ...info });
        seenReads[key] = info.fingerprint;
      }
      return value === null || value === undefined ? fallback : value;
    }
    if (migratable.indexOf(key) !== -1) {
      const fresh = new LocalStorage();
      const disk = fresh.getItem(key), cached = legacyStorage.getItem(key);
      const saved = disk || cached;
      trace('STORAGE_LEGACY_READ', { key: key, disk: valueInfo(disk), cached: valueInfo(cached) });
      if (saved !== undefined && saved !== null) {
        this.setItem(key, saved);
        console.log('[ZIGHTSCOUT][STORAGE] MIGRATED key=' + key);
        return saved;
      }
    }
    if (seenReads[key] !== 'missing') { trace('STORAGE_MISSING', { key: key }); seenReads[key] = 'missing'; }
    return fallback;
  },
  setItem(key, value) {
    const started = Date.now();
    try {
      const store = openKey(key);
      store.setItem('value', value);
      store.setItem('present', true);
      const reopened = openKey(key);
      const verified = reopened.getItem('present') === true && JSON.stringify(reopened.getItem('value')) === JSON.stringify(value);
      trace('STORAGE_WRITE', { key: key, ...valueInfo(value), verified: verified, durationMs: Date.now() - started });
      if (!verified) console.log('[ZIGHTSCOUT][STORAGE] WRITE result=unconfirmed key=' + key);
    } catch (error) {
      trace('STORAGE_WRITE_ERROR', { key: key, ...errorDetails(error) });
      throw error;
    }
  },
  removeItem(key) {
    // Tombstone only this key; never mutate the legacy shared document.
    trace('STORAGE_REMOVE', { key: key });
    this.setItem(key, null);
    return true;
  }
};
