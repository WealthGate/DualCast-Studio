import React from "react";

type ErrorBoundaryState = {
  error: Error | null;
};

class ErrorBoundary extends React.Component<React.PropsWithChildren, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  render() {
    if (!this.state.error) {
      return this.props.children;
    }

    return (
      <main className="fatal-error" role="alert">
        <div className="fatal-error-card">
          <div className="brand-dot" />
          <h1>OpenChurch needs to reload</h1>
          <p>The studio stopped this view safely instead of showing a blank window.</p>
          <pre>{this.state.error.message || "Unexpected interface error"}</pre>
          <button className="btn btn-primary" onClick={() => window.location.reload()}>Reload Studio</button>
        </div>
      </main>
    );
  }
}

export default ErrorBoundary;
