import { z } from 'zod';

export const DEFAULT_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/154.0.0.0 Safari/537.36';

export interface EngineOption {
  id: string;
  name: string;
  elo?: number;
}

export const SUPPORTED_POOLS = [
  '1+0',
  '2+1',
  '3+0',
  '3+2',
  '5+0',
  '5+3',
  '10+0',
  '10+5',
  '15+10',
  '30+0',
  '30+20',
] as const;

export const providerSchema = z.enum(['lichess', 'chesscom']);
export type Provider = z.infer<typeof providerSchema>;

export const DEFAULT_POOLS = ['1+0', '2+1', '3+0', '3+2', '5+0', '5+3'] as const;

export const settingsSchema = z.object({
  engineId: z
    .string()
    .min(1)
    .max(100)
    .regex(/^[a-z\d-]+$/)
    .default('lozza-2-local')
    .transform((id) =>
      ['stockfish-17-lite-local', 'stockfish-18-lite-local'].includes(id) ? 'lozza-2-local' : id,
    ),
  userAgent: z
    .string()
    .min(1)
    .max(512)
    .regex(/^[^\r\n]+$/)
    .default(DEFAULT_USER_AGENT),
  dashboardPort: z.number().int().min(1024).max(65535).default(4173),
  autoStart: z.boolean().default(false),
  requestAttempts: z.number().int().min(1).max(10).default(3),
  requestDelayMs: z.number().int().min(100).max(60_000).default(1000),
  logLevel: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal', 'silent']).default('info'),
  gameTypes: z
    .array(z.enum(SUPPORTED_POOLS))
    .min(1)
    .refine((values) => new Set(values).size === values.length, 'Select each time control once.')
    .default([...DEFAULT_POOLS]),
  chesscomGameTypes: z
    .array(z.enum(SUPPORTED_POOLS))
    .min(1)
    .refine((values) => new Set(values).size === values.length, 'Select each time control once.')
    .default([...DEFAULT_POOLS]),
  totalMatches: z.number().int().min(1).max(1_000_000).default(100),
  maxConcurrentGames: z.number().int().min(1).max(100).default(4),
  maxEngines: z.number().int().min(1).max(32).default(3),
  depth: z.number().int().min(1).max(40).default(7),
  evaluationDepth: z.number().int().min(1).max(40).default(15),
  hashMb: z.number().int().min(16).max(512).default(64),
  movePolicy: z.enum(['best', 'balanced']).default('balanced'),
  variations: z.number().int().min(2).max(10).default(10),
  mistakeProbability: z.number().min(0).max(100).default(25),
  mistakeKeep: z.number().min(0).max(5).default(2),
  dynamicDelay: z.boolean().default(true),
  randomDelayMaxMs: z.number().int().min(0).max(10_000).default(1000),
  drawManagedAccounts: z.boolean().default(true),
  claimVictory: z.boolean().default(true),
  historyLimit: z.number().int().min(10).max(1000).default(200),
});

export type BotSettings = z.infer<typeof settingsSchema>;
export const DEFAULT_SETTINGS: BotSettings = settingsSchema.parse({});

function refineAccountCookie(value: { provider: Provider; cookie: string }, context: z.RefinementCtx) {
  if (/[\r\n]/.test(value.cookie)) {
    context.addIssue({
      code: 'custom',
      path: ['cookie'],
      message: 'Enter only the session value.',
    });
    return;
  }
  if (value.provider === 'lichess') {
    const normalized = value.cookie.startsWith('lila2=') ? value.cookie : `lila2=${value.cookie}`;
    if (!/^lila2=[^\s;\r\n]+$/.test(normalized)) {
      context.addIssue({
        code: 'custom',
        path: ['cookie'],
        message: 'Enter only the lila2 session value.',
      });
    }
  } else if (value.provider === 'chesscom') {
    if (/^lila2=[^\s;]+$/.test(value.cookie)) {
      context.addIssue({
        code: 'custom',
        path: ['cookie'],
        message: 'Paste the chess.com Cookie header value or the PHPSESSID value.',
      });
    } else if (!/=/.test(value.cookie)) {
      if (!/^[^\s;\r\n]+$/.test(value.cookie)) {
        context.addIssue({
          code: 'custom',
          path: ['cookie'],
          message: 'Paste the chess.com Cookie header value or the PHPSESSID value.',
        });
      }
    }
  }
}

function normalizeAccountCookie<T extends { provider: Provider; cookie: string }>(value: T): T {
  if (value.provider === 'lichess' && !value.cookie.startsWith('lila2='))
    return { ...value, cookie: `lila2=${value.cookie}` };
  if (value.provider === 'chesscom' && !value.cookie.includes('='))
    return { ...value, cookie: `PHPSESSID=${value.cookie}` };
  return value;
}

const accountFields = {
  label: z.string().trim().min(1).max(60),
  provider: providerSchema.default('lichess'),
  cookie: z.string().trim().min(8).max(8192),
};

export const accountInputSchema = z
  .object(accountFields)
  .superRefine(refineAccountCookie)
  .transform(normalizeAccountCookie);
export const accountSecretSchema = z
  .object({ ...accountFields, id: z.uuid() })
  .superRefine(refineAccountCookie)
  .transform(normalizeAccountCookie);
export type AccountSecret = z.infer<typeof accountSecretSchema>;
export const configurationSchema = z.object({
  version: z.literal(1),
  settings: settingsSchema,
  accounts: z.array(accountSecretSchema).max(100),
});
export type Configuration = z.infer<typeof configurationSchema>;
