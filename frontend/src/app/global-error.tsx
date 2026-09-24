'use client';

import * as React from 'react';

/**
 * Root error boundary. Overrides the default so a crash in the root layout
 * (providers, fonts, wagmi/RainbowKit init) still renders a recoverable screen
 * rather than Next's blank default. Must supply its own <html>/<body>.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  React.useEffect(() => {
    console.error('[ProtoRWA] global error:', error);
  }, [error]);

  return (
    <html lang="en">
      <body style={{ margin: 0, background: '#0e1418', color: '#e6e9ef', font: '16px/1.5 system-ui, sans-serif' }}>
        <main style={{ maxWidth: 560, margin: '0 auto', padding: '96px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>
          <h1 style={{ fontSize: 22, fontWeight: 600, margin: 0 }}>The app hit an unexpected error</h1>
          <p style={{ margin: 0, opacity: 0.8 }}>
            Something failed while booting the interface. Reloading usually clears it.
          </p>
          <div>
            <button
              type="button"
              onClick={() => reset()}
              style={{
                cursor: 'pointer',
                border: 0,
                borderRadius: 8,
                padding: '10px 18px',
                fontWeight: 600,
                background: '#4f6ef7',
                color: '#fff',
              }}
            >
              Reload
            </button>
          </div>
          {error.digest ? (
            <p style={{ fontFamily: 'monospace', fontSize: 12, opacity: 0.5 }}>Reference: {error.digest}</p>
          ) : null}
        </main>
      </body>
    </html>
  );
}
