/**
 * Minimal RSocket v1 framing for the chess.com live-game transport.
 *
 * Only the frames chess.com uses are implemented: SETUP, REQUEST_STREAM
 * (game events), REQUEST_RESPONSE (moves, server echo), REQUEST_FNF
 * (acknowledgments), PAYLOAD (responses and event pushes), KEEPALIVE and
 * CANCEL. Wire vectors come from `har/www.chess.com.har` entry 686
 * (`wss://www.chess.com/service/play-us-2-5/rsocket`).
 */

export const enum RsocketType {
  Setup = 0x01,
  Keepalive = 0x03,
  RequestResponse = 0x04,
  RequestFireAndForget = 0x05,
  RequestStream = 0x06,
  RequestN = 0x08,
  Cancel = 0x09,
  Payload = 0x0a,
  Error = 0x0b,
}

const FLAG_METADATA = 0x100;
const FLAG_NEXT = 0x20;
const FLAG_COMPLETE = 0x40;
const FLAG_RESPOND = 0x80;

const ROUTING_MIME_ID = 0xfe;
const STREAM_REQUEST_N = 0x40000000;

/** Fixed SETUP prefix: header, version, keepalive, lifetime and MIME table. */
const SETUP_PREFIX_HEX =
  '00000000040000010000000007d000001388276d6573736167652f782e72736f636b65742e636f6d706f736974652d6d657461646174612e7630106170706c69636174696f6e2f6a736f6e';

export interface SetupAuth {
  client: string;
  userId: string;
}

export function encodeSetup(auth: SetupAuth): Buffer {
  const payload = JSON.stringify({
    acknowledgements: true,
    authentication: 'strict',
    client: auth.client,
    userId: auth.userId,
  });
  return Buffer.concat([Buffer.from(SETUP_PREFIX_HEX, 'hex'), Buffer.from(payload, 'utf8')]);
}

function routingMetadata(route: string): Buffer {
  const routeBytes = Buffer.from(route, 'utf8');
  if (routeBytes.length > 255) throw new Error('RSocket route is too long.');
  const inner = Buffer.concat([Buffer.from([routeBytes.length]), routeBytes]);
  const header = Buffer.from([ROUTING_MIME_ID, 0, 0, 0]);
  header.writeUIntBE(inner.length, 1, 3);
  return Buffer.concat([header, inner]);
}

function frameHeader(streamId: number, type: RsocketType, flags: number): Buffer {
  const header = Buffer.alloc(6);
  header.writeUInt32BE(streamId & 0x7fffffff, 0);
  header.writeUInt16BE(((type & 0x3f) << 10) | (flags & 0x3ff), 4);
  return header;
}

function withMetadataLength(metadata: Buffer): Buffer {
  const length = Buffer.alloc(3);
  length.writeUIntBE(metadata.length, 0, 3);
  return Buffer.concat([length, metadata]);
}

export function encodeRequestStream(streamId: number, route: string): Buffer {
  const requestN = Buffer.alloc(4);
  requestN.writeUInt32BE(STREAM_REQUEST_N, 0);
  return Buffer.concat([
    frameHeader(streamId, RsocketType.RequestStream, FLAG_METADATA),
    requestN,
    withMetadataLength(routingMetadata(route)),
  ]);
}

export function encodeFireAndForget(streamId: number, route: string, data = ''): Buffer {
  return Buffer.concat([
    frameHeader(streamId, RsocketType.RequestFireAndForget, FLAG_METADATA),
    withMetadataLength(routingMetadata(route)),
    Buffer.from(data, 'utf8'),
  ]);
}

export function encodeRequestResponse(streamId: number, route: string, data = ''): Buffer {
  return Buffer.concat([
    frameHeader(streamId, RsocketType.RequestResponse, FLAG_METADATA),
    withMetadataLength(routingMetadata(route)),
    Buffer.from(data, 'utf8'),
  ]);
}

