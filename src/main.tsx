import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { ErrorBoundary } from './components/ErrorBoundary.tsx';

// Global early error handler to prevent mystery blank page
window.addEventListener('error', (event) => {
  console.error('[Global Window Error]:', event.error || event.message);
  const root = document.getElementById('root');
  if (root && root.children.length === 0) {
    root.innerHTML = `
      <div style="min-height:100vh;display:flex;align-items:center;justify-content:center;background:#09090b;color:#f4f4f5;font-family:system-ui,sans-serif;padding:24px;">
        <div style="max-width:480px;background:#18181b;border:1px solid #27272a;border-radius:16px;padding:24px;box-shadow:0 20px 25px -5px rgba(0,0,0,0.5);">
          <h2 style="margin:0 0 8px 0;font-size:18px;font-weight:700;color:#ef4444;">Startup Error</h2>
          <p style="margin:0 0 16px 0;font-size:13px;color:#a1a1aa;">The application encountered an error while booting:</p>
          <pre style="background:#09090b;padding:12px;border-radius:8px;font-size:12px;color:#fca5a5;overflow-x:auto;white-space:pre-wrap;margin:0 0 16px 0;">${event.message || 'Unknown startup error'}</pre>
          <button onclick="window.location.reload()" style="background:#fff;color:#000;border:none;padding:8px 16px;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer;">Reload Application</button>
        </div>
      </div>
    `;
  }
});

window.addEventListener('unhandledrejection', (event) => {
  console.warn('[Global Unhandled Rejection]:', event.reason);
});

const rootElement = document.getElementById('root');
if (rootElement) {
  try {
    const root = createRoot(rootElement);
    root.render(
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    );
  } catch (err) {
    console.error('[Bootstrap Error]: Failed to create React root:', err);
  }
} else {
  console.error('[Bootstrap Error]: Could not find DOM element with id "root".');
}
