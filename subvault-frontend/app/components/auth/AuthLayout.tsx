'use client';

export function AuthLayout({ children, title, subtitle }: { children: React.ReactNode, title: string, subtitle: string }) {
  return (
    <div
      style={{
        minHeight: '100vh',
        background: '#FAFAF8',
        color: '#000',
        fontFamily: "'Libre Baskerville', serif",
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px',
      }}
    >
      <link
        href="https://fonts.googleapis.com/css2?family=Libre+Baskerville:ital,wght@0,400;0,700;1,400&family=IBM+Plex+Mono:wght@300;400;500;600&family=Outfit:wght@300;400;500;600;700&display=swap"
        rel="stylesheet"
      />
      <style>{`
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes slideUp { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }

        .auth-input {
          width: 100%;
          padding: 14px 0;
          border: none;
          border-bottom: 1px solid #ccc;
          font-size: 15px;
          font-family: 'Libre Baskerville', serif;
          outline: none;
          background: none;
          color: #000;
          transition: border-color 0.3s ease;
          letter-spacing: 0.3px;
        }
        .auth-input:focus { border-bottom-color: #000; }
        .auth-input::placeholder { color: #aaa; }

        .auth-btn {
          position: relative; overflow: hidden;
          font-family: 'IBM Plex Mono', monospace; font-size: 10px;
          letter-spacing: 2px; text-transform: uppercase;
          cursor: pointer; transition: all 0.5s ease;
        }
        .auth-btn::before {
          content: ""; position: absolute; top: 0; left: 0;
          width: 100%; height: 100%;
          transition: transform 0.5s ease;
          transform: scaleX(0); transform-origin: right;
        }
        .auth-btn:hover::before {
          transform: scaleX(1); transform-origin: left;
        }
        .auth-btn span { position: relative; z-index: 1; }
        .auth-btn-filled {
          border: 1px solid #000; background: #000; color: #fff;
        }
        .auth-btn-filled:hover {
          transform: translateY(-2px);
          box-shadow: 0 4px 12px rgba(0,0,0,0.25);
        }
        .auth-btn-filled::before { background: #222; }
        .auth-btn-filled:disabled {
          opacity: 0.5; cursor: not-allowed;
          transform: none !important; box-shadow: none !important;
        }
        .auth-btn-filled:disabled::before { display: none; }
        .auth-btn-outline {
          border: 1px solid #ccc; background: #fff; color: #000;
        }
        .auth-btn-outline::before { background: #000; }
        .auth-btn-outline:hover { border-color: #000; color: #fff; }
      `}</style>

      <div
        style={{
          width: '100%',
          maxWidth: 480,
          background: '#fff',
          border: '1px solid #000',
          padding: '48px 44px',
          animation: 'slideUp 0.6s cubic-bezier(0.16,1,0.3,1)',
        }}
      >
        <div style={{ textAlign: 'center', marginBottom: 36 }}>
          <h1
            style={{
              fontFamily: "'Outfit', sans-serif",
              fontSize: 28,
              fontWeight: 700,
              letterSpacing: '-1px',
              margin: 0,
              marginBottom: 6,
            }}
          >
            {title}
          </h1>
          {subtitle && (
            <p
              style={{
                fontFamily: "'IBM Plex Mono', monospace",
                fontSize: 11,
                letterSpacing: 2,
                textTransform: 'uppercase',
                color: '#444',
                margin: 0,
              }}
            >
              {subtitle}
            </p>
          )}
        </div>

        {children}
      </div>
    </div>
  );
}
