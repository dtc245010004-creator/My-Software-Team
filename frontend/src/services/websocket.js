/**
 * Real-time WebSocket client cho kenh telemetry EV CSMS.
 *
 * Backend contract (xac nhan tu backend/app/main.py:113 + app/simulator/charging_simulator.py:156):
 *   - Endpoint: ws://<host>/ws/telemetry (qua Vite proxy /ws)
 *   - Authentication: KHONG yeu cau (Backend accept anon)
 *   - Heartbeat: client gui text "ping" -> server tra {"event":"PONG"}
 *   - Action protocol: {"action":"subscribe","session_id":N} / {"action":"unsubscribe","session_id":N}
 *   - Event types: CONNECTED, PONG, SUBSCRIBED, UNSUBSCRIBED, TELEMETRY, GRID_TELEMETRY, STOPPED
 *   - Replay: KHONG co (khong co last_event_id/sequence). Sau reconnect phai chu dong goi REST de resync.
 *
 * Tinh nang:
 *   - Singleton shared connection (ref-count), khong tao duplicate khi nhieu component subscribe.
 *   - Exponential backoff + jitter: 1s -> 2s -> 4s -> 8s -> 16s (cap 30s).
 *   - Client-side heartbeat: gui "ping" moi 25s, timeout 35s -> dong + reconnect.
 *   - Lang nghe window online/offline, khong spam reconnect khi offline.
 *   - Status listener (CONNECTING / CONNECTED / RECONNECTING / DISCONNECTED / CLOSED) cho UI.
 *   - Intentional close khi logout: KHONG reconnect, clear toan bo timer.
 *   - REST resync hook: callback duoc goi sau khi reconnect thanh cong de bu event bi mat.
 */

const HEARTBEAT_INTERVAL_MS = 25000;
const HEARTBEAT_TIMEOUT_MS = 35000;
const RECONNECT_INITIAL_MS = 1000;
const RECONNECT_MAX_MS = 30000;
const RECONNECT_JITTER_RATIO = 0.3; // +-30% jitter

export const WS_STATUS = Object.freeze({
  IDLE: 'idle',
  CONNECTING: 'connecting',
  CONNECTED: 'connected',
  RECONNECTING: 'reconnecting',
  DISCONNECTED: 'disconnected',
  CLOSED: 'closed',
});

/**
 * Tinh delay reconnect voi exponential backoff + jitter.
 * Pure function de de test.
 */
export function computeReconnectDelay(attempt, options) {
  options = options || {};
  const initial = options.initial != null ? options.initial : RECONNECT_INITIAL_MS;
  const max = options.max != null ? options.max : RECONNECT_MAX_MS;
  const jitterRatio = options.jitterRatio != null ? options.jitterRatio : RECONNECT_JITTER_RATIO;
  const safeAttempt = Math.max(1, Math.floor(attempt));
  const exp = Math.min(max, initial * Math.pow(2, safeAttempt - 1));
  const jitterRange = exp * jitterRatio;
  const jitter = (Math.random() * 2 - 1) * jitterRange;
  return Math.max(0, Math.round(exp + jitter));
}

class TelemetryWebSocketClient {
  constructor() {
    this._ws = null;
    this._status = WS_STATUS.IDLE;
    this._statusListeners = new Set();
    this._messageListeners = new Set();
    this._resyncListeners = new Set();

    this._refCount = 0;
    this._reconnectAttempt = 0;
    this._reconnectTimer = null;
    this._isIntentionalClose = false;

    this._heartbeatTimer = null;
    this._heartbeatTimeoutTimer = null;
    this._lastPongAt = 0;

    this._subscribedSessions = new Set();

    this._onlineHandler = () => this._handleOnline();
    this._offlineHandler = () => this._handleOffline();
  }

  // ============== Public API (cho `telemetryWs` singleton) ==============

  get status() {
    return this._status;
  }

  get isConnected() {
    return this._status === WS_STATUS.CONNECTED;
  }

  /** Tang ref-count, mo connection neu chua co WS dang chay. */
  connect() {
    this._refCount += 1;
    if (this._isIntentionalClose) {
      this._isIntentionalClose = false;
    }
    // Mo connection khi chua co WS dang chay (ke ca sau khi teardown truoc do)
    const hasLiveWs =
      this._ws &&
      (this._ws.readyState === WebSocket.OPEN || this._ws.readyState === WebSocket.CONNECTING);
    if (
      !hasLiveWs &&
      (this._status === WS_STATUS.IDLE || this._status === WS_STATUS.CLOSED)
    ) {
      this._open();
    }
    return this._refCount;
  }

  /** Giam ref-count, dong connection khi ve 0. KHONG reconnect sau khi dong intentional. */
  disconnect() {
    if (this._refCount === 0) return 0;
    this._refCount -= 1;
    if (this._refCount === 0) {
      this._teardown({ intentional: true });
    }
    return this._refCount;
  }

