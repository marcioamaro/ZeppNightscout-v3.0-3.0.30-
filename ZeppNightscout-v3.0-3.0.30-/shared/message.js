/**
 * Message communication layer between device page and app-side service
 */

// Message builder for device to app-side
export const messageBuilder = {
  request: (params) => {
    return {
      type: 'request',
      ...params
    };
  },
  
  response: (data) => {
    return {
      type: 'response',
      data
    };
  }
};

// Message types
export const MESSAGE_TYPES = {
  FETCH_DATA: 'FETCH_DATA',
  UPDATE_SETTINGS: 'UPDATE_SETTINGS',
  VERIFY_URL: 'VERIFY_URL',
  VALIDATE_TOKEN: 'VALIDATE_TOKEN'
};
