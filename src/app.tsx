import { type Component, For, onCleanup, onMount } from 'solid-js';
import { type TColor, logs, log } from './logger';
import { Socket } from './socket';

const COLORS: Record<TColor, string> = {
  green: '#d1fa93',
  red: '#ffacac',
};

function formatTime(time: number): string {
  return new Date(time).toLocaleTimeString('ru', {
    minute: '2-digit',
    second: '2-digit',
  });
}

export const App: Component = () => {
  const socket = new Socket('wss://echo.websocket.org');

  onMount(() => {
    const handler = () => {
      if (document.hidden) return;
      setTimeout(() => log(`[CB]: connected ${socket.connected}`), 100);
    };

    document.addEventListener('visibilitychange', handler);

    onCleanup(() => {
      document.removeEventListener('visibilitychange', handler);
    });
  });

  const post = () => {
    socket.post('send_time', { time: Date.now() })
      .then(() => log('SENT!'))
      .catch((error) => log(error.message, 'red'));
  };

  return (
    <div>
      <button onClick={() => socket.connect()}>Connect</button>
      <button onClick={() => socket.close()}>Close</button>
      <button onClick={post}>Post</button>
      <br />
      <br />
      <div style={{ 'font-size': '12px', 'font-family': 'monospace' }}>
        <For each={logs()}>
          {(item) => (
            <div style={{ 'background-color': item.color && COLORS[item.color] }}>
              {formatTime(item.time)} :: {item.message}
            </div>
          )}
        </For>
      </div>
    </div>
  );
};
