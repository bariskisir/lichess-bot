import { useSyncExternalStore } from 'react';
import { dashboardClient } from './dashboard-client.js';

const listeners = new Set<() => void>();
let timer: ReturnType<typeof setInterval> | undefined;
let now = dashboardClient.now();

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  if (!timer) {
    now = dashboardClient.now();
    timer = setInterval(() => {
      now = dashboardClient.now();
      for (const callback of listeners) callback();
    }, 100);
  }
  return () => {
    listeners.delete(listener);
    if (!listeners.size) {
      clearInterval(timer);
      timer = undefined;
    }
  };
}

const idle = () => () => {};
const snapshot = () => now;

/** One shared timer keeps clock and delay displays aligned with authoritative server time. */
export function useServerTime(active = true): number {
  return useSyncExternalStore(active ? subscribe : idle, snapshot);
}
