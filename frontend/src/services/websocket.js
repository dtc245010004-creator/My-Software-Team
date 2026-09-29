class TelemetryWebSocket {
  constructor() {
    this.ws = null;
    this.listeners = new Set();
    this.subscribedSessions = new Set();
    this.reconnectTimer = null;
    this.isConnected = false;
  }

  connect() {
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      return;
    }

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.host;
    const wsUrl = `${protocol}//${host}/ws/telemetry`;

    try {
      this.ws = new WebSocket(wsUrl);

      this.ws.onopen = () => {
        this.isConnected = true;
        // Gửi lại các session đã subscribe trước khi mất kết nối
        this.subscribedSessions.forEach((sessionId) => {
          this.send({ action: 'subscribe', session_id: sessionId });
        });
      };

      this.ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          this.listeners.forEach((listener) => listener(data));
        } catch (e) {
          // Bỏ qua tin nhắn không phải JSON (như PONG)
        }
      };

      this.ws.onclose = () => {
        this.isConnected = false;
        this.scheduleReconnect();
      };

      this.ws.onerror = () => {
        this.ws?.close();
      };
    } catch (err) {
      this.scheduleReconnect();
    }
  }

  scheduleReconnect() {
    if (this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, 3000);
  }

  send(payload) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(payload));
    }
  }

  subscribeSession(sessionId) {
    const id = Number(sessionId);
    this.subscribedSessions.add(id);
    this.send({ action: 'subscribe', session_id: id });
  }

  unsubscribeSession(sessionId) {
    const id = Number(sessionId);
    this.subscribedSessions.delete(id);
    this.send({ action: 'unsubscribe', session_id: id });
  }

  addListener(callback) {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  disconnect() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }
}

export const telemetryWs = new TelemetryWebSocket();
