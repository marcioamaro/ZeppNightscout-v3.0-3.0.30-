/**
 * Nightscout Zepp OS App - Second Test Page (Alternative Implementation)
 * Alternative BLE communication approach using message passing pattern
 * 
 * This is an alternative to the current page2.js that tries a different approach
 * for device-to-app-side communication that hasn't been attempted yet.
 */

Page({
  onInit() {
    console.log('=== PAGE2 ALTERNATIVE INIT START ===');
    console.log('Second page starting (alternative implementation)');
    
    // Verify getApp() exists
    const app = getApp();
    if (!app || !app.globalData) {
      console.error('CRITICAL: Cannot access app.globalData');
      return;
    }
    
    const { messageBuilder, MESSAGE_TYPES } = app.globalData;
    console.log('messageBuilder:', typeof messageBuilder);
    console.log('MESSAGE_TYPES:', typeof MESSAGE_TYPES);
    
    // Get device screen dimensions
    const deviceInfo = hmSetting.getDeviceInfo();
    const screenWidth = deviceInfo.width;
    const screenHeight = deviceInfo.height;
    
    // Store widget references
    const widgets = {};
    
    // Title
    hmUI.createWidget(hmUI.widget.TEXT, {
      x: 0,
      y: 80,
      w: screenWidth,
      h: 60,
      text: 'Page 2 (Alt)',
      text_size: 32,
      color: 0xffffff,
      align_h: hmUI.align.CENTER_H,
      align_v: hmUI.align.CENTER_V
    });

    // Success message
    hmUI.createWidget(hmUI.widget.TEXT, {
      x: 0,
      y: 140,
      w: screenWidth,
      h: 40,
      text: 'Alternative BLE Test',
      text_size: 20,
      color: 0x00ff00,
      align_h: hmUI.align.CENTER_H,
      align_v: hmUI.align.CENTER_V
    });

    // Result text to display responses
    widgets.resultText = hmUI.createWidget(hmUI.widget.TEXT, {
      x: 0,
      y: 250,
      w: screenWidth,
      h: 100,
      text: 'Tap button to test\nBLE communication',
      text_size: 18,
      color: 0x888888,
      align_h: hmUI.align.CENTER_H,
      align_v: hmUI.align.CENTER_V
    });

    // APPROACH 1: Try sending message without expecting response
    // (Tests if send works at all)
    widgets.testSendButton = hmUI.createWidget(hmUI.widget.BUTTON, {
      x: (screenWidth - 140) / 2,
      y: 190,
      w: 140,
      h: 50,
      radius: 25,
      normal_color: 0x0066cc,
      press_color: 0x0099ff,
      text: 'test send',
      text_size: 20,
      color: 0xffffff,
      click_func: () => {
        console.log('=== TEST SEND CLICKED ===');
        
        try {
          // Check if hmBle exists
          if (typeof hmBle === 'undefined') {
            console.error('hmBle is undefined');
            widgets.resultText.setProperty(hmUI.prop.TEXT, 'Error: hmBle unavailable');
            widgets.resultText.setProperty(hmUI.prop.COLOR, 0xff0000);
            return;
          }
          
          // Try to send a test message using proper message format
          const testMessage = messageBuilder.request({
            type: MESSAGE_TYPES.GET_SECRET
          });
          const messageStr = JSON.stringify(testMessage);
          
          console.log('Test message:', messageStr);
          console.log('Attempting send...');
          
          // Try sending as string directly (no buffer conversion)
          if (typeof hmBle.send === 'function') {
            try {
              // Approach 1: Send as string directly
              console.log('Trying direct string send...');
              const result = hmBle.send(messageStr);
              console.log('Direct send result:', result);
              widgets.resultText.setProperty(hmUI.prop.TEXT, 'Direct send: OK');
              widgets.resultText.setProperty(hmUI.prop.COLOR, 0x00ff00);
            } catch (e1) {
              console.error('Direct send failed:', e1.message);
              
              // Approach 2: Send with buffer conversion
              console.log('Trying buffer send...');
              if (typeof hmBle.str2buf === 'function') {
                const buffer = hmBle.str2buf(messageStr);
                const result = hmBle.send(buffer, buffer.byteLength);
                console.log('Buffer send result:', result);
                widgets.resultText.setProperty(hmUI.prop.TEXT, 'Buffer send: OK');
                widgets.resultText.setProperty(hmUI.prop.COLOR, 0x00ff00);
              } else {
                throw new Error('hmBle.str2buf not available');
              }
            }
          } else {
            throw new Error('hmBle.send is not a function');
          }
        } catch (error) {
          console.error('Send test failed:', error.name, error.message);
          widgets.resultText.setProperty(hmUI.prop.TEXT, 'Send failed: ' + error.message);
          widgets.resultText.setProperty(hmUI.prop.COLOR, 0xff0000);
        }
        
        console.log('=== TEST SEND END ===');
      }
    });

    // APPROACH 2: Try alternative listener patterns
    console.log('=== TESTING LISTENER PATTERNS ===');
    console.log('typeof hmBle:', typeof hmBle);
    
    if (typeof hmBle !== 'undefined') {
      // Log all available methods on hmBle
      console.log('hmBle methods:');
      for (let key in hmBle) {
        console.log('  hmBle.' + key + ':', typeof hmBle[key]);
      }
      
      // Try different listener patterns
      
      // Pattern 1: createConnect (current approach)
      if (typeof hmBle.createConnect === 'function') {
        console.log('Trying hmBle.createConnect...');
        try {
          hmBle.createConnect(function(index, data, size) {
            console.log('=== CREATECONNECT CALLBACK ===');
            console.log('index:', index, 'size:', size);
            
            if (typeof hmBle.buf2str === 'function') {
              const str = hmBle.buf2str(data, size);
              console.log('Received:', str);
              widgets.resultText.setProperty(hmUI.prop.TEXT, 'Received: ' + str.substring(0, 30));
              widgets.resultText.setProperty(hmUI.prop.COLOR, 0x00ff00);
            }
          });
          console.log('createConnect setup OK');
        } catch (e) {
          console.error('createConnect failed:', e.message);
        }
      }
      
      // Pattern 2: mstOnConnect (alternative pattern)
      if (typeof hmBle.mstPrepare === 'function') {
        console.log('Trying hmBle.mstOnConnect pattern...');
        try {
          hmBle.mstPrepare();
          hmBle.mstOnConnect = function(index, data, size) {
            console.log('=== MSTONCONNECT CALLBACK ===');
            console.log('index:', index, 'size:', size);
            
            if (typeof hmBle.buf2str === 'function') {
              const str = hmBle.buf2str(data, size);
              console.log('Received:', str);
              widgets.resultText.setProperty(hmUI.prop.TEXT, 'MST Received: ' + str.substring(0, 30));
              widgets.resultText.setProperty(hmUI.prop.COLOR, 0x00ff00);
            }
          };
          console.log('mstOnConnect setup OK');
        } catch (e) {
          console.error('mstOnConnect failed:', e.message);
        }
      }
      
      // Pattern 3: Direct callback assignment
      if (typeof hmBle.onMessage === 'function' || 'onMessage' in hmBle) {
        console.log('Trying hmBle.onMessage...');
        try {
          hmBle.onMessage = function(data) {
            console.log('=== ONMESSAGE CALLBACK ===');
            console.log('Received:', data);
            widgets.resultText.setProperty(hmUI.prop.TEXT, 'onMessage: ' + JSON.stringify(data).substring(0, 30));
            widgets.resultText.setProperty(hmUI.prop.COLOR, 0x00ff00);
          };
          console.log('onMessage setup OK');
        } catch (e) {
          console.error('onMessage failed:', e.message);
        }
      }
    }
    
    console.log('=== LISTENER SETUP END ===');

    // Swipe instructions
    widgets.swipeText = hmUI.createWidget(hmUI.widget.TEXT, {
      x: 0,
      y: 360,
      w: screenWidth,
      h: 40,
      text: 'Swipe right to go back',
      text_size: 18,
      color: 0x888888,
      align_h: hmUI.align.CENTER_H,
      align_v: hmUI.align.CENTER_V
    });

    // Gesture handler
    hmApp.registerGestureEvent(function(event) {
      if (event === hmApp.gesture.RIGHT) {
        console.log('Navigating back...');
        hmApp.gotoPage({ url: 'page/index' });
      }
      return true;
    });
    
    console.log('=== PAGE2 ALTERNATIVE INIT END ===');
  },

  onDestroy() {
    console.log('=== PAGE2 ALTERNATIVE DESTROY ===');
    
    if (typeof hmBle !== 'undefined' && typeof hmBle.disConnect === 'function') {
      try {
        hmBle.disConnect();
        console.log('BLE disconnected');
      } catch (e) {
        console.error('Disconnect error:', e.message);
      }
    }
  }
});
