// Mock WebSocket toan cuc cho unit test.
// Cho phep test dieu khien open/close/message/error bang tay.

class MockWebSocket {
  static instances = [];
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;

  constructor(url, protocols) {
    this.url = url;
    this.protocols = protocols;
    this.readyState = MockWebSocket.CONNECTING;
    this.sentMessages = [];
    this.onopen = null;
    this.onclose = null;
    this.onmessage = null;
    this.onerror = null;
    MockWebSocket.instances.push(this);
  }

  send(data) {
    if (this.readyState !== MockWebSocket.OPEN) {
      throw new Error('WebSocket chua OPEN, khong the gui');
    }
    this.sentMessages.push(data);
  }

  close(code = 1000, reason = '') {
    this.readyState = MockWebSocket.CLOSED;
    if (this.onclose) {
      this.onclose({ code, reason, wasClean: true });
    }
  }

  // ---- Helper cho test dieu khien ----
  simulateOpen() {
    this.readyState = MockWebSocket.OPEN;
    if (this.onopen) this.onopen({});
  }

  simulateMessage(data) {
    if (this.onmessage) {
      this.onmessage({ data: typeof data === 'string' ? data : JSON.stringify(data) });
    }
  }

  simulateError() {
    if (this.onerror) this.onerror({});
  }

  simulateAbnormalClose() {
    this.readyState = MockWebSocket.CLOSED;
    if (this.onclose) this.onclose({ code: 1006, reason: 'abnormal', wasClean: false });
  }

  static clear() {
    MockWebSocket.instances.length = 0;
  }
}

globalThis.WebSocket = MockWebSocket;

// Helper fire native online/offline event (gia lap window trinh duyet)
function fireOnline() {
  window.dispatchEvent(new Event('online'));
}
function fireOffline() {
  window.dispatchEvent(new Event('offline'));
}

window.__triggerOnline = fireOnline;
window.__triggerOffline = fireOffline;

// Bo log noise trong test
const originalError = console.error;
console.error = function () {
  const args = Array.prototype.slice.call(arguments);
  const first = args[0];
  if (typeof first === 'string' && first.indexOf('not wrapped in act') >= 0) return;
  originalError.apply(console, args);
};
