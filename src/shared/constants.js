(function (global) {
  global.MARS_CONSTANTS = {
    STORAGE_KEYS: {
      API_KEY_OBF: "apiKeyObfuscated",
      SETTINGS: "settings",
      WAR_DATA: "warData",
      SESSION: "sessionState"
    },
    DEFAULT_SETTINGS: {
      pollIntervalSeconds: 30,
      maxVisibleTargets: 15,
      panelPosition: "right",
      panelCollapsed: false,
      defaultSort: "all",
      showLastAction: true,
      showLifeBar: true,
      soundAlerts: false,
      flashOnOkay: true,
      panelWidth: 320,
      panelSizeLocked: false,
      panelOffsetTop: null,
      panelOffsetLeft: null
    },
    MESSAGE_TYPES: {
      GET_STATE: "GET_STATE",
      STATE_RESPONSE: "STATE_RESPONSE",
      VALIDATE_API_KEY: "VALIDATE_API_KEY",
      VALIDATE_API_KEY_RESPONSE: "VALIDATE_API_KEY_RESPONSE",
      FORCE_REFRESH: "FORCE_REFRESH",
      WAR_DATA_UPDATED: "WAR_DATA_UPDATED",
      SETTINGS_UPDATED: "SETTINGS_UPDATED",
      PANEL_VISIBILITY_SET: "PANEL_VISIBILITY_SET",
      RESET_EXTENSION_DATA: "RESET_EXTENSION_DATA"
    },
    API_BASE: "https://api.torn.com",
    ATTACK_URL_BASE: "https://www.torn.com/loader.php?sid=attack&user2ID=",
    POLL_ALARM_NAME: "mars-poll",
    WAR_CHECK_ALARM_NAME: "mars-war-check"
  };
})(typeof self !== "undefined" ? self : window);
