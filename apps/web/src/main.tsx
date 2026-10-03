import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app/App.js';
import { ErrorBoundary } from './app/ErrorBoundary.js';
import { AuthenticationGate } from './features/auth/AuthenticationGate.js';
import { applyTheme, readTheme } from './features/theme/use-theme.js';
import './styles/global.scss';

applyTheme(readTheme());
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      <AuthenticationGate>
        <App />
      </AuthenticationGate>
    </ErrorBoundary>
  </StrictMode>,
);
