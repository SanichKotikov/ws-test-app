import { v4 } from 'uuid';
import { log } from './logger';

type TSendMethod = `send_${string}`;
type TReceiveMethod = `receive_${string}`;
type TMethod = TSendMethod | TReceiveMethod;
type TCallback = (data: any) => void;
type TMethodSubs = Map<string, TCallback>;
type TSubsMap = Map<string, TMethodSubs>;

type TResponse = {
  id: string;
  method: TMethod;
  payload?: object;
  error?: unknown;
};

function getEventData(event: MessageEvent): TResponse | null {
  try {
    return JSON.parse(event.data);
  }
  catch (error: unknown) {
    return null;
  }
}

function isSendMessage(data: TResponse): boolean {
  return data.method.startsWith('send_');
}

function sendMessage(socket: WebSocket, method: TSendMethod, payload: object) {
  return new Promise<object | undefined>((resolve, reject) => {
    const id = v4();

    const handler = (event: MessageEvent) => {
      const data = getEventData(event);

      if (data && isSendMessage(data) && data.id === id) {
        data.error ? reject(data.error) : resolve(data.payload);
        socket.removeEventListener('message', handler);
      }
    };

    socket.addEventListener('message', handler);
    socket.send(JSON.stringify({ id, method, payload }));
  });
}

export class Socket {
  private _socket: WebSocket | null = null;
  private _reconnect = false;
  private _reconnectTimer: ReturnType<typeof setTimeout>;
  private _subs: TSubsMap = new Map();

  constructor(private _url: string, private _token?: string) {}

  private _onReceiveMessage = (event: MessageEvent) => {
    const data = getEventData(event);
    if (!data || isSendMessage(data)) return;

    this._subs.get(data.method)?.forEach((callback) => {
      callback(data.payload);
    });
  };

  private _onConnectionClose = (event: CloseEvent) => {
    log(`[WS]: on close: ${event.code} ${event.reason}`);
    this._socket = null;

    this._reconnectTimer = setTimeout(() => {
      log(`[WS]: on timer: ${!!this._socket} ${!!this._reconnect}`);
      this._reconnect && this.connect();
    }, 1000);
  };

  private _onConnectionError = () => {
    log('[WS]: on error', 'red');
    this._socket = null;
  };

  get connected(): boolean {
    log(`[WS]: get connected ${this._socket?.readyState}`);
    return this._socket?.readyState === WebSocket.OPEN;
  }

  connect = (): void => {
    log('[WS]: connecting', 'green');
    this._reconnect = true;
    this._socket = new WebSocket(this._url, this._token);
    this._socket.onmessage = this._onReceiveMessage;
    this._socket.onclose = this._onConnectionClose;
    this._socket.onerror = this._onConnectionError;
  };

  subscribe = (method: TReceiveMethod, callback: TCallback): VoidFunction => {
    const id = v4();
    const subs: TMethodSubs = this._subs.get(method) || new Map();
    subs.set(id, callback);
    this._subs.set(method, subs);

    return () => subs.delete(id);
  };

  post = (method: TSendMethod, payload: object): Promise<object | undefined> => {
    log('[WS]: Post');
    return this._socket?.readyState === WebSocket.OPEN
      ? sendMessage(this._socket, method, payload)
      : Promise.reject(new Error('No connection'));
  };

  close = (): void => {
    log('[WS]: close');
    this._reconnect = false;
    clearTimeout(this._reconnectTimer);
    if (!this._socket) return;

    this._socket.onclose = null;
    this._socket.close(1000);
    this._socket = null;
  };
}
