import { SUPPORTED_POOLS } from '../../../../../packages/contracts/src/index.js';

export type ChesscomPool = (typeof SUPPORTED_POOLS)[number];

export interface ChesscomTimeControl {
  base: string;
  increment: string;
  baseMs: number;
  incrementMs: number;
}

export function parsePool(pool: string): { baseMinutes: number; incrementSeconds: number } {
  const match = /^(\d+)\+(\d+)$/.exec(pool);
  if (!match) throw new Error(`Unsupported chess.com pool: ${pool}.`);
  return { baseMinutes: Number(match[1]), incrementSeconds: Number(match[2]) };
}

export function chesscomTimeControl(pool: ChesscomPool): ChesscomTimeControl {
  const { baseMinutes, incrementSeconds } = parsePool(pool);
  return {
    base: `PT${baseMinutes * 60}S`,
    increment: `PT${incrementSeconds}S`,
    baseMs: baseMinutes * 60_000,
    incrementMs: incrementSeconds * 1000,
  };
}

/** ISO-8601 duration used by `POST /service/matcher/seeks/chess`. */
export function seekTimeControl(pool: ChesscomPool): { base: string; increment: string } {
  const { base, increment } = chesscomTimeControl(pool);
  return { base, increment };
}

export function displayPool(baseMs: number, incrementMs: number): string {
  const pool = `${Math.round(baseMs / 60_000)}+${Math.round(incrementMs / 1000)}`;
  return (SUPPORTED_POOLS as readonly string[]).includes(pool) ? pool : pool;
}

export const CHESSCOM_CLIENT = 'LC6;chrome/154.0.0/browser;Windows 10';
