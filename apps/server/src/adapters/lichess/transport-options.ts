import { DEFAULT_USER_AGENT } from '../../../../../packages/contracts/src/index.js';
import type { LichessRetryOptions } from './lichess-retry.js';
export { DEFAULT_USER_AGENT };

export interface LichessTransportOptions {
  userAgent: string;
  retry?: LichessRetryOptions;
}
export const DEFAULT_TRANSPORT: LichessTransportOptions = { userAgent: DEFAULT_USER_AGENT };