export function encodePayload(streamId: number, data = '', complete = false): Buffer {
  return Buffer.concat([
    frameHeader(
      streamId,
      RsocketType.Payload,
      FLAG_NEXT | (complete ? FLAG_COMPLETE : 0),
    ),
    Buffer.from(data, 'utf8'),
  ]);
}

export function encodeKeepalive(respond: boolean): Buffer {
  return Buffer.concat([
    frameHeader(0, RsocketType.Keepalive, respond ? FLAG_RESPOND : 0),
    Buffer.alloc(8),
  ]);
}

export function encodeCancel(streamId: number): Buffer {
  return Buffer.concat([frameHeader(streamId, RsocketType.Cancel, 0)]);
}

export type DecodedFrame =
  | { kind: 'setup' }
  | { kind: 'keepalive'; respond: boolean }
  | { kind: 'payload'; streamId: number; data: string; complete: boolean }
  | { kind: 'request'; streamId: number; route: string | null; data: string }
  | { kind: 'error'; streamId: number; data: string }
  | { kind: 'cancel'; streamId: number }
  | { kind: 'unknown'; streamId: number; type: number };

function readRoute(metadata: Buffer): string | null {
  if (metadata.length < 5 || metadata[0] !== ROUTING_MIME_ID) return null;
  const entryLength = metadata.readUIntBE(1, 3);
  if (metadata.length < 4 + entryLength) return null;
  const routeLength: number = metadata[4] ?? 0;
  const route = metadata.subarray(5, 5 + routeLength);
  if (route.length !== routeLength) return null;
  return route.toString('utf8');
}

function splitMetadata(body: Buffer): { route: string | null; data: string } {
  if (body.length < 3) return { route: null, data: '' };
  const length = body.readUIntBE(0, 3);
  const metadata = body.subarray(3, 3 + length);
  return { route: readRoute(metadata), data: body.subarray(3 + length).toString('utf8') };
}

export function decodeFrame(buffer: Buffer): DecodedFrame {
  if (buffer.length < 6) throw new Error('Truncated RSocket frame.');
  const streamId = buffer.readUInt32BE(0) & 0x7fffffff;
  const typeAndFlags = buffer.readUInt16BE(4);
  const type = (typeAndFlags >> 10) & 0x3f;
  const flags = typeAndFlags & 0x3ff;
  const body = buffer.subarray(6);
  switch (type) {
    case RsocketType.Setup:
      return { kind: 'setup' };
    case RsocketType.Keepalive:
      return { kind: 'keepalive', respond: (flags & FLAG_RESPOND) !== 0 };
    case RsocketType.Payload: {
      if (flags & FLAG_METADATA) {
        const { data } = splitMetadata(body);
        return {
          kind: 'payload',
          streamId,
          data,
          complete: (flags & FLAG_COMPLETE) !== 0,
        };
      }
      return {
        kind: 'payload',
        streamId,
        data: body.toString('utf8'),
        complete: (flags & FLAG_COMPLETE) !== 0,
      };
    }
    case RsocketType.RequestResponse:
    case RsocketType.RequestFireAndForget:
    case RsocketType.RequestStream: {
      if (!(flags & FLAG_METADATA)) return { kind: 'request', streamId, route: null, data: body.toString('utf8') };
      const offset = type === RsocketType.RequestStream ? 4 : 0;
      const { route, data } = splitMetadata(body.subarray(offset));
      return { kind: 'request', streamId, route, data };
    }
    case RsocketType.Error:
      return { kind: 'error', streamId, data: body.toString('utf8') };
    case RsocketType.Cancel:
      return { kind: 'cancel', streamId };
    default:
      return { kind: 'unknown', streamId, type };
  }
}

export function eventsRoute(gameId: string): string {
  return `games.${gameId}.events`;
}

export function movesRoute(gameId: string): string {
  return `games.${gameId}.moves`;
}

export function acknowledgmentsRoute(gameId: string): string {
  return `games.${gameId}.acknowledgments`;
}
