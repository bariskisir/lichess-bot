import { describe, expect, it, vi } from 'vitest';
import { gzipSync } from 'node:zlib';
import { WebSocketServer } from 'ws';
import {
  MATCHER_TICKETS_CHANNEL,
  PubsubClient,
  pubsubUrl,
} from '../../../apps/server/src/adapters/chesscom/pubsub.js';
import { parseTicket } from '../../../apps/server/src/adapters/chesscom/web-gateway.js';

const USER_UUID = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const OPP_UUID = 'bbbbbbbb-cccc-4ddd-8eee-ffffffffffff';
const ACCEPTED_TICKET = {
  id: 'f8d70a7b-c51a-11f1-93b2-bbe6f3526765',
  userId: USER_UUID,
  timeControl: { base: 'PT1M', increment: 'PT0S' },
  state: 'accepted',
  type: 'seek',
  color: 'black',
  game: {
    id: 'f99aa8dd-c51a-11f1-91e9-76c88101000f',
    players: [
      OPP_UUID,
      USER_UUID,
    ],
    href: '/service/play-us-2-5/chess/games/f99aa8dd-c51a-11f1-91e9-76c88101000f',
    channel: 'play-us-2-5/games/f99aa8dd-c51a-11f1-91e9-76c88101000f',
    transports: {
      http: { url: '/service/play-us-2-5/chess/games/f99aa8dd-c51a-11f1-91e9-76c88101000f' },
      rsocket: {
        url: '/service/play-us-2-5/rsocket',
        routes: {
          watch: 'games.f99aa8dd-c51a-11f1-91e9-76c88101000f.events',
          move: 'games.f99aa8dd-c51a-11f1-91e9-76c88101000f.moves',
          action: 'games.f99aa8dd-c51a-11f1-91e9-76c88101000f.actions',
          acknowledgement: 'games.f99aa8dd-c51a-11f1-91e9-76c88101000f.acknowledgments',
          ping: 'games.f99aa8dd-c51a-11f1-91e9-76c88101000f.pings',
        },
      },
    },
  },
};

describe('chess.com pubsub match feed', () => {
  it('builds the captured subscription URL', () => {
    const url = new URL(pubsubUrl(USER_UUID));
    expect(url.origin).toBe('wss://www.chess.com');
    expect(url.pathname).toBe('/pubsub');
    expect(url.searchParams.get('uid')).toBe(USER_UUID);
    expect(url.searchParams.get('client_type')).toBe('web');
    expect(url.searchParams.get('client_id')).toMatch(/^[A-Za-z\d]{8}$/);
  });

  it('parses the captured accepted ticket with color, region and routes', () => {
    const ticket = parseTicket(ACCEPTED_TICKET);
    expect(ticket).toMatchObject({
      seekId: 'f8d70a7b-c51a-11f1-93b2-bbe6f3526765',
      state: 'accepted',
      color: 'black',
      game: {
        id: 'f99aa8dd-c51a-11f1-91e9-76c88101000f',
        transport: {
          wsUrl: 'wss://www.chess.com/service/play-us-2-5/rsocket',
          region: 'play-us-2-5',
          routes: {
            watch: 'games.f99aa8dd-c51a-11f1-91e9-76c88101000f.events',
            move: 'games.f99aa8dd-c51a-11f1-91e9-76c88101000f.moves',
            acknowledgement: 'games.f99aa8dd-c51a-11f1-91e9-76c88101000f.acknowledgments',
          },
        },
      },
    });
    expect(parseTicket({ id: 'x', state: 'active', color: 'random' })).toMatchObject({
      color: null,
      game: null,
    });
    expect(parseTicket({ nope: true })).toBeNull();
  });

  it('handshakes, subscribes and gunzips ticket pushes like the HAR capture', async () => {
    const server = new WebSocketServer({ port: 0 });
    const seen: string[] = [];
    let ticketResolve!: (ticket: unknown) => void;
    const ticket = new Promise<unknown>((resolve) => {
      ticketResolve = resolve;
    });
    await new Promise<void>((resolve) => server.on('listening', resolve));
    const port = (server.address() as { port: number }).port;
    server.on('connection', (socket) => {
      socket.on('message', (raw) => {
        const text = String(raw);
        seen.push(text);
        if (text.startsWith('41[')) {
          const subId = 13;
          socket.send(`45[${subId},"${MATCHER_TICKETS_CHANNEL}","tok-0"]`);
        } else if (text.startsWith('43[13]')) {
          const payload = gzipSync(JSON.stringify(ACCEPTED_TICKET)).toString('base64');
          socket.send(`47[13,"${MATCHER_TICKETS_CHANNEL}","msgid-0","${payload}",1]`);
        }
      });
      socket.send('0["AhYAw8kYp",20,45,{"subscribeRetryTimeoutMs":34001}]');
    });
    const client = new PubsubClient('session=x', 'user-uuid');
    const controller = new AbortController();
    try {
      await client.connect(controller.signal, `ws://127.0.0.1:${port}/pubsub`);
      client.subscribe(MATCHER_TICKETS_CHANNEL, (data) => ticketResolve(data));
      await vi.waitFor(() => expect(seen.some((text) => text.startsWith('41['))).toBe(true));
      const received = await ticket;
      expect(parseTicket(received)).toMatchObject({ state: 'accepted', color: 'black' });
      expect(seen).toContain('0["AhYAw8kYp",20,45]');
      expect(seen).toContain('43[13]');
    } finally {
      controller.abort();
      client.close();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
});
