
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { ErrorBoundary } from 'react-error-boundary';
import './index.css';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

function ErrorFallback({ error }: { error: Error }) {
  return (
    <div role="alert" style={{ padding: '20px', backgroundColor: '#fdecec', color: '#f05252' }}>
      <h2 style={{ fontSize: '1.5rem', fontWeight: 'bold' }}>Something went wrong:</h2>
      <pre style={{ color: 'red', whiteSpace: 'pre-wrap' }}>{error.message}</pre>
    </div>
  );
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <ErrorBoundary FallbackComponent={ErrorFallback}>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
);
