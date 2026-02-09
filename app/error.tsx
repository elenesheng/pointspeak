'use client';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div style={{ padding: 40, background: '#0f172a', color: 'white', minHeight: '100vh', fontFamily: 'monospace' }}>
      <h1 style={{ color: '#f87171', fontSize: 24 }}>App Crashed</h1>
      <pre style={{ color: '#fbbf24', whiteSpace: 'pre-wrap', wordBreak: 'break-all', marginTop: 20, fontSize: 14 }}>
        {error.message}
      </pre>
      <pre style={{ color: '#94a3b8', whiteSpace: 'pre-wrap', wordBreak: 'break-all', marginTop: 10, fontSize: 12 }}>
        {error.stack}
      </pre>
      <button
        onClick={() => {
          localStorage.clear();
          reset();
        }}
        style={{ marginTop: 20, padding: '12px 24px', background: '#6366f1', color: 'white', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 14 }}
      >
        Clear Cache & Retry
      </button>
    </div>
  );
}
