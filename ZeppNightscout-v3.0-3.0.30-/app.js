import { messageBuilder, MESSAGE_TYPES } from './shared/message';
import * as ble from '@zos/ble';
import { localStorage } from './shared/storage';

App({
  globalData: {
    messageBuilder: messageBuilder,
    MESSAGE_TYPES: MESSAGE_TYPES
  },
  onCreate(options) {
    console.log('ZightScout initialized');
    // Keep the native BLE receiver at app scope. AppService consumes these
    // snapshots without replacing the callback on devices such as Active 2.
    ble.createConnect((index, data, size) => {
      try {
        const bytes = new Uint8Array(data.buffer || data, data.byteOffset || 0, size || data.byteLength);
        localStorage.setItem('zightscout_ble_mailbox', JSON.stringify({ timestamp: Date.now(), bytes: Array.from(bytes) }));
      } catch (e) { console.log('[BLE] Mailbox receive error: ' + e); }
    });
  },

  onDestroy(options) {
    console.log("ZightScout destroyed");
  },
});