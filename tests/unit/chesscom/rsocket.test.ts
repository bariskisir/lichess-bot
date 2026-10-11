import { describe, expect, it } from 'vitest';
import {
  acknowledgmentsRoute,
  decodeFrame,
  encodeFireAndForget,
  encodeKeepalive,
  encodeRequestResponse,
  encodeRequestStream,
  encodeSetup,
  eventsRoute,
} from '../../../apps/server/src/adapters/chesscom/rsocket.js';

const GAME_ID = 'f99aa8dd-c51a-11f1-91e9-76c88101000f';
const SETUP_AUTH = {
  client: 'LC6;chrome/154.0.0/browser;Windows 10;t0k3n000;2026.10.3',
  userId: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
};
// Captured request bytes from har/www.chess.com.har entry 686.
const HAR_SUBSCRIPTION = Buffer.from(
  '00000001190040000000000036fe0000323167616d65732e66393961613864642d633531612d313166312d393165392d3736633838313031303030662e6576656e7473',
  'hex',
);
const HAR_ACK_PREFIX = Buffer.from('00000003150000003ffe00003b3a', 'hex');
const HAR_ECHO_REQUEST = Buffer.from(
  '000000021100000009fe000005046563686f31373931363835353037393437',
  'hex',
);

describe('chess.com RSocket framing', () => {
  it('builds the captured SETUP prefix with caller credentials', () => {
    const setup = encodeSetup(SETUP_AUTH);
    expect(setup.subarray(0, 75).toString('hex')).toBe(
      '00000000040000010000000007d000001388276d6573736167652f782e72736f636b65742e636f6d706f736974652d6d657461646174612e7630106170706c69636174696f6e2f6a736f6e',
    );
    expect(JSON.parse(setup.subarray(75).toString('utf8'))).toMatchObject(SETUP_AUTH);
  });

  it('reproduces the captured events subscription bytes', () => {
    expect(encodeRequestStream(1, eventsRoute(GAME_ID)).toString('hex')).toBe(
      HAR_SUBSCRIPTION.toString('hex'),
    );
    const decoded = decodeFrame(HAR_SUBSCRIPTION);
    expect(decoded).toMatchObject({ kind: 'request', streamId: 1, route: eventsRoute(GAME_ID) });
  });

  it('frames acknowledgments as fire-and-forget with the captured prefix', () => {
    const frame = encodeFireAndForget(3, acknowledgmentsRoute(GAME_ID), '{"eventUpdatedAt":"x"}');
    expect(frame.subarray(0, HAR_ACK_PREFIX.length).toString('hex')).toBe(
      HAR_ACK_PREFIX.toString('hex'),
    );
    const decoded = decodeFrame(frame);
    expect(decoded).toMatchObject({ kind: 'request', streamId: 3, route: acknowledgmentsRoute(GAME_ID) });
  });

  it('answers the captured server echo and decodes move confirmations', () => {
    const echo = decodeFrame(HAR_ECHO_REQUEST);
    expect(echo).toMatchObject({ kind: 'request', streamId: 2, route: 'echo', data: '1791685507947' });
    const confirmation = Buffer.from(
      '0000001128607b22757064617465644174223a2275227d',
      'hex',
    );
    expect(decodeFrame(confirmation)).toMatchObject({
      kind: 'payload',
      streamId: 17,
      data: '{"updatedAt":"u"}',
      complete: true,
    });
    expect(() => decodeFrame(encodeKeepalive(true))).not.toThrow();
    expect(() => decodeFrame(encodeRequestResponse(17, `games.${GAME_ID}.moves`, '{}'))).not.toThrow();
  });
});
