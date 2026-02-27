(function (global) {
  if (!global || !global.chrome) return;

  const chromeApi = global.chrome;
  if (chromeApi.__marsCompatPatched) return;
  chromeApi.__marsCompatPatched = true;

  function promisifyMethod(host, methodName) {
    if (!host || typeof host[methodName] !== "function") return;
    const original = host[methodName].bind(host);
    host[methodName] = function (...args) {
      const lastArg = args[args.length - 1];
      if (typeof lastArg === "function") {
        return original(...args);
      }
      try {
        const direct = original(...args);
        if (direct && typeof direct.then === "function") {
          return direct;
        }
      } catch (_) {
        // Fall through to callback wrapper.
      }
      return new Promise((resolve, reject) => {
        original(...args, (result) => {
          const err = chromeApi.runtime && chromeApi.runtime.lastError;
          if (err) {
            reject(new Error(err.message || String(err)));
            return;
          }
          resolve(result);
        });
      });
    };
  }

  if (chromeApi.storage && chromeApi.storage.local) {
    promisifyMethod(chromeApi.storage.local, "get");
    promisifyMethod(chromeApi.storage.local, "set");
    promisifyMethod(chromeApi.storage.local, "remove");
    promisifyMethod(chromeApi.storage.local, "clear");
  }

  if (chromeApi.runtime) {
    promisifyMethod(chromeApi.runtime, "sendMessage");
    promisifyMethod(chromeApi.runtime, "openOptionsPage");
  }

  if (chromeApi.alarms) {
    promisifyMethod(chromeApi.alarms, "clear");
    // `create` is synchronous in Chromium and can be awaited safely.
  }
})(typeof self !== "undefined" ? self : window);
