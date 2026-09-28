// Net.js (Singleton WebSocket Client)

class NetClient {
  constructor() {
    this.socket = null;
    this.listeners = new Map(); // type -> Set(callback)
    this._url = null;
  }

  connect(url) {
    this._url = url;
    this.socket = new WebSocket(url);

    this.socket.onmessage = (event) => {
      let msg;
      try { msg = JSON.parse(event.data); } catch { return; }
      const list = this.listeners.get(msg.type);
      if (list) for (const fn of list) try { fn(msg); } catch {}
    };

    return new Promise((resolve) => {
      this.socket.onopen = () => resolve();
      this.socket.onerror = () => resolve();
      this.socket.onclose = () => {
        setTimeout(() => { try { this.connect(this._url); } catch {} }, 1500);
      };
    });
  }

  on(type, fn) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type).add(fn);
    return () => this.off(type, fn);
  }

  off(type, fn) {
    const s = this.listeners.get(type);
    if (s) s.delete(fn);
  }

  send(type, payload = {}) {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) return;
    this.socket.send(JSON.stringify({ type, ...payload }));
  }
}

const Net = new NetClient();
export default Net;
