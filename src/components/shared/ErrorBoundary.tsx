import { Component, ErrorInfo, ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { AlertTriangle, RotateCcw } from 'lucide-react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  /** Optional context label shown in console for easier debugging */
  context?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

/**
 * App-wide error boundary. Catches render-time errors so a single broken
 * component doesn't blank the entire app. Provides a recover action that
 * resets local state; users can also click reload as a fallback.
 *
 * Note: ErrorBoundary does NOT catch async errors, event-handler errors,
 * or errors thrown in effects after commit — those still surface via
 * console / unhandled rejections.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Surface for debugging; in production this would route to a monitor.
    // eslint-disable-next-line no-console
    console.error(
      `[ErrorBoundary${this.props.context ? ` · ${this.props.context}` : ''}]`,
      error,
      info.componentStack
    );
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  handleReload = () => {
    window.location.reload();
  };

  render() {
    if (!this.state.hasError) return this.props.children;
    if (this.props.fallback) return this.props.fallback;

    return (
      <div className="min-h-[60vh] flex items-center justify-center p-6">
        <div className="max-w-md w-full text-center space-y-4">
          <div className="mx-auto w-12 h-12 rounded-full bg-destructive/10 flex items-center justify-center">
            <AlertTriangle className="h-6 w-6 text-destructive" />
          </div>
          <div className="space-y-1">
            <h2 className="text-lg font-semibold text-foreground">
              Something went wrong
            </h2>
            <p className="text-sm text-muted-foreground">
              An unexpected error occurred while rendering this view. You can
              try again, or reload the page if the problem persists.
            </p>
            {this.state.error?.message && (
              <p className="text-xs text-muted-foreground/80 mt-2 font-mono break-all">
                {this.state.error.message}
              </p>
            )}
          </div>
          <div className="flex gap-2 justify-center">
            <Button variant="outline" size="sm" onClick={this.handleReset}>
              <RotateCcw className="h-4 w-4 mr-1.5" /> Try again
            </Button>
            <Button size="sm" onClick={this.handleReload}>
              Reload page
            </Button>
          </div>
        </div>
      </div>
    );
  }
}
