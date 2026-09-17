const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const root = path.resolve(__dirname, '..');

function harness(interval = 5) {
  let now = 1800000000000, id = 1, service, nativeCallback;
  let sendFails = false, notifyResult = 12, running = false;
  const storage = new Map(), alarms = new Map(), packets = [], notices = [], logs = [], vibrations = [];
  const players = [], media = { fail: false };
  const intervals = new Map(), timeouts = [];
  let starts = 0, stops = 0, exits = 0, connects = 0, disconnects = 0;
  const files = new Map();
  class LocalStorage {
    constructor(file = 'legacy.json') { this.file = file; this.cache = JSON.parse(files.get(file) || '{}'); }
    getItem(k) { return this.cache[k]; }
    setItem(k,v) { this.cache[k]=v; files.set(this.file,JSON.stringify(this.cache)); }
    removeItem(k) { delete this.cache[k]; files.set(this.file,JSON.stringify(this.cache)); }
  }
  const legacyStorage = new LocalStorage();
  class Clock extends Date { static now() { return now; } }
  const platform = {
    '@zos/media': { id: { PLAYER: 1 }, create: () => {
      if (media.fail) throw Error('Audio unavailable');
      const p = {
        source: { FILE: 1 }, event: { PREPARE: 1, PLAY: 2, COMPLETE: 3 },
        callbacks: {}, starts: 0, stops: 0,
        addEventListener(e, cb) { this.callbacks[e] = cb; },
        setSource(source, options) { this.file = options.file; },
        prepare() {},
        start() { this.starts++; },
        stop() { this.stops++; }
      };
      players.push(p);
      return p;
    } },
    '@zos/storage': { LocalStorage, localStorage: legacyStorage },
    '@zos/notification': { notify: o => { notices.push(o); return notifyResult; } },
    '@zos/alarm': { REPEAT_ONCE: 0, getAllAlarms: () => [...alarms.keys()], set: o => { alarms.set(id,o); return id++; }, cancel: n => { alarms.delete(n); return 0; } },
    '@zos/app-service': {
      start: o => { starts++; running = true; o.complete_func({ result: true }); return 0; },
      stop: o => { stops++; running = false; o.complete_func({ result: true }); return 0; },
      getAllAppServices: () => running ? ['app-service/index'] : [],
      exit: () => { exits++; running = false; }
    },
    '@zos/app': { getPackageInfo: () => ({appId:1127422,version:'3.0.7'}) },
    '@zos/sensor': {
      Time: class { onPerMinute(cb) { this.tick = cb; } },
      Vibrator: class { start(opt) { vibrations.push(opt); } stop() {} },
      VIBRATOR_SCENE_NOTIFICATION: 1,
      VIBRATOR_SCENE_STRONG_REMINDER: 2
    },
    '@zos/ble': {
      createConnect: cb => { connects++; nativeCallback = cb; },
      disConnect: () => { disconnects++; nativeCallback = null; },
      send: buffer => {
        if (sendFails) throw Error('Disconnected');
        packets.push(new Uint8Array(buffer).slice());
        return true;
      }
    }
  };
  const cache = {};
  function load(relative) {
    const file = path.resolve(root, relative);
    if (cache[file]) return cache[file];
    let code = fs.readFileSync(file,'utf8');
    const exports = [...code.matchAll(/export (?:function|const) (\w+)/g)].map(m => m[1]);
    code = code.replace(/import ([^;]+?) from ['"]([^'"]+)['"];?/g, (_, binding, source) => {
      const name = source.startsWith('.') ? path.resolve(path.dirname(file),source) + '.js' : source;
      if (binding.startsWith('* as ')) return `const ${binding.slice(5)} = require(${JSON.stringify(name)});`;
      return `const ${binding.replace(/\bas\b/g, ':')} = require(${JSON.stringify(name)});`;
    }).replace(/export /g,'');
    const context = {
      require: name => platform[name] || load(name),
      Date: Clock, ArrayBuffer, DataView, Uint8Array,
      console: { log: (...s) => logs.push(s.join(' ')), error: (...s) => logs.push(s.join(' ')) },
      AppService: o => { service = o; },
      setInterval: cb => { intervals.set(id,cb); return id++; }, clearInterval: n => intervals.delete(n),
      setTimeout: cb => { timeouts.push(cb); return id++; }, clearTimeout: () => {}
    };
    const result = vm.runInNewContext(code + `\n;({${exports.join(',')}})`,context,{filename:file});
    cache[file] = result;
    return result;
  }
  const localStorage = load('shared/storage.js').localStorage;
  storage.get = k => localStorage.getItem(k);
  storage.set = (k,v) => localStorage.setItem(k,v);
  storage.has = k => localStorage.getItem(k) !== undefined;
  storage.delete = k => localStorage.removeItem(k);
  const settings = load('shared/settings.js');
  const config = { ...settings.DEFAULT_SETTINGS, backgroundInterval: interval, apiUrl: 'https://example.com' };
  settings.saveSettings(config);
  const bg = load('shared/background.js');
  function boot() { load('app-service/index.js'); running = true; service.onInit(); return service; }
  function handshake() {
    const packet = new ArrayBuffer(17), v = new DataView(packet);
    v.setUint8(0,1); v.setUint8(1,1); v.setUint16(2,1,true); v.setUint16(6,42,true);
    service.handleBleMessage(packet,17);
  }
  function respond(data) {
    const bytes = Uint8Array.from(Buffer.from(JSON.stringify({data})));
    service.handleBleMessage(bytes.buffer,bytes.length);
  }
  return { players, media, load, bg, settings, config, storage, LocalStorage, legacyStorage, alarms, packets, notices, logs, vibrations, boot, handshake, respond,
    now: () => now, advance: ms => { now += ms; }, save: () => settings.saveSettings(config),
    failSend: b => { sendFails = b; }, notifyResult: n => { notifyResult = n; },
    counts: () => ({ starts, stops, exits, connects, disconnects }),
    requests: () => packets.filter(p => new DataView(p.buffer).getUint16(2,true) === 4).map(p => JSON.parse(Buffer.from(p.subarray(16)).toString())),
    pollUI: () => intervals.forEach(cb => cb()), flushUI: () => { while(timeouts.length) timeouts.shift()(); }
  };
}

