import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertOctagon, RotateCw } from 'lucide-react';

interface Props {
  children: ReactNode;
  fallbackTitle?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('MFE Remote Boundary Caught Error:', error, errorInfo);
  }

  private handleRetry = () => {
    this.setState({ hasError: false, error: null });
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div 
          className="glass-panel p-6 flex flex-col items-center justify-center text-center gap-4" 
          style={{ minHeight: '300px', borderColor: 'rgba(244, 63, 94, 0.4)', background: 'rgba(244, 63, 94, 0.05)' }}
        >
          <div style={{ background: 'rgba(244, 63, 94, 0.15)', padding: '12px', borderRadius: '50%', color: 'var(--accent-danger)' }}>
            <AlertOctagon size={32} />
          </div>
          <div>
            <h3 style={{ fontSize: '1.05rem', fontWeight: 700, color: 'var(--text-primary)' }}>
              {this.props.fallbackTitle || 'Remote Micro-Frontend Isolated'}
            </h3>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', maxWidth: '400px', marginTop: '4px' }}>
              This remote experienced an isolated runtime failure. Adjacent micro-frontends remain fully operational via snapshot caches.
            </p>
          </div>

          <button 
            onClick={this.handleRetry}
            className="btn-secondary"
            style={{ fontSize: '0.8rem', gap: '6px' }}
          >
            <RotateCw size={14} /> Reload Isolated Module
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
