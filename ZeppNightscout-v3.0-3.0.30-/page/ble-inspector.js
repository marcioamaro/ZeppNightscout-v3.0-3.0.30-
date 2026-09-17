/**
 * BLE Inspector Page - Debug tool to inspect available BLE APIs
 */

Page({
  onInit() {
    console.log('=== BLE INSPECTOR INIT ===');
  },

  build() {
    console.log('=== BLE INSPECTOR BUILD ===');

    var deviceInfo = (typeof hmSetting !== 'undefined' && typeof hmSetting.getDeviceInfo === 'function') ? hmSetting.getDeviceInfo() : { width: 466, height: 466 };
    var screenWidth = deviceInfo.width || 466;
    var screenHeight = deviceInfo.height || 466;

    var widgets = {};

    hmUI.createWidget(hmUI.widget.TEXT, {
      x: 0,
      y: 40,
      w: screenWidth,
      h: 40,
      text: 'BLE Inspector',
      text_size: 24,
      color: 0xffffff,
      align_h: hmUI.align.CENTER_H,
      align_v: hmUI.align.CENTER_V
    });

    var resultText = hmUI.createWidget(hmUI.widget.TEXT, {
      x: 10,
      y: 90,
      w: screenWidth - 20,
      h: screenHeight - 160,
      text: 'Inspecting BLE APIs...',
      text_size: 14,
      color: 0x00ff00,
      align_h: hmUI.align.LEFT,
      align_v: hmUI.align.TOP
    });

    var report = 'BLE API Inspection\n\n';

    report += 'hmBle defined: ' + (typeof hmBle !== 'undefined' ? 'YES' : 'NO') + '\n';
    if (typeof hmBle !== 'undefined') {
      var keys = [];
      for (var k in hmBle) {
        keys.push(k + ': ' + typeof hmBle[k]);
      }
      report += keys.join('\n') + '\n';
    }

    var app = getApp();
    report += '\nGlobalData: ' + (app && app.globalData ? 'OK' : 'NULL') + '\n';

    resultText.setProperty(hmUI.prop.TEXT, report);

    hmUI.createWidget(hmUI.widget.BUTTON, {
      x: Math.floor((screenWidth - 120) / 2),
      y: screenHeight - 60,
      w: 120,
      h: 36,
      radius: 18,
      normal_color: 0x0066cc,
      press_color: 0x0099ff,
      text: 'Voltar',
      text_size: 16,
      color: 0xffffff,
      click_func: function() {
        if (typeof hmApp !== 'undefined') {
          hmApp.gotoPage({ url: 'page/index' });
        }
      }
    });

    if (typeof hmApp !== 'undefined' && typeof hmApp.registerGestureEvent === 'function') {
      hmApp.registerGestureEvent(function(event) {
        if (hmApp.gesture && event === hmApp.gesture.RIGHT) {
          hmApp.gotoPage({ url: 'page/index' });
          return true;
        }
        return true;
      });
    }

    console.log('=== BLE INSPECTOR END ===');
  }
});