let checks = 0;
function test(name, fn) { fn(); checks++; console.log('PASS ' + name); }
for (const minutes of [5,10,30,60]) test(`poll every ${minutes} minutes, persisted alarm, no reconnect duplicates`, () => {
  const h = harness(minutes), s = h.boot(); h.handshake();
  assert.equal(h.requests().length,0);
  h.advance(minutes*60000-1); s.runCycle('minute'); assert.equal(h.requests().length,0);
  h.advance(1); s.onEvent('action=poll'); assert.equal(h.requests().length,1);
  assert.equal(h.requests()[0].apiUrl,'https://example.com');
  h.handshake(); s.runCycle('minute'); assert.equal(h.requests().length,1);
  const alarm = [...h.alarms.values()].find(a => a.store);
  assert.equal(alarm.url,'app-service/index');
  assert.equal(alarm.time*1000,h.now()+15000);
  h.respond({currentBG:'100',readingTimestamp:h.now(),backgroundCycle:s.state.cycle});
  h.advance(minutes*60000); s.onEvent('action=poll'); assert.equal(h.requests().length,2);
});
test('OFF cancels alarms, stops service, and suppresses late readings', () => {
  const h = harness(), s=h.boot(); h.config.backgroundInterval=0; h.save(); h.bg.syncBackground(h.config);
  assert.equal(h.alarms.size,0); assert.equal(h.counts().stops,1);
  h.advance(600000); s.runCycle('minute'); h.respond({currentBG:'50'});
  assert.equal(h.requests().length,0); assert.equal(h.notices.length,0);
});
test('opening/resuming ON does not stop/restart a running service', () => {
  const h=harness(); h.boot(); const before=h.counts();
  h.bg.syncBackground(h.config); h.bg.syncBackground(h.config);
  assert.equal(h.counts().starts,before.starts); assert.equal(h.counts().stops,0);
});
test('interval changes are based on last request, including restart', () => {
  const h=harness(30), s=h.boot(); h.handshake(); h.advance(5*60000);
  h.config.backgroundInterval=5; h.save(); s.runCycle('minute'); assert.equal(h.requests().length,1);
  s.onDestroy(); assert([...h.alarms.values()].some(a=>a.store));
  s.onInit(); h.handshake(); assert.equal(h.requests().length,1);
});
test('disconnected BLE does not consume the interval; handshake sends overdue query', () => {
  const h=harness(), s=h.boot(); h.advance(300000); s.runCycle('minute');
  assert.equal(h.requests().length,0); assert.equal(Number(h.storage.get(h.bg.LAST_REQUEST_KEY)),h.now()-300000);
  h.handshake(); assert.equal(h.requests().length,1);
});
test('failed BLE send retries without recording a successful request', () => {
  const h=harness(), s=h.boot(); h.handshake(); h.failSend(true); h.advance(300000); s.runCycle('minute');
  assert.equal(s.state.pendingSince,0); assert.equal(h.requests().length,0);
  h.failSend(false); h.handshake(); assert.equal(h.requests().length,1);
});
test('missing URL uses bounded retry instead of an alarm every second', () => {
  const h=harness(), s=h.boot(); h.config.apiUrl=''; h.storage.delete('zightscout_settings'); h.save(); h.advance(300000); s.runCycle('minute');
  assert([...h.alarms.values()].some(a=>a.time*1000===h.now()+60000));
  assert.equal(h.requests().length,0);
});
test('warning notifications respect toggle, thresholds, deduplication and fresh readings', () => {
  const h=harness(), s=h.boot();
  s.processBackgroundReading({currentBG:'130',readingTimestamp:h.now()+1}); assert.equal(h.notices.length,0);
  h.config.outOfRangeVibration=true; h.save();
  s.processBackgroundReading({currentBG:'130',readingTimestamp:h.now()+1}); assert.equal(h.notices.length,1);
  s.processBackgroundReading({currentBG:'130',readingTimestamp:h.now()+1}); assert.equal(h.notices.length,1);
  s.processBackgroundReading({currentBG:'130',readingTimestamp:h.now()+2}); assert.equal(h.notices.length,2);
  for (const value of [85,100,120]) s.processBackgroundReading({currentBG:value,readingTimestamp:h.now()+3});
  assert.equal(h.notices.length,2);
  for (const value of [65,84,121,185]) s.processBackgroundReading({currentBG:value,readingTimestamp:h.now()+4});
  assert.equal(h.notices.length,6);
});
test('critical alerts use their own toggle and configured limits', () => {
  const h=harness(), s=h.boot(); h.config.criticalVibration=false; h.config.outOfRangeVibration=true; h.save();
  s.processBackgroundReading({currentBG:'50'}); assert.equal(h.notices.length,0);
  h.config.criticalVibration=true; h.save(); s.processBackgroundReading({currentBG:'50'});
  assert.equal(h.notices.length,1); assert.equal(h.notices[0].vibrate,5);
});
test('failed notification is logged accurately and can be retried', () => {
  const h=harness(), s=h.boot(); h.notifyResult(0); s.processBackgroundReading({currentBG:'50',readingTimestamp:h.now()+1});
  assert(h.logs.some(l=>l.includes('NOTIFY_FAILED'))); assert(!h.storage.has('zightscout_notified_reading'));
  h.notifyResult(5); s.processBackgroundReading({currentBG:'50',readingTimestamp:h.now()+1});
  assert(h.logs.some(l=>l.includes('NOTIFY_ACCEPTED')));
});
test('notification snooze silences only alerts for the selected duration', () => {
  const h=harness(), s=h.boot(); h.config.outOfRangeVibration=true; h.save();
  s.processBackgroundReading({currentBG:'130',readingTimestamp:h.now()+1}); assert.equal(h.notices.length,1);
  s.onEvent('action=snooze&minutes=15');
  s.processBackgroundReading({currentBG:'130',readingTimestamp:h.now()+2}); assert.equal(h.notices.length,1);
  assert(Number(h.storage.get('zightscout_alert_snooze_until')) > h.now());
  h.advance(15*60000); s.processBackgroundReading({currentBG:'130',readingTimestamp:h.now()+3}); assert.equal(h.notices.length,2);
});

