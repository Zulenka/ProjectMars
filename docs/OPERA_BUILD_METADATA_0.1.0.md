{
  "generated_at": "2026-02-24T05:03:31-05:00",
  "extension": {
    "name": "MARS War Tracker",
    "version": "0.1.0",
    "manifest_version": 3,
    "description": "Torn.com faction war target tracker overlay."
  },
  "package": {
    "file_name": "opera-0.1.0.zip",
    "file_path": "C:\\Users\\jness\\Documents\\Torn\\ProjectMars\\dist\\opera-0.1.0.zip",
    "size_bytes": 40815,
    "last_write_time": "02/24/2026 04:50:44",
    "sha256": "80E4356B85BCCBEC63273206EAC9CFD18ADCA367C04C22EA077D4470664C16E7",
    "sha1": "9157326BA6567F7025F2CDA2E293B2CBF6B20079"
  },
  "manifest": {
    "permissions": [
      "storage",
      "alarms"
    ],
    "host_permissions": [
      "*://*.torn.com/*",
      "https://api.torn.com/*"
    ],
    "background_service_worker": "src/background/background.js",
    "options_page": "src/options/options.html",
    "popup": "src/popup/popup.html",
    "content_scripts": [
      {
        "matches": [
          "*://*.torn.com/*"
        ],
        "js": [
          "src/shared/compat.js",
          "src/content/content.js"
        ],
        "run_at": "document_idle"
      }
    ]
  }
}
