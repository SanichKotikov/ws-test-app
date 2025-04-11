import { createSignal } from 'solid-js';

export type TColor = 'green' | 'red';

type TLog = {
  message: string;
  time: number;
  color?: TColor;
};

const [logs, setLogs] = createSignal<TLog[]>([]);

export function log(message: string, color?: TColor): void {
  setLogs((prev) => {
    return [...prev, { message, time: Date.now(), color }];
  });
}

export { logs };
