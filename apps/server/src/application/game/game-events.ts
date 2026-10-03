import { z } from 'zod';

export const moveEventSchema = z.object({
  ply: z.number().int(),
  san: z.string(),
  fen: z.string(),
  clock: z.object({ white: z.number(), black: z.number() }).optional(),
});
export const clockEventSchema = z.object({ white: z.number(), black: z.number() });
