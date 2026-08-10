import { Component, ErrorInfo, ReactNode } from "react";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("ErrorBoundary caught an error:", error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      return this.props.fallback ?? (
        <div style={{
          padding: "40px",
          textAlign: "center",
          color: "#666",
        }}>
          <h2>Editor Error</h2>
          <p>An unexpected error occurred. Please reload the app and try again.</p>
          <p style={{ fontSize: "12px", color: "#999", marginTop: "20px" }}>
            Error: {this.state.error?.message}
          </p>
        </div>
      );
    }

    return this.props.children;
  }
}
