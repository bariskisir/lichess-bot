import type {
  LichessGateway,
  RemoteAccount,
  RemoteGame,
  GameSnapshot,
  GameChannel,
} from '../../domain/lichess/gateway.js';
import { AuthenticationError } from '../../domain/lichess/gateway.js';
import { accountSchema, normalizeSnapshot, playingSchema } from './protocol.js';
import { LichessHttp } from './lichess-http.js';
import { LichessChannel } from './lichess-channel.js';
import { DEFAULT_TRANSPORT, type LichessTransportOptions } from './transport-options.js';
import { LichessRetry } from './lichess-retry.js';

export class WebLichessGateway implements LichessGateway {
  private readonly http: LichessHttp;
  private readonly retry: LichessRetry;
  constructor(
    private readonly cookie: string,
    private readonly options: LichessTransportOptions = DEFAULT_TRANSPORT,
  ) {
    this.retry = new LichessRetry(options.retry);
    this.http = new LichessHttp(cookie, fetch, options, this.retry);
  }
  async authenticate(signal: AbortSignal): Promise<RemoteAccount> {
    const id = await this.http.identity(signal);
    const account = accountSchema.parse(
      await this.http.json(`/api/user/${encodeURIComponent(id)}`, signal),
    );
    if (account.id !== id)
      throw new AuthenticationError('The account identity did not match the session.');
    return account;
  }
  async playing(signal: AbortSignal): Promise<RemoteGame[]> {
    return playingSchema
      .parse(await this.http.json('/account/now-playing?nb=100', signal))
      .nowPlaying.filter((game) => game.speed !== 'correspondence');
  }
  async snapshot(fullId: string, signal: AbortSignal): Promise<GameSnapshot> {
    return normalizeSnapshot(await this.http.json(`/${fullId}`, signal));
  }
  createChannel(): GameChannel {
    return new LichessChannel(this.cookie, this.options, this.retry);
  }
}
