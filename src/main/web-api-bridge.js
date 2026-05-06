/**
 * Web API Bridge
 * Provides window.electronAPI compatible interface for Docker/web mode
 * All calls are routed to the /manage REST API instead of Electron IPC
 */
(function () {
  'use strict';

  const BASE = '/manage';

  async function api(method, path, body) {
    const opts = {
      method,
      headers: { 'Content-Type': 'application/json' },
    };
    if (body !== undefined) opts.body = JSON.stringify(body);
    const res = await fetch(BASE + path, opts);
    const json = await res.json();
    if (!json.ok) throw new Error(json.error || 'API error');
    return json.data;
  }

  const get = (path) => api('GET', path);
  const post = (path, body) => api('POST', path, body);
  const put = (path, body) => api('PUT', path, body);
  const del = (path) => api('DELETE', path);
  const qs = (params) => {
    const q = Object.entries(params || {}).filter(([, v]) => v !== undefined && v !== null).map(([k, v]) => k + '=' + encodeURIComponent(v)).join('&');
    return q ? '?' + q : '';
  };

  // SSE event emitter for simulating Electron event subscriptions
  const _listeners = {};
  function emit(event, data) {
    (_listeners[event] || []).forEach(fn => fn(data));
  }
  function on(event, fn) {
    if (!_listeners[event]) _listeners[event] = [];
    _listeners[event].push(fn);
    return () => { _listeners[event] = (_listeners[event] || []).filter(f => f !== fn); };
  }

  // Poll proxy status periodically and emit events
  let _proxyStatusPollTimer = null;
  let _lastProxyStatus = null;
  function startProxyStatusPoll() {
    if (_proxyStatusPollTimer) return;
    _proxyStatusPollTimer = setInterval(async () => {
      try {
        const status = await get('/proxy/status');
        const key = JSON.stringify(status);
        if (key !== _lastProxyStatus) {
          _lastProxyStatus = key;
          emit('proxy:statusChanged', status);
        }
      } catch {}
    }, 3000);
  }
  startProxyStatusPoll();

  const proxyAPI = {
    start: (port) => post('/proxy/start', port ? { port } : undefined),
    stop: () => post('/proxy/stop'),
    getStatus: () => get('/proxy/status'),
    onStatusChanged: (callback) => on('proxy:statusChanged', callback),
  };

  const storeAPI = {
    get: async (key) => {
      const config = await get('/config');
      return config ? config[key] : undefined;
    },
    set: (key, value) => post('/config', { [key]: value }),
    delete: (key) => post('/config', { [key]: undefined }),
    clearAll: () => post('/config', {}),
    onInitError: (callback) => () => {},
    retryInit: () => Promise.resolve({ success: true }),
  };

  const providersAPI = {
    getAll: () => get('/providers'),
    getBuiltin: () => get('/providers/builtin'),
    add: (data) => post('/providers', data),
    update: (id, updates) => put('/providers/' + id, updates),
    delete: (id) => del('/providers/' + id),
    checkStatus: (id) => post('/providers/' + id + '/check-status'),
    checkAllStatus: () => post('/providers/check-all-status'),
    duplicate: (id) => post('/providers/' + id + '/duplicate'),
    export: (id) => api('GET', '/providers/' + id + '/export'),
    import: (jsonData) => post('/providers/import', { jsonData }),
    updateModels: (id) => post('/providers/' + id + '/update-models'),
    getEffectiveModels: (id) => get('/providers/' + id + '/effective-models'),
    addCustomModel: (id, model) => post('/providers/' + id + '/custom-model', model),
    removeModel: (id, modelName) => del('/providers/' + id + '/model/' + encodeURIComponent(modelName)),
    resetModels: (id) => post('/providers/' + id + '/reset-models'),
  };

  const accountsAPI = {
    getAll: (includeCredentials) => get('/accounts' + qs({ includeCredentials })),
    getById: (id, includeCredentials) => get('/accounts/' + id + qs({ includeCredentials })),
    getByProvider: (providerId) => get('/providers/' + providerId + '/accounts'),
    add: (data) => post('/accounts', data),
    update: (id, updates) => put('/accounts/' + id, updates),
    delete: (id) => del('/accounts/' + id),
    validate: (id) => post('/accounts/' + id + '/validate'),
    validateToken: (providerId, credentials) => post('/accounts/validate-token', { providerId, credentials }),
    getCredits: (id) => get('/accounts/' + id + '/credits').catch(() => null),
    clearChats: (id) => post('/accounts/' + id + '/clear-chats'),
  };

  // OAuth is not supported in web mode (no browser window)
  const oauthAPI = {
    startLogin: () => Promise.resolve({ success: false, error: 'OAuth not supported in web mode' }),
    cancelLogin: () => Promise.resolve(),
    loginWithToken: (providerId, providerType, token) => Promise.resolve({ success: false, error: 'Not supported in web mode' }),
    validateToken: () => Promise.resolve({ valid: false, error: 'Not supported in web mode' }),
    refreshToken: () => Promise.resolve(null),
    getStatus: () => Promise.resolve('idle'),
    startInAppLogin: () => Promise.resolve({ success: false, error: 'OAuth not supported in web mode' }),
    cancelInAppLogin: () => Promise.resolve(),
    isInAppLoginOpen: () => Promise.resolve(false),
    onCallback: (callback) => () => {},
    onProgress: (callback) => () => {},
  };

  const logsAPI = {
    get: (filter) => get('/logs' + qs(filter || {})),
    getStats: () => get('/logs/stats'),
    getTrend: (days) => get('/logs/trend' + qs({ days })),
    getAccountTrend: (accountId, days) => get('/logs/account/' + accountId + '/trend' + qs({ days })),
    clear: () => del('/logs'),
    export: (format) => get('/logs/export' + qs({ format })).catch(() => '[]'),
    getById: (id) => get('/logs/' + id).catch(() => undefined),
    onNewLog: (callback) => () => {},
  };

  const requestLogsAPI = {
    get: (filter) => get('/request-logs' + qs(filter || {})),
    getById: (id) => get('/request-logs/' + id).catch(() => undefined),
    getStats: () => get('/request-logs/stats'),
    getTrend: (days) => get('/request-logs/trend' + qs({ days })),
    clear: () => del('/request-logs'),
    onNewLog: (callback) => () => {},
  };

  const statisticsAPI = {
    get: () => get('/statistics'),
    getToday: () => get('/statistics/today'),
  };

  const appAPI = {
    getVersion: () => get('/app/version'),
    minimize: () => Promise.resolve(),
    maximize: () => Promise.resolve(),
    close: () => Promise.resolve(),
    showWindow: () => Promise.resolve(),
    hideWindow: () => Promise.resolve(),
    openExternal: (url) => { window.open(url, '_blank'); return Promise.resolve(); },
    checkUpdate: () => Promise.resolve({ hasUpdate: false, currentVersion: '0.0.0', latestVersion: '0.0.0' }),
    downloadUpdate: () => Promise.resolve(),
    installUpdate: () => Promise.resolve(),
    getUpdateStatus: () => Promise.resolve({ status: 'idle' }),
    onUpdateChecking: (callback) => () => {},
    onUpdateAvailable: (callback) => () => {},
    onUpdateNotAvailable: (callback) => () => {},
    onUpdateProgress: (callback) => () => {},
    onUpdateDownloaded: (callback) => () => {},
    onUpdateError: (callback) => () => {},
  };

  const configAPI = {
    get: () => get('/config'),
    update: (updates) => put('/config', updates).then(() => true),
    onConfigChanged: (callback) => () => {},
  }

  const managementApiAPI = {
    getConfig: () => get('/management-api/config'),
    updateConfig: (updates) => put('/management-api/config', updates),
    generateSecret: () => post('/management-api/generate-secret'),
  };

  // managementApi invoke channels mapping
  const managementApiInvoke = {
    'managementApi:getConfig': () => managementApiAPI.getConfig(),
    'managementApi:updateConfig': (updates) => managementApiAPI.updateConfig(updates),
    'managementApi:generateSecret': () => managementApiAPI.generateSecret(),
  };

  const promptsAPI = {
    getAll: () => get('/prompts'),
    getBuiltin: () => get('/prompts/builtin'),
    getCustom: () => get('/prompts/custom'),
    getById: (id) => get('/prompts/' + id).catch(() => undefined),
    add: (prompt) => post('/prompts', prompt),
    update: (id, updates) => put('/prompts/' + id, updates),
    delete: (id) => del('/prompts/' + id),
    getByType: (type) => get('/prompts/by-type/' + type),
  };

  const sessionAPI = {
    getConfig: () => get('/sessions/config'),
    updateConfig: (config) => put('/sessions/config', config),
    getAll: () => get('/sessions'),
    getActive: () => get('/sessions/active'),
    getById: (id) => get('/sessions/' + id).catch(() => undefined),
    getByAccount: (accountId) => get('/sessions/by-account/' + accountId),
    getByProvider: (providerId) => get('/sessions/by-provider/' + providerId),
    delete: (id) => del('/sessions/' + id),
    clearAll: () => del('/sessions/all'),
    cleanExpired: () => post('/sessions/clean-expired'),
  };

  const contextManagementAPI = {
    getConfig: () => get('/context-management/config'),
    updateConfig: (updates) => put('/context-management/config', updates),
  };

  const trayAPI = {
    openDashboard: () => {},
    setHeight: () => {},
    quitApp: () => {},
  };

  window.electronAPI = {
    proxy: proxyAPI,
    store: storeAPI,
    providers: providersAPI,
    accounts: accountsAPI,
    oauth: oauthAPI,
    logs: logsAPI,
    requestLogs: requestLogsAPI,
    statistics: statisticsAPI,
    app: appAPI,
    config: configAPI,
    prompts: promptsAPI,
    session: sessionAPI,
    managementApi: managementApiAPI,
    contextManagement: contextManagementAPI,
    tray: trayAPI,

    on: (channel, callback) => on(channel, callback),
    send: (channel, ...args) => {},
    invoke: async (channel, ...args) => {
      // Map common channels to REST API
      if (channel in managementApiInvoke) {
        return managementApiInvoke[channel](...args)
      }
      console.warn('[WebBridge] Unhandled invoke:', channel, args);
      return undefined;
    },
  };

  console.log('[WebBridge] window.electronAPI initialized (web mode)');
})();
