/**
 * Chess.com TCN (compact move) codec.
 *
 * Reverse-engineered from the web client's chess library
 * (`encodeTCN`/`decodeTCN` in the play bundle, verified against
 * `har/www.chess.com.har` live and archive vectors).
 *
 * Each move is two characters. Each character addresses one of 64 squares
 * (`file + rank * 8`) through the shared alphabet. Promotions repurpose the
 * second character (`> 63`); Crazyhouse/Bughouse drops repurpose the first
 * (`> 75`).
 */
export const TCN_ALPHABET =
  'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!?{~}(^)[_]@#$,./&-*++=';

const PROMOTION_PIECES = 'qnrbkp';

export interface TcnMove {
  from?: string;
  to: string;
  promotion?: string;
  drop?: string;
}

function squareName(index: number): string {
  return `${TCN_ALPHABET[index % 8]}${Math.floor(index / 8) + 1}`;
}

export function decodeTCN(tcn: string): TcnMove[] {
  const moves: TcnMove[] = [];
  for (let offset = 0; offset < tcn.length; offset += 2) {
    const move: TcnMove = { to: '' };
    let from = TCN_ALPHABET.indexOf(tcn[offset]!);
    let to = TCN_ALPHABET.indexOf(tcn[offset + 1]!);
    if (from < 0 || to < 0 || Number.isNaN(from) || Number.isNaN(to))
      throw new Error('Invalid chess.com move encoding.');
    if (to > 63) {
      move.promotion = PROMOTION_PIECES[Math.floor((to - 64) / 3)];
      to = from + (from < 16 ? -8 : 8) + ((to - 1) % 3) - 1;
    }
    if (from > 75) move.drop = PROMOTION_PIECES[from - 79];
    else move.from = squareName(from);
    move.to = squareName(to);
    moves.push(move);
  }
  return moves;
}

function squareIndex(square: string): number {
  if (!/^[a-h][1-8]$/.test(square)) throw new Error('Invalid chess.com move.');
  return TCN_ALPHABET.indexOf(square[0]!) + (Number(square.slice(1)) - 1) * 8;
}

export function encodeTCN(moves: TcnMove | TcnMove[]): string {
  const list = Array.isArray(moves) ? moves : [moves];
  let encoded = '';
  for (const move of list) {
    const from = move.drop
      ? 79 + PROMOTION_PIECES.indexOf(move.drop)
      : squareIndex(move.from!);
    if (move.drop && PROMOTION_PIECES.indexOf(move.drop) < 0) throw new Error('Invalid chess.com move.');
    let to = squareIndex(move.to);
    if (move.promotion) {
      if (PROMOTION_PIECES.indexOf(move.promotion) < 0) throw new Error('Invalid chess.com move.');
      to = PROMOTION_PIECES.indexOf(move.promotion) * 3 + 64 + (to < from ? 9 + to - from : to - from - 7);
    }
    const fromChar = TCN_ALPHABET[from];
    const toChar = TCN_ALPHABET[to];
    if (fromChar === undefined || toChar === undefined) throw new Error('Invalid chess.com move.');
    encoded += fromChar + toChar;
  }
  return encoded;
}

export function tcnToUci(move: TcnMove): string {
  if (move.drop) throw new Error('Drops are not supported in standard chess.');
  return `${move.from}${move.to}${move.promotion ?? ''}`;
}
