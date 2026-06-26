'use client';

// Global error boundary for React rendering errors (App Router).
// Required for Sentry to capture errors that occur during rendering.
// See: https://nextjs.org/docs/app/building-your-application/routing/error-handling

import * as Sentry from '@sentry/nextjs';
import { useEffect } from 'react';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html>
      <body
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: '100vh',
          fontFamily: 'Arial, sans-serif',
          backgroundColor: '#f9fafb',
          color: '#1a1a2e',
          gap: '16px',
        }}
      >
        <h2 style={{ fontSize: '1.5rem', fontWeight: 700 }}>Something went wrong</h2>
        <p style={{ color: '#6b7280', fontSize: '0.95rem' }}>
          An unexpected error occurred. Our team has been notified.
        </p>
        <button
          onClick={reset}
          style={{
            padding: '10px 24px',
            backgroundColor: '#25A244',
            color: '#fff',
            border: 'none',
            borderRadius: '6px',
            cursor: 'pointer',
            fontSize: '0.95rem',
            fontWeight: 600,
          }}
        >
          Try again
        </button>
      </body>
    </html>
  );
}
