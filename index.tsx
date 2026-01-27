import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

// Simple error handler
window.addEventListener('error', (event) => {
  console.error('Global error:', event.error);
});

window.addEventListener('unhandledrejection', (event) => {
  console.error('Unhandled promise rejection:', event.reason);
});

const root = ReactDOM.createRoot(rootElement);

try {
  root.render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
} catch (error) {
  console.error('Failed to render app:', error);
  rootElement.innerHTML = `
    <div style="height: 100vh; width: 100vw; background: #0f172a; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 24px; text-align: center; color: #f1f5f9;">
      <h1 style="font-size: 24px; font-weight: bold; margin-bottom: 16px; color: #f87171;">Something went wrong</h1>
      <pre style="font-size: 14px; color: #94a3b8; max-width: 800px; overflow: auto; padding: 16px; background: #1e293b; border-radius: 8px;">
        ${error instanceof Error ? error.toString() : String(error)}
      </pre>
      <button onclick="window.location.reload()" style="margin-top: 16px; padding: 8px 16px; background: #4f46e5; color: white; border: none; border-radius: 4px; cursor: pointer;">
        Reload Page
      </button>
    </div>
  `;
}