import { useSyncExternalStore } from 'react';
import { dashboardClient } from './dashboard-client.js';

export function useDashboard() {
  return useSyncExternalStore(dashboardClient.subscribe, dashboardClient.getSnapshot);
}
