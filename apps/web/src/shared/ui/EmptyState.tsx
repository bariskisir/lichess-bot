import type { ReactNode } from 'react';
import { ChessKnight } from 'lucide-react';
import './empty-state.scss';

export function EmptyState({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children?: ReactNode;
}) {
  return (
    <div className="empty-state">
      <ChessKnight className="empty-state__piece" aria-hidden="true" />
      <h2>{title}</h2>
      <p>{description}</p>
      {children && <div className="empty-state__actions">{children}</div>}
    </div>
  );
}
