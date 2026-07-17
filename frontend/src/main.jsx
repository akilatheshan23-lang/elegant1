import React, { StrictMode, Component } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App.jsx';

class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error("ErrorBoundary caught an error:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: '3rem', color: '#f8fafc', background: '#0a0f1d', minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', fontFamily: 'sans-serif' }}>
          <div style={{ padding: '2rem', background: '#131b2e', border: '1px solid #ef4444', borderRadius: '12px', maxWidth: '600px', width: '100%', textAlign: 'center', boxShadow: '0 10px 30px rgba(0,0,0,0.5)' }}>
            <h1 style={{ color: '#ef4444', marginBottom: '1rem', fontSize: '1.75rem' }}>Application Crash Detected</h1>
            <p style={{ color: '#94a3b8', marginBottom: '1.25rem', fontSize: '0.95rem' }}>The React dashboard crashed during rendering. Please see the error detail below:</p>
            <pre style={{ padding: '1.25rem', background: '#0a0f1d', border: '1px solid #253554', borderRadius: '8px', color: '#f43f5e', overflowX: 'auto', textAlign: 'left', whiteSpace: 'pre-wrap', fontSize: '0.9rem', lineHeight: '1.5', fontFamily: 'monospace' }}>
              {this.state.error ? this.state.error.toString() : 'Unknown Error'}
            </pre>
            <button style={{ marginTop: '1.5rem', background: '#0084ff', border: 'none', color: '#fff', padding: '0.75rem 1.5rem', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', transition: 'background 0.2s' }} onClick={() => window.location.reload()}>
              Reload Dashboard
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
);
