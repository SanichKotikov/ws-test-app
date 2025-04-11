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

// const MANUAL_CLOSE = 'MANUAL_CLOSE';

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
  private _reconnect: boolean = false;
  private _controller: AbortController | null = null;
  private _subs: TSubsMap = new Map();

  constructor(private _url: string) {}

  private _onReceiveMessage = (event: MessageEvent) => {
    const data = getEventData(event);
    if (!data || isSendMessage(data)) return;

    this._subs.get(data.method)?.forEach((callback) => {
      callback(data.payload);
    });
  };

  private _onConnectionClose = (event: CloseEvent) => {
    log(`Closed ${event.code} ${event.reason}`, 'red');
    this._reconnect && setTimeout(() => this.connect(), 1000);
  };

  private _onVisibilityChange = () => {
    log(`${document.visibilityState}, ${this._socket?.readyState}`);
    if (document.visibilityState !== 'visible') return;
    if (!this._socket || this._socket.readyState === WebSocket.OPEN) return;

    log('Force connect?');
    // this.connect();
  };

  connect = (): void => {
    log('Connect', 'green');

    this._reconnect = true;
    // this._socket?.close(1000, MANUAL_CLOSE);

    this._socket = new WebSocket(this._url);
    this._socket.onmessage = this._onReceiveMessage;
    this._socket.onclose = this._onConnectionClose;
    this._socket.onerror = () => log('Socket error!', 'red');

    if (!this._controller) {
      this._controller = new AbortController();

      document.addEventListener('visibilitychange', this._onVisibilityChange, {
        signal: this._controller.signal,
      });
    }
  };

  subscribe = (method: TReceiveMethod, callback: TCallback): VoidFunction => {
    const id = v4();
    const subs: TMethodSubs = this._subs.get(method) || new Map();
    subs.set(id, callback);
    this._subs.set(method, subs);

    return () => subs.delete(id);
  };

  post = (method: TSendMethod, payload: object): Promise<object | undefined> => {
    log('Post');
    return this._socket?.readyState === WebSocket.OPEN
      ? sendMessage(this._socket, method, payload)
      : Promise.reject(new Error('No connection'));
  };

  close = (): void => {
    log('Close');

    this._reconnect = false;
    if (!this._socket) return;

    if (this._socket.readyState !== WebSocket.CLOSED) {
      this._socket.close(1000);
    }

    this._controller?.abort();
    this._controller = null;
    this._socket = null;
  };
}
