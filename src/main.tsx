import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import { ErrorBoundary } from './components/ErrorBoundary';
import { NotificationProvider } from './components/NotificationContext';
import { LanguageProvider } from './contexts/LanguageContext';
import { OfficeProvider } from './contexts/OfficeContext';
import './index.css';

// The window.fetch override fix is now handled in index.html to catch it as early as possible.

/*
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(err => {
      console.log('ServiceWorker registration failed: ', err);
    });
  });
}
*/

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <NotificationProvider>
        <LanguageProvider>
          <OfficeProvider>
            <App />
          </OfficeProvider>
        </LanguageProvider>
      </NotificationProvider>
    </ErrorBoundary>
  </StrictMode>,
);