  subscribeSession(sessionId) {
    const id = Number(sessionId);
    if (Number.isNaN(id)) return;
    this._subscribedSessions.add(id);
    this._send({ action: 'subscribe', session_id: id });
  }

  unsubscribeSession(sessionId) {
    const id = Number(sessionId);
    if (Number.isNaN(id)) return;
    this._subscribedSessions.delete(id);
    this._send({ action: 'unsubscribe', session_id: id });
  }

  /**
   * Dang ky listener nhan moi message tu server (backward compat).
   * Tra ve ham unsubscribe.
   */
  addListener(callback) {
    if (typeof callback !== 'function') return function () {};
    this._messageListeners.add(callback);
    return () => this._messageListeners.delete(callback);
  }

  /** Dang ky listener nhan status change. Tra ve ham unsubscribe. */
  addStatusListener(callback) {
    if (typeof callback !== 'function') return function () {};
    this._statusListeners.add(callback);
    // Goi ngay voi status hien tai
    try {
      callback(this._status);
    } catch (e) {
      // Bo qua loi listener
    }
    return () => this._statusListeners.delete(callback);
  }

  /** Dang ky callback duoc goi sau khi reconnect thanh cong (REST resync). */
  addResyncListener(callback) {
    if (typeof callback !== 'function') return function () {};
    this._resyncListeners.add(callback);
    return () => this._resyncListeners.delete(callback);
  }

  // ============== Internal ==============

  _setStatus(nextStatus) {
    if (this._status === nextStatus) return;
    this._status = nextStatus;
    this._statusListeners.forEach((cb) => {
      try {
        cb(nextStatus);
      } catch (e) {
        // Bo qua listener loi
      }
    });
  }

  _open() {
    if (typeof window === 'undefined' || typeof WebSocket === 'undefined') {
      return; // Moi truong khong co WebSocket
    }
    if (window.navigator && window.navigator.onLine === false) {
      this._setStatus(WS_STATUS.DISCONNECTED);
      return;
    }
    if (this._ws) {
      const state = this._ws.readyState;
      if (state === WebSocket.OPEN || state === WebSocket.CONNECTING) {
        return;
      }
    }
    this._setStatus(WS_STATUS.CONNECTING);

    let wsUrl;
    try {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const host = window.location.host;
      wsUrl = protocol + '//' + host + '/ws/telemetry';
    } catch (e) {
      wsUrl = 'ws://localhost/ws/telemetry';
    }

    try {
      this._ws = new WebSocket(wsUrl);
    } catch (err) {
      this._scheduleReconnect();
      return;
    }

    this._ws.onopen = () => {
      this._reconnectAttempt = 0;
      this._setStatus(WS_STATUS.CONNECTED);
      this._startHeartbeat();
      // Re-subscribe cac session da dang ky truoc khi mat ket noi
      this._subscribedSessions.forEach((sid) => {
        this._send({ action: 'subscribe', session_id: sid });
      });
      // Bao resync de component tu goi REST lay snapshot
      this._resyncListeners.forEach((cb) => {
        try {
          cb();
        } catch (e) {
          // Bo qua
        }
      });
    };

    this._ws.onmessage = (event) => {
      // Client gui text "ping", server khong echo lai
      if (typeof event.data === 'string' && event.data === 'ping') return;

      // Server co the gui text "ping" (mot so proxy) -> bo qua
      if (typeof event.data === 'string' && event.data === 'pong') {
        this._markPong();
        return;
      }

      let data;
      try {
        data = JSON.parse(event.data);
      } catch (e) {
        // Malformed event: KHONG crash, bo qua
        return;
      }

      if (data && data.event === 'PONG') {
        this._markPong();
        return;
      }

      this._dispatchMessage(data);
    };

    this._ws.onerror = () => {
      // onerror thuong di kem onclose. De onclose xu ly reconnect.
    };

    this._ws.onclose = (event) => {
      this._stopHeartbeat();
      const wasIntentional = this._isIntentionalClose;
      this._ws = null;

      if (wasIntentional || this._refCount === 0) {
        this._setStatus(WS_STATUS.CLOSED);
        return;
      }
      this._setStatus(WS_STATUS.DISCONNECTED);
      this._scheduleReconnect();
    };
  }

  _dispatchMessage(data) {
    if (!data || typeof data !== 'object') return;
    this._messageListeners.forEach((cb) => {
      try {
        cb(data);
      } catch (e) {
        // Bo qua listener loi de khong lam crash pipeline
      }
    });
  }

  _send(payload) {
    if (this._ws && this._ws.readyState === WebSocket.OPEN) {
      try {
        this._ws.send(JSON.stringify(payload));
      } catch (e) {
        // Bo qua loi gui
      }
    }
  }

  _sendRawText(text) {
    if (this._ws && this._ws.readyState === WebSocket.OPEN) {
      try {
        this._ws.send(text);
      } catch (e) {
        // Bo qua
      }
    }
  }

  // ============== Heartbeat ==============

