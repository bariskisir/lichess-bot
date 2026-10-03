import { Component, type ReactNode } from 'react';
import { Button } from '../shared/ui/Button.js';

export class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  override state = { failed: false };
  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }
  override render(): ReactNode {
    if (this.state.failed)
      return (
        <main className="error-boundary">
          <h1>The dashboard could not render</h1>
          <p>The server keeps running. Reload the page to restore the dashboard.</p>
          <Button variant="primary" onClick={() => location.reload()}>
            Reload dashboard
          </Button>
        </main>
      );
    return this.props.children;
  }
}