test('debug contains saved parameters and the complete correlated cycle', () => {
  const h=harness(), s=h.boot(); h.handshake(); h.advance(300000); s.onEvent('action=poll');
  h.respond({currentBG:'50',readingTimestamp:h.now(),backgroundCycle:s.state.cycle});
  const log=JSON.parse(h.storage.get('zightscout_background_log'));
  for (const event of ['SETTINGS_SAVED','WAKE','FETCH_SENT','GLUCOSE_RECEIVED','ALERT_EVALUATE','ALERT_MATCH','NOTIFY_ACCEPTED','NEXT_POLL']) assert(log.some(l=>l.event===event),event);
  assert(log.some(l=>l.event==='GLUCOSE_RECEIVED' && l.glucose==='50' && l.cycle===s.state.cycle));
  assert(log.some(l=>l.settings && l.settings.backgroundInterval===5));
});
test('UI owns direct BLE while visible and releases it when closed', () => {
  const h=harness(), s=h.boot(); const before=h.counts();
  const ui=h.load('shared/page-ble.js'); let received=0;
  ui.createConnect(()=>received++);
  assert.equal(h.counts().connects,before.connects+1);
  assert.equal(h.counts().connects,before.connects+1);
  ui.disConnect();
  assert.equal(h.counts().disconnects,before.disconnects+1);
});
test('manual refresh fetches after its required BLE handshake', () => {
  const h=harness(), s=h.boot();
  h.bg.requestBackgroundRefresh(h.config);
  h.advance(1000); s.onEvent('action=poll');
  // The initial wake only asks the phone-side service for a BLE port.
  assert.equal(h.requests().length,0);
  h.handshake();
  assert.equal(h.requests().length,1);
  assert.equal(h.requests()[0].type,'FETCH_DATA');
});
test('connection status shows BLE and HTTP ports with fresh, stale, and error states', () => {
  const h=harness(); h.storage.set('zightscout_ble_last_contact',String(h.now())); h.storage.set('zightscout_ble_port','42');
  h.storage.set('zightscout_last_fetch_at',String(h.now())); h.storage.set('zightscout_last_data',JSON.stringify({currentBG:'100',readingTimestamp:h.now()}));
  const status=h.load('shared/connection-status.js').getConnectionStatus(h.config);
  assert(status.text.includes('BLE OK P42')); assert(status.text.includes('HTTP OK:443')); assert.equal(status.level,'green');
  h.storage.set('zightscout_last_data',JSON.stringify({currentBG:'100',readingTimestamp:h.now()-10*60000}));
  assert(h.load('shared/connection-status.js').getConnectionStatus(h.config).reading.label.startsWith('ATUAL'));
  const delayed=h.load('shared/connection-status.js').getConnectionStatus(h.config,h.now()+60001);
  assert.equal(delayed.reading.label,'ATRASADO');
  h.storage.set('zightscout_last_fetch_error',JSON.stringify({timestamp:h.now(),message:'HTTP 503'}));
  assert.equal(h.load('shared/connection-status.js').getConnectionStatus(h.config).level,'red');
});
test('native cached snapshots cannot erase URL when unrelated keys change', () => {
  const h=harness(), s=h.boot();
  h.config.apiUrl='https://saved.example.com'; h.config.outOfRangeVibration=true; h.save();
  h.storage.set('zightscout_service_heartbeat',String(h.now()));
  h.storage.delete('zightscout_commands');
  h.storage.delete('zightscout_poll_alarm');
  s.runCycle('action=commands');
  assert.equal(h.settings.loadSettings().apiUrl,'https://saved.example.com');
  assert.equal(h.settings.loadSettings().outOfRangeVibration,true);
});
test('an explicit empty URL clears the saved URL', () => {
  const h=harness();
  h.settings.saveSettings({...h.config,apiUrl:''});
  assert.equal(h.settings.loadSettings().apiUrl,'');
});
test('legacy settings migrate with saved URL and custom thresholds intact', () => {
  const h=harness();
  const legacy = {...h.config,apiUrl:'https://previous.example.com',veryLow:60,low:90,high:110,veryHigh:200};
  h.legacyStorage.setItem('zightscout_settings',JSON.stringify(legacy));
  // A separate device installation with a legacy file has no v2 settings entry.
  const isolated = new h.LocalStorage('zightscout_v2_zightscout_settings.json');
  isolated.removeItem('present'); isolated.removeItem('value');
  const restored=h.settings.loadSettings();
  assert.equal(restored.apiUrl,legacy.apiUrl); assert.equal(restored.high,110);
  h.storage.delete('zightscout_commands');
  assert.equal(h.settings.loadSettings().apiUrl,legacy.apiUrl);
});
test('upgrade removes orphan timers from this app before scheduling one poll', () => {
  const h=harness(); h.alarms.set(500,{store:true}); h.alarms.set(501,{store:true});
  h.bg.syncBackground(h.config);
  assert(!h.alarms.has(500)); assert(!h.alarms.has(501)); assert.equal(h.alarms.size,1);
});
test("a URL confirmada por teste continua disponivel se um rascunho vier vazio", () => {
  const h=harness();
  h.settings.markUrlVerified("https://verified.example.com/");
  h.storage.delete("zightscout_settings");
  assert.equal(h.settings.loadSettings().apiUrl,"https://verified.example.com");
});
test('manual tests work with monitoring OFF without changing real alert state', () => {
  const h=harness(0); h.config.notificationSound=true; h.save();
  h.storage.set('zightscout_notified_reading','real-reading');
  h.load('shared/background-alert.js').setAlertSnooze(15);
  const until=h.storage.get('zightscout_alert_snooze_until');
  const testAlert=h.load('shared/test-alert.js').testAlertNotification;
  assert(testAlert('warning')); assert(testAlert('critical'));
  assert.equal(h.players.length,0); assert(h.notices.every(n=>n.title.startsWith('TESTE')));
  assert.equal(h.storage.get('zightscout_notified_reading'),'real-reading');
  assert.equal(h.storage.get('zightscout_alert_snooze_until'),until);
  assert.equal(h.settings.loadSettings().backgroundInterval,0);
  assert(!testAlert('normal')); assert.equal(h.notices.length,2);
});
test('snooze suppresses real notifications', () => {
  const h=harness(); h.config.notificationSound=true; h.save();
  const alerts=h.load('shared/background-alert.js'); alerts.setAlertSnooze(15);
  alerts.processBackgroundReading({currentBG:200,readingTimestamp:h.now()+1});
  assert.equal(h.notices.length,0);
});
function nextRepeat(h) {
  const entry=[...h.alarms.entries()].find(([,a])=>a.url==='app-service/alert-service');
  assert(entry, 'repeat alarm exists');
  const [id,a]=entry; h.alarms.delete(id); h.advance(a.time*1000-h.now());
  return JSON.parse(a.param);
}
test('critical notification repeats exactly three times, five seconds apart, without duplicate wakes', () => {
  const h=harness(); const alerts=h.load('shared/background-alert.js');
  const repeat=h.load('shared/alert-repeat.js');
  const began=h.now(), readingTimestamp=h.now()+1; alerts.processBackgroundReading({currentBG:220,readingTimestamp});
  assert.equal(h.notices.length,1);
  const second=nextRepeat(h); assert.equal(h.now()-began,5000);
  assert(repeat.handleAlertRepeat(second)); assert.equal(h.notices.length,2);
  assert(!repeat.handleAlertRepeat(second)); assert.equal(h.notices.length,2);
  const third=nextRepeat(h); assert.equal(h.now()-began,10000);
  assert(repeat.handleAlertRepeat(third)); assert.equal(h.notices.length,3);
  assert(h.notices[1].title.endsWith('(2/3)')); assert(h.notices[2].title.endsWith('(3/3)'));
  assert(!repeat.handleAlertRepeat(third)); assert.equal(h.alarms.size,0);
  alerts.processBackgroundReading({currentBG:220,readingTimestamp});
  assert.equal(h.notices.length,3); assert.equal(h.alarms.size,0);
});
test('snooze, OFF, disabled critical alerts, and recovery prevent queued red repeats', () => {
  for (const reason of ['snooze','off','disabled','normal','warning']) {
    const h=harness(); const alerts=h.load('shared/background-alert.js');
    const repeat=h.load('shared/alert-repeat.js');
    alerts.processBackgroundReading({currentBG:220,readingTimestamp:h.now()+1});
    const pending=nextRepeat(h);
    if(reason==='snooze') alerts.setAlertSnooze(15);
    if(reason==='off') { h.config.backgroundInterval=0; h.save(); h.bg.syncBackground(h.config); }
    if(reason==='disabled') { h.config.criticalVibration=false; h.save(); }
    if(reason==='normal') alerts.processBackgroundReading({currentBG:100,readingTimestamp:h.now()+2});
    if(reason==='warning') alerts.processBackgroundReading({currentBG:80,readingTimestamp:h.now()+2});
    assert(!repeat.handleAlertRepeat(pending),reason); assert.equal(h.notices.length,1,reason);
  }
});
test('new critical reading replaces old repeats and expired repeats are dropped', () => {
  const h=harness(); const alerts=h.load('shared/background-alert.js'); const repeat=h.load('shared/alert-repeat.js');
  alerts.processBackgroundReading({currentBG:220,readingTimestamp:h.now()+1}); const old=nextRepeat(h);
  alerts.processBackgroundReading({currentBG:230,readingTimestamp:h.now()+2});
  assert(!repeat.handleAlertRepeat(old));
  const pending=nextRepeat(h); h.advance(21000); assert(!repeat.handleAlertRepeat(pending));
  assert.equal(h.notices.length,2);
});
test('manual red test repeats three times with monitoring OFF and leaves real state unchanged', () => {
  const h=harness(0); h.storage.set('zightscout_notified_reading','real');
  h.load('shared/test-alert.js').testAlertNotification('critical');
  const repeat=h.load('shared/alert-repeat.js');
  repeat.handleAlertRepeat(nextRepeat(h)); repeat.handleAlertRepeat(nextRepeat(h));
  assert.equal(h.notices.length,3); assert.equal(h.players.length,0);
  assert.equal(h.vibrations.length, 3);
  assert.equal(h.notices[0].actions.length, 4);
  assert.equal(h.storage.get('zightscout_notified_reading'),'real');
  assert(h.notices.every(n=>n.title.startsWith('TESTE')));
});
test('yellow and failed notifications do not schedule a red sequence', () => {
  const h=harness(); const testAlert=h.load('shared/test-alert.js').testAlertNotification;
  testAlert('warning'); assert.equal(h.alarms.size,0);
  h.notifyResult(0); testAlert('critical'); assert.equal(h.alarms.size,0);
  h.notifyResult(12); testAlert('critical'); const pending=nextRepeat(h);
  h.notifyResult(0); assert(!h.load('shared/alert-repeat.js').handleAlertRepeat(pending));
  assert.equal(h.alarms.size,0);
});
test('AppService emits notification and vibration for yellow alert when enabled, and skips when disabled', () => {
  const h = harness(5);
  h.config.outOfRangeVibration = true;
  h.save();
  h.boot();
  h.respond({ currentBG: '75', readingTimestamp: h.now(), backgroundCycle: 'test1' });
  assert.equal(h.notices.length, 1);
  assert.equal(h.notices[0].title, 'Glicemia Fora do Alvo');
  assert.equal(h.vibrations.length, 1);
  assert.equal(h.vibrations[0].mode, 1);

  const h2 = harness(5);
  h2.config.outOfRangeVibration = false;
  h2.save();
  h2.boot();
  h2.respond({ currentBG: '75', readingTimestamp: h2.now(), backgroundCycle: 'test2' });
  assert.equal(h2.notices.length, 0);
  assert.equal(h2.vibrations.length, 0);
});
test('AppService emits notification and strong vibration for red alert when enabled, and skips when disabled', () => {
  const h = harness(5);
  h.config.criticalVibration = true;
  h.save();
  h.boot();
  h.respond({ currentBG: '50', readingTimestamp: h.now(), backgroundCycle: 'test-red1' });
  assert.equal(h.notices.length, 1);
  assert.equal(h.notices[0].title, 'Glicemia Critica');
  assert.equal(h.vibrations.length, 1);
  assert.equal(h.vibrations[0].mode, 2);

  const h2 = harness(5);
  h2.config.criticalVibration = false;
  h2.save();
  h2.boot();
  h2.respond({ currentBG: '50', readingTimestamp: h2.now(), backgroundCycle: 'test-red2' });
  assert.equal(h2.notices.length, 0);
  assert.equal(h2.vibrations.length, 0);
});
test('Foreground reading triggers processBackgroundReading when in alert range', () => {
  const h = harness(5);
  h.config.outOfRangeVibration = true;
  h.save();
  const bgAlert = h.load('shared/background-alert.js');
  bgAlert.processBackgroundReading({ currentBG: '140', readingTimestamp: h.now(), backgroundCycle: 'fg-test' });
  assert.equal(h.notices.length, 1);
  assert.equal(h.notices[0].title, 'Glicemia Fora do Alvo');
  assert.equal(h.vibrations.length, 1);
});
console.log(checks + ' background scenarios passed.');
