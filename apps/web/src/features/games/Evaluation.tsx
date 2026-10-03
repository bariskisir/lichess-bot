import type { EvaluationView, Color } from '../../../../../packages/contracts/src/index.js';
import './evaluation.scss';

export function Evaluation({
  evaluation,
  fen,
  orientation,
  result = null,
}: {
  evaluation: EvaluationView | null;
  fen: string;
  orientation: Color;
  result?: Color | 'draw' | null;
}) {
  const score = evaluation?.score ?? 0;
  const percent = result
    ? result === 'draw'
      ? 50
      : result === 'white'
        ? 100
        : 0
    : evaluation?.mate !== null && evaluation?.mate !== undefined
      ? evaluation.mate > 0
        ? 100
        : 0
      : Math.max(2, Math.min(98, 50 + 45 * Math.tanh(score / 4)));
  const label = result
    ? result === 'draw'
      ? '½–½'
      : 'M0'
    : !evaluation
      ? '—'
      : evaluation.mate !== null
        ? `${evaluation.mate < 0 ? '−' : ''}M${Math.abs(evaluation.mate)}`
        : `${score > 0 ? '+' : ''}${score.toFixed(2)}`;
  const fresh = !!result || evaluation?.fen === fen;
  return (
    <div
      className={`evaluation ${orientation === 'black' ? 'evaluation--reversed' : ''} ${fresh ? '' : 'evaluation--stale'}`}
      data-evaluation={label}
      title={
        result
          ? `Game result: ${label}`
          : evaluation
            ? `White perspective: ${label} · depth ${evaluation.depth}${fresh ? '' : ' · different position'}`
            : 'Waiting for engine evaluation'
      }
    >
      <progress
        className="evaluation__bar"
        value={percent}
        max={100}
        aria-label={`White advantage: ${label}`}
      />
    </div>
  );
}