  _startHeartbeat() {
    this._stopHeartbeat();
    this._lastPongAt = Date.now();
    // Gui ping moi HEARTBEAT_INTERVAL_MS, neu qua HEARTBEAT_TIMEOUT_MS khong co PONG thi reconnect
    const tick = () => {
      if (!this._ws || this._ws.readyState !== WebSocket.OPEN) return;
      this._sendRawText('ping');
      this._heartbeatTimeoutTimer = setTimeout(() => {
        this._forceReconnect('heartbeat-timeout');
      }, HEARTBEAT_TIMEOUT_MS - HEARTBEAT_INTERVAL_MS);
      this._heartbeatTimer = setTimeout(tick, HEARTBEAT_INTERVAL_MS);
    };
    this._heartbeatTimer = setTimeout(tick, HEARTBEAT_INTERVAL_MS);
  }

  _stopHeartbeat() {
    if (this._heartbeatTimer) {
      clearInterval(this._heartbeatTimer);
      this._heartbeatTimer = null;
    }
    if (this._heartbeatTimeoutTimer) {
      clearTimeout(this._heartbeatTimeoutTimer);
      this._heartbeatTimeoutTimer = null;
    }
  }

  _markPong() {
    this._lastPongAt = Date.now();
    if (this._heartbeatTimeoutTimer) {
      clearTimeout(this._heartbeatTimeoutTimer);
      this._heartbeatTimeoutTimer = null;
    }
  }

  _forceReconnect(_reason) {
    if (!this._ws) return;
    try {
      this._ws.close();
    } catch (e) {
      // Bo qua
    }
  }

  // ============== Reconnect ==============

  _scheduleReconnect() {
    if (this._reconnectTimer) return; // Da co timer roi, khong tao them
    if (this._refCount === 0 || this._isIntentionalClose) return;

    this._reconnectAttempt += 1;
    const delay = computeReconnectDelay(this._reconnectAttempt);
    this._setStatus(WS_STATUS.RECONNECTING);
    this._reconnectTimer = setTimeout(() => {
      this._reconnectTimer = null;
      if (this._refCount === 0 || this._isIntentionalClose) return;
      this._open();
    }, delay);
  }

  _cancelReconnect() {
    if (this._reconnectTimer) {
      clearTimeout(this._reconnectTimer);
      this._reconnectTimer = null;
    }
  }

  // ============== Network online/offline ==============

  _attachNetworkListeners() {
    if (typeof window === 'undefined') return;
    window.addEventListener('online', this._onlineHandler);
    window.addEventListener('offline', this._offlineHandler);
  }

  _detachNetworkListeners() {
    if (typeof window === 'undefined') return;
    window.removeEventListener('online', this._onlineHandler);
    window.removeEventListener('offline', this._offlineHandler);
  }

  _handleOnline() {
    if (this._refCount === 0 || this._isIntentionalClose) return;
    if (this._status === WS_STATUS.CONNECTED) return;
    // Thu reconnect ngay
    this._cancelReconnect();
    this._open();
  }

  _handleOffline() {
    // Bat ky status nao cung co the chuyen ve DISCONNECTED khi offline
    if (this._status !== WS_STATUS.CLOSED) {
      this._setStatus(WS_STATUS.DISCONNECTED);
    }
    this._cancelReconnect();
  }

  // ============== Teardown ==============

  _teardown(options) {
    options = options || {};
    const intentional = !!options.intentional;
    const resetRefCount = !!options.resetRefCount;
    this._cancelReconnect();
    this._stopHeartbeat();
    if (intentional) {
      this._isIntentionalClose = true;
    }
    if (this._ws) {
      try {
        this._ws.close();
      } catch (e) {
        // Bo qua
      }
      this._ws = null;
    }
    if (resetRefCount) {
      this._refCount = 0;
      this._subscribedSessions.clear();
    }
    this._setStatus(WS_STATUS.CLOSED);
  }
}

// === Singleton: `telemetryWs` (backward compat) ===
export const telemetryWs = new TelemetryWebSocketClient();

// Tu attach network listeners 1 lan
if (typeof window !== 'undefined') {
  telemetryWs._attachNetworkListeners();
}

/**
 * API moi cho component muon quan ly lifecycle doc lap.
 * Tra ve object co `close()` de cleanup khi unmount.
 */
export function createTelemetrySocket(options) {
  options = options || {};
  const onStatusChange = options.onStatusChange;
  const onMessage = options.onMessage;
  const onResync = options.onResync;
  telemetryWs.connect();
  const unsubs = [];
  if (typeof onStatusChange === 'function') {
    unsubs.push(telemetryWs.addStatusListener(onStatusChange));
  }
  if (typeof onMessage === 'function') {
    unsubs.push(telemetryWs.addListener(onMessage));
  }
  if (typeof onResync === 'function') {
    unsubs.push(telemetryWs.addResyncListener(onResync));
  }
  return {
    close: function () {
      unsubs.forEach((u) => {
        try {
          u();
        } catch (e) {
          // Bo qua
        }
      });
      telemetryWs.disconnect();
    },
  };
}
