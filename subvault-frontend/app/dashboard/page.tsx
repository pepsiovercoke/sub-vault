'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { ProtectedRoute } from '@/app/components/auth/ProtectedRoute';
import { useAuth } from '@/app/components/auth/useAuth';
import { subscriptions as subsApi, analytics as analyticsApi, gmail as gmailApi } from '@/api-client';
import ImportCSVModal from '@/app/components/ImportCSVModal';
import Link from 'next/link';

const CATEGORIES: Record<string, string> = {
  'AI & Tech': '01',
  'Cloud & Infra': '02',
  'Media & Content': '03',
  'Finance': '04',
  'Productivity': '05',
  'Health': '06',
  'Other': '07',
};
const CAT_LIST = Object.keys(CATEGORIES);
const CURRENCIES = ['USD', 'EUR', 'GBP', 'INR', 'JPY'];
const CYCLES = ['Monthly', 'Quarterly', 'Yearly'];

const fmt = (n: number, c = 'USD') =>
  new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: c,
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(n);
const annualize = (cost: number, cycle: string) => cycle === 'Monthly' ? cost * 12 : cycle === 'Quarterly' ? cost * 4 : cost;
const monthize = (cost: number, cycle: string) => cycle === 'Yearly' ? cost / 12 : cycle === 'Quarterly' ? cost / 3 : cost;

// Fix daysUntil: Parse YY-MM-DD as local date and compute difference cleanly
const daysUntil = (d: string) => {
  if (!d) return 0;
  const [yy, mm, dd] = d.split('-').map(Number);
  const target = new Date(yy, mm - 1, dd, 0, 0, 0, 0); // Local midnight
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
  return Math.round((target.getTime() - today.getTime()) / 864e5);
};

// ─── Custom Select Component ───
const CustomSelect = ({
  value,
  onChange,
  options,
  placeholder
}: {
  value: string;
  onChange: (v: string) => void;
  options: { label: string; value: string }[];
  placeholder?: string;
}) => {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const clickOut = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    if (open) document.addEventListener('mousedown', clickOut);
    return () => document.removeEventListener('mousedown', clickOut);
  }, [open]);

  const selectedIdx = options.findIndex(o => o.value === value);
  const currentLabel = selectedIdx >= 0 ? options[selectedIdx].label : (placeholder || 'Select...');

  return (
    <div ref={ref} style={{ position: 'relative', width: '100%' }}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        style={{
          width: '100%',
          padding: '14px 28px 14px 0',
          border: 'none',
          borderBottom: '1px solid #ccc',
          fontSize: 15,
          fontFamily: "'Libre Baskerville', serif",
          outline: 'none',
          background: 'none',
          color: '#000',
          transition: 'border-color 0.3s ease',
          letterSpacing: '0.3px',
          textAlign: 'left',
          cursor: 'pointer',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}
      >
        {currentLabel}
        <span style={{
          position: 'absolute',
          right: 4,
          top: '50%',
          transform: `translateY(-50%) ${open ? 'rotate(180deg)' : ''}`,
          transition: 'transform 0.2s ease',
          pointerEvents: 'none',
        }}>
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#555" strokeWidth="1.5">
            <path d="M6 9l6 6 6-6" />
          </svg>
        </span>
      </button>

      {open && (
        <div style={{
          position: 'absolute',
          top: 'calc(100% + 4px)',
          left: 0,
          right: 0,
          background: '#fff',
          border: '1px solid #000',
          boxShadow: '0 4px 16px rgba(0,0,0,0.1)',
          zIndex: 100,
          maxHeight: 240,
          overflowY: 'auto',
          animation: 'fadeIn 0.2s ease',
        }}>
          {options.map((opt) => (
            <div
              key={opt.value}
              onClick={() => { onChange(opt.value); setOpen(false); }}
              style={{
                padding: '12px 16px',
                fontSize: 13,
                fontFamily: "'Libre Baskerville', serif",
                cursor: 'pointer',
                background: value === opt.value ? '#f5f5f5' : '#fff',
                color: value === opt.value ? '#000' : '#444',
                transition: 'background 0.2s',
              }}
              onMouseEnter={(e) => {
                if (value !== opt.value) e.currentTarget.style.background = '#fafafa';
              }}
              onMouseLeave={(e) => {
                if (value !== opt.value) e.currentTarget.style.background = '#fff';
              }}
            >
              {opt.label}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

interface Sub {
  id: string | number;
  name: string;
  cost: number;
  currency: string;
  cycle: string;
  category: string;
  status: string;
  next_bill: string;
  notes: string;
  url?: string;
}

const AnimNum = ({ value, prefix = '$' }: { value: number; prefix?: string }) => {
  const [d, setD] = useState(0);
  const ref = useRef<number>(0);
  useEffect(() => {
    const s = d;
    let st: number | null = null;
    const run = (ts: number) => {
      if (!st) st = ts;
      const p = Math.min((ts - st) / 700, 1);
      setD(s + (value - s) * (1 - Math.pow(1 - p, 3)));
      if (p < 1) ref.current = requestAnimationFrame(run);
    };
    ref.current = requestAnimationFrame(run);
    return () => cancelAnimationFrame(ref.current);
  }, [value]);
  return (
    <span>
      <span style={{ fontSize: '1.25em', marginRight: 4 }}>{prefix}</span>
      {Math.round(d).toLocaleString()}
    </span>
  );
};

const HBar = ({ pct, delay = 0 }: { pct: number; delay?: number }) => (
  <div style={{ height: 2, background: '#e8e8e8', width: '100%', overflow: 'hidden' }}>
    <div style={{ height: '100%', background: '#000', width: `${pct}%`, transition: `width 1s cubic-bezier(0.16,1,0.3,1) ${delay}s` }} />
  </div>
);

const Modal = ({ open, onClose, children }: { open: boolean; onClose: () => void; children: React.ReactNode }) => {
  if (!open) return null;
  return (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, background: 'rgba(255,255,255,0.85)', backdropFilter: 'blur(20px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, animation: 'fadeIn 0.3s ease'
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        background: '#fff', border: '1px solid #000', width: 'min(560px, 92vw)',
        maxHeight: '88vh', overflowY: 'auto', padding: '48px 44px',
        animation: 'slideUp 0.4s cubic-bezier(0.16,1,0.3,1)'
      }}>{children}</div>
    </div>
  );
};

function DashboardContent() {
  const { user } = useAuth();
  const [subs, setSubs] = useState<Sub[]>([]);
  const [loading, setLoading] = useState(true);
  const [apiError, setApiError] = useState<string | null>(null);
  const [view, setView] = useState('dashboard');
  const [search, setSearch] = useState('');
  const [filterCat, setFilterCat] = useState('All');
  const [filterStatus, setFilterStatus] = useState('All');
  const [sortBy, setSortBy] = useState('cost-desc');
  const [modalOpen, setModalOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [editSub, setEditSub] = useState<Sub | null>(null);
  const [mounted, setMounted] = useState(false);
  const [form, setForm] = useState({ name: '', cost: '', currency: 'USD', cycle: 'Monthly', category: 'AI & Tech', status: 'active', next_bill: '', notes: '', url: '' });

  // ─── Gmail scan state ───
  const [scanOpen, setScanOpen] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [scanResults, setScanResults] = useState<{ name: string; category: string; cost: number; currency: string; cycle: string; confidence: string; emailCount: number; status: string; next_bill: string }[]>([]);
  const [scanSelected, setScanSelected] = useState<Set<number>>(new Set());
  const [scanError, setScanError] = useState<string | null>(null);

  // ─── Fetch real data from API ───
  const fetchSubs = useCallback(async () => {
    try {
      setLoading(true);
      setApiError(null);
      const response = await subsApi.list({ limit: 100 });
      setSubs(response.subscriptions || []);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to load subscriptions';
      setApiError(msg);
      console.error('Failed to fetch subscriptions:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSubs();
    setTimeout(() => setMounted(true), 50);
  }, [fetchSubs]);

  const openAdd = () => {
    setEditSub(null);
    setForm({ name: '', cost: '', currency: 'USD', cycle: 'Monthly', category: 'AI & Tech', status: 'active', next_bill: '', notes: '', url: '' });
    setModalOpen(true);
  };

  const openEdit = (s: Sub) => {
    setEditSub(s);
    setForm({ name: s.name, cost: String(s.cost), currency: s.currency, cycle: s.cycle, category: s.category, status: s.status, next_bill: s.next_bill || '', notes: s.notes || '', url: s.url || '' });
    setModalOpen(true);
  };

  const save = async () => {
    if (!form.name || !form.cost) return;
    try {
      const payload = {
        name: form.name,
        cost: parseFloat(form.cost),
        currency: form.currency,
        cycle: form.cycle,
        category: form.category,
        status: form.status,
        next_bill: form.next_bill || null,
        notes: form.notes,
        url: form.url,
      };

      if (editSub) {
        await subsApi.update(editSub.id, payload);
      } else {
        await subsApi.create(payload);
      }
      setModalOpen(false);
      fetchSubs();
    } catch (err) {
      console.error('Save error:', err);
    }
  };

  const del = async (id: string | number) => {
    try {
      await subsApi.delete(id);
      fetchSubs();
    } catch (err) {
      console.error('Delete error:', err);
    }
  };

  const toggle = async (id: string | number) => {
    try {
      await subsApi.toggle(id);
      fetchSubs();
    } catch (err) {
      console.error('Toggle error:', err);
    }
  };

  // ─── Gmail scan flow ───
  const startGmailScan = async () => {
    try {
      setScanning(true);
      setScanError(null);
      setScanResults([]);
      setScanSelected(new Set());

      const redirectUri = `${window.location.origin}/gmail/callback`;
      const { url } = await gmailApi.getAuthUrl(redirectUri);

      // Open popup
      const w = 500, h = 600;
      const left = window.screenX + (window.outerWidth - w) / 2;
      const top = window.screenY + (window.outerHeight - h) / 2;
      const popup = window.open(url, 'gmail-auth', `width=${w},height=${h},left=${left},top=${top}`);

      // Listen for the callback
      const handleMessage = async (event: MessageEvent) => {
        if (event.origin !== window.location.origin) return;
        if (event.data?.type !== 'gmail-oauth-callback') return;
        window.removeEventListener('message', handleMessage);

        if (event.data.error) {
          setScanError('Gmail authorization was denied.');
          setScanning(false);
          return;
        }

        if (!event.data.code) {
          setScanError('No authorization code received.');
          setScanning(false);
          return;
        }

        try {
          const result = await gmailApi.scan(event.data.code, redirectUri);
          setScanResults(result.subscriptions || []);
          // Pre-select all high confidence results
          const selected = new Set<number>();
          (result.subscriptions || []).forEach((s: { confidence: string }, i: number) => {
            if (s.confidence === 'high' || s.confidence === 'medium') selected.add(i);
          });
          setScanSelected(selected);
          setScanOpen(true);
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : 'Failed to scan Gmail';
          setScanError(msg);
        } finally {
          setScanning(false);
        }
      };

      window.addEventListener('message', handleMessage);

      // Fallback: if popup is closed without sending a message
      const checkClosed = setInterval(() => {
        if (popup && popup.closed) {
          clearInterval(checkClosed);
          setTimeout(() => {
            if (scanning) {
              setScanning(false);
              if (!scanOpen && scanResults.length === 0) {
                setScanError('Authorization popup was closed.');
              }
            }
          }, 1000);
        }
      }, 500);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to start Gmail scan';
      setScanError(msg);
      setScanning(false);
    }
  };

  const confirmScanResults = async () => {
    const selected = scanResults.filter((_, i) => scanSelected.has(i));
    for (const s of selected) {
      try {
        await subsApi.create({
          name: s.name,
          cost: s.cost,
          currency: s.currency,
          cycle: s.cycle,
          category: s.category,
          status: s.status,
          next_bill: s.next_bill || null,
          notes: `Detected from Gmail (${s.emailCount} emails)`,
          url: '',
        });
      } catch (err) {
        console.error('Failed to add scanned subscription:', err);
      }
    }
    setScanOpen(false);
    setScanResults([]);
    fetchSubs();
  };

  const active = subs.filter(s => s.status === 'active');
  const totalMo = active.reduce((a, s) => a + monthize(s.cost, s.cycle), 0);
  const totalYr = active.reduce((a, s) => a + annualize(s.cost, s.cycle), 0);

  const catBreak = CAT_LIST.map(c => {
    const cs = active.filter(s => s.category === c);
    return { cat: c, idx: CATEGORIES[c], total: cs.reduce((a, s) => a + monthize(s.cost, s.cycle), 0), count: cs.length };
  }).filter(c => c.count > 0).sort((a, b) => b.total - a.total);

  let displayed = [...subs];
  if (search) displayed = displayed.filter(s => s.name.toLowerCase().includes(search.toLowerCase()));
  if (filterCat !== 'All') displayed = displayed.filter(s => s.category === filterCat);
  if (filterStatus !== 'All') displayed = displayed.filter(s => s.status === filterStatus.toLowerCase());
  if (sortBy === 'cost-desc') displayed.sort((a, b) => monthize(b.cost, b.cycle) - monthize(a.cost, a.cycle));
  else if (sortBy === 'cost-asc') displayed.sort((a, b) => monthize(a.cost, a.cycle) - monthize(b.cost, b.cycle));
  else if (sortBy === 'name') displayed.sort((a, b) => a.name.localeCompare(b.name));
  else if (sortBy === 'next-bill') displayed.sort((a, b) => new Date(a.next_bill).getTime() - new Date(b.next_bill).getTime());

  const upcoming = [...active].filter(s => s.next_bill).sort((a, b) => new Date(a.next_bill).getTime() - new Date(b.next_bill).getTime()).slice(0, 6);
  const maxCat = catBreak.length ? catBreak[0].total : 1;

  const primaryCurrency = subs[0]?.currency || 'USD';
  const primaryCurrencySymbol =
    primaryCurrency === 'INR'
      ? '₹'
      : primaryCurrency === 'EUR'
        ? '€'
        : primaryCurrency === 'GBP'
          ? '£'
          : primaryCurrency === 'JPY'
            ? '¥'
            : '$';

  const displayName =
    user?.name ||
    (user?.email ? user.email.split('@')[0] : 'User');

  const mono = { fontFamily: "'IBM Plex Mono', monospace" };

  const inp: React.CSSProperties = {
    width: '100%', padding: '14px 0', border: 'none', borderBottom: '1px solid #ccc',
    fontSize: 15, fontFamily: "'Libre Baskerville', serif", outline: 'none', background: 'none',
    color: '#000', transition: 'border-color 0.3s ease', letterSpacing: '0.3px'
  };

  const sel: React.CSSProperties = {
    ...inp, appearance: 'none' as const, cursor: 'pointer',
    backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='10' viewBox='0 0 24 24' fill='none' stroke='%23555' stroke-width='1.5'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E")`,
    backgroundRepeat: 'no-repeat', backgroundPosition: 'right 4px center'
  };

  return (
    <div style={{
      minHeight: '100vh', background: '#FAFAF8', color: '#000',
      fontFamily: "'Libre Baskerville', serif", position: 'relative'
    }}>
      <link href="https://fonts.googleapis.com/css2?family=Libre+Baskerville:ital,wght@0,400;0,700;1,400&family=IBM+Plex+Mono:wght@300;400;500;600&family=Outfit:wght@300;400;500;600;700&display=swap" rel="stylesheet" />

      <style>{`
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes slideUp { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes spin { to { transform: rotate(360deg); } }
        .animate-spin { animation: spin 1s linear infinite; }

        .hover-underline {
          position: relative; padding-bottom: 4px; letter-spacing: 3px; font-size: 11px;
          text-transform: uppercase; font-family: 'IBM Plex Mono', monospace; font-weight: 500; color: #000;
        }
        .hover-underline::after {
          content: ""; position: absolute; width: 100%; transform: scaleX(0); height: 1.5px;
          bottom: 0; left: 0; background: #000; transform-origin: bottom right; transition: transform 0.3s ease-out;
        }
        .cta-btn:hover .hover-underline::after { transform: scaleX(1); transform-origin: bottom left; }
        .cta-btn .cta-arrow { transform: translateX(-3px); transition: transform 0.3s ease; }
        .cta-btn:hover .cta-arrow { transform: translateX(0); }

        .nav-item {
          position: relative; cursor: pointer; padding: 4px 0;
          font-family: 'IBM Plex Mono', monospace; font-size: 12px;
          letter-spacing: 2px; text-transform: uppercase; transition: color 0.2s;
        }
        .nav-item::after {
          content: ""; position: absolute; bottom: -2px; left: 0;
          width: 100%; height: 1.5px; background: #000;
          transform: scaleX(0); transform-origin: right; transition: transform 0.3s ease;
        }
        .nav-item:hover::after, .nav-item.active::after { transform: scaleX(1); transform-origin: left; }

        .sub-row { transition: background 0.2s ease; cursor: pointer; border-radius: 4px; }
        .sub-row:hover { background: #f0f0ec !important; }

        .tag { border: 1px solid #000; padding: 3px 10px; font-size: 8px; letter-spacing: 1.5px; text-transform: uppercase; font-family: 'IBM Plex Mono', monospace; display: inline-block; }
        .tag-paused { border-color: #888; color: #444; }

        .action-btn {
          position: relative; overflow: hidden;
          font-family: 'IBM Plex Mono', monospace; font-size: 10px;
          letter-spacing: 2px; text-transform: uppercase;
          padding: 10px 20px; cursor: pointer;
          transition: all 0.3s ease;
        }
        .action-btn::before {
          content: ""; position: absolute; top: 0; left: 0;
          width: 100%; height: 100%;
          transition: transform 0.3s ease;
          transform: scaleX(0); transform-origin: right;
        }
        .action-btn:hover::before {
          transform: scaleX(1); transform-origin: left;
        }
        .action-btn span { position: relative; z-index: 1; }
        .action-btn-outline {
          border: 1px solid #ccc; background: #fff; color: #000;
        }
        .action-btn-outline::before { background: #000; }
        .action-btn-outline:hover { border-color: #000; color: #fff; }
        .action-btn-filled {
          border: 1px solid #000; background: #000; color: #fff;
        }
        .action-btn-filled:hover {
          transform: translateY(-2px);
          box-shadow: 0 4px 12px rgba(0,0,0,0.25);
        }
        .action-btn-filled::before { background: #222; }

        .action-btn-sm {
          padding: 6px 14px;
          font-size: 9px;
          letter-spacing: 1.5px;
        }

        input:focus, select:focus { border-bottom-color: #000 !important; }
        ::-webkit-scrollbar { width: 3px; }
        ::-webkit-scrollbar-thumb { background: #ccc; }
      `}</style>

      {/* ═══ HEADER ═══ */}
      <header style={{
        padding: '28px 48px', display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between',
        borderBottom: '1px solid #000', opacity: mounted ? 1 : 0, transition: 'opacity 0.8s ease'
      }}>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 16 }}>
          <div style={{ fontFamily: "'Outfit', sans-serif", fontSize: 28, fontWeight: 700, letterSpacing: '-1px', lineHeight: 1 }}>SubVault</div>
          {view !== 'dashboard' && (
            <button
              onClick={() => setView('dashboard')}
              style={{
                background: 'none',
                border: 'none',
                padding: 0,
                cursor: 'pointer',
                fontFamily: "'IBM Plex Mono', monospace",
                fontSize: 10,
                letterSpacing: 2,
                textTransform: 'uppercase',
                color: '#444',
              }}
            >
              ← Back
            </button>
          )}
        </div>

        <nav style={{ display: 'flex', gap: 32, alignItems: 'center' }}>
          {[
            { id: 'dashboard', label: 'Home Page' },
            { id: 'subscriptions', label: 'Subscriptions' },
            { id: 'analytics', label: 'Analytics' },
          ].map(item => (
            <span
              key={item.id}
              className={`nav-item ${view === item.id ? 'active' : ''}`}
              onClick={() => setView(item.id)}
              style={{ color: view === item.id ? '#000' : '#444', fontWeight: view === item.id ? 600 : 400 }}
            >
              {item.label}
            </span>
          ))}
        </nav>

        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <span style={{ ...mono, fontSize: 11, color: '#444' }}>Welcome, {displayName}</span>
          <Link href="/profile" style={{ textDecoration: 'none' }}>
            <button className="action-btn action-btn-outline">
              <span>Profile</span>
            </button>
          </Link>
        </div>
      </header>

      <main style={{ padding: '48px 48px 80px', maxWidth: 1320, margin: '0 auto' }}>

        {/* ═══ LOADING STATE ═══ */}
        {loading && (
          <div style={{ textAlign: 'center', padding: '80px 0', animation: 'fadeIn 0.3s ease' }}>
            <div className="animate-spin" style={{ width: 28, height: 28, border: '2px solid #eee', borderTopColor: '#000', borderRadius: '50%', margin: '0 auto 16px' }} />
            <p style={{ ...mono, fontSize: 11, color: '#444', letterSpacing: 2 }}>Loading subscriptions...</p>
          </div>
        )}

        {/* ═══ API ERROR ═══ */}
        {apiError && !loading && (
          <div style={{ textAlign: 'center', padding: '60px 0', animation: 'fadeIn 0.3s ease' }}>
            <p style={{ fontSize: 14, color: '#d32f2f', marginBottom: 16 }}>{apiError}</p>
            <button onClick={fetchSubs} style={{ ...mono, fontSize: 11, letterSpacing: 2, padding: '10px 24px', border: '1px solid #000', background: '#000', color: '#fff', cursor: 'pointer' }}>
              RETRY
            </button>
          </div>
        )}

        {/* ═══ EMPTY STATE ═══ */}
        {!loading && !apiError && subs.length === 0 && view === 'dashboard' && (
          <div style={{ textAlign: 'center', padding: '80px 0', animation: 'slideUp 0.6s ease' }}>
            <div style={{ fontSize: 48, marginBottom: 20, color: '#ccc' }}>∅</div>
            <h2 style={{ fontFamily: "'Outfit', sans-serif", fontSize: 24, fontWeight: 500, marginBottom: 12 }}>No subscriptions yet</h2>
            <p style={{ fontSize: 14, color: '#444', marginBottom: 32, maxWidth: 440, margin: '0 auto 32px' }}>
              Scan your email to automatically detect subscriptions, import your bank statement, or add them manually.
            </p>
            <div style={{ display: 'flex', gap: 16, justifyContent: 'center', flexWrap: 'wrap' }}>
              <button
                onClick={startGmailScan}
                disabled={scanning}
                className="action-btn action-btn-filled"
              >
                <span>{scanning ? '⟳ Scanning…' : '✉ Scan Email'}</span>
              </button>
              <button
                onClick={() => setImportOpen(true)}
                className="action-btn action-btn-outline"
              >
                <span>↑ Import CSV</span>
              </button>
              <button
                onClick={openAdd}
                className="action-btn action-btn-outline"
              >
                <span>Add Manually</span>
              </button>
            </div>
            {scanError && (
              <div style={{ ...mono, fontSize: 11, color: '#c00', marginTop: 16, padding: '8px 12px', border: '1px solid #fcc', background: '#fff5f5', display: 'inline-block' }}>
                {scanError}
                <button onClick={() => setScanError(null)} style={{ ...mono, fontSize: 9, marginLeft: 12, border: 'none', background: 'none', cursor: 'pointer', color: '#c00', textDecoration: 'underline' }}>dismiss</button>
              </div>
            )}
          </div>
        )}

        {/* ═══ DASHBOARD VIEW ═══ */}
        {!loading && !apiError && subs.length > 0 && view === 'dashboard' && (
          <div style={{ animation: 'fadeIn 0.6s ease' }}>
            {/* Action bar */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, marginBottom: 32 }}>
              <button
                className="action-btn action-btn-outline"
                onClick={startGmailScan}
                disabled={scanning}
              >
                <span>{scanning ? '⟳ Scanning…' : '✉ Scan Email'}</span>
              </button>
              <button
                className="action-btn action-btn-outline"
                onClick={() => setImportOpen(true)}
              >
                <span>↑ Import CSV</span>
              </button>
              <button
                className="action-btn action-btn-filled"
                onClick={openAdd}
              >
                <span>+ Add Subscription</span>
              </button>
            </div>
            {scanError && (
              <div style={{ ...mono, fontSize: 11, color: '#c00', marginBottom: 16, padding: '8px 12px', border: '1px solid #fcc', background: '#fff5f5' }}>
                {scanError}
                <button onClick={() => setScanError(null)} style={{ ...mono, fontSize: 9, marginLeft: 12, border: 'none', background: 'none', cursor: 'pointer', color: '#c00', textDecoration: 'underline' }}>dismiss</button>
              </div>
            )}

            {/* KPIs */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1px 1fr 1px 1fr 1px 1fr', gap: 0, marginBottom: 64 }}>
              {[
                { label: 'Monthly', value: totalMo, pre: primaryCurrencySymbol },
                null,
                { label: 'Annual', value: totalYr, pre: primaryCurrencySymbol },
                null,
                { label: 'Active', value: active.length, pre: '' },
                null,
                { label: 'Avg / Service', value: active.length ? totalMo / active.length : 0, pre: primaryCurrencySymbol },
              ].map((item, i) =>
                item === null ? (
                  <div key={i} style={{ background: '#ddd', margin: '8px 0' }} />
                ) : (
                  <div key={i} style={{ padding: '0 32px', animation: `slideUp 0.6s ease ${i * 0.08}s both` }}>
                    <div style={{ ...mono, fontSize: 10, letterSpacing: 3, textTransform: 'uppercase', color: '#444', marginBottom: 12 }}>{item.label}</div>
                    <div style={{ fontFamily: "'Outfit', sans-serif", fontSize: 42, fontWeight: 300, letterSpacing: '-2px', lineHeight: 1 }}>
                      <AnimNum value={item.value} prefix={item.pre} />
                    </div>
                  </div>
                )
              )}
            </div>

            {/* Category + Upcoming */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 64 }}>
              <div style={{ animation: 'slideUp 0.6s ease 0.2s both' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 28, borderBottom: '1px solid #000', paddingBottom: 12 }}>
                  <span style={{ ...mono, fontSize: 10, letterSpacing: 3, textTransform: 'uppercase' }}>Spend by Category</span>
                  <span style={{ ...mono, fontSize: 10, color: '#444' }}>Monthly</span>
                </div>
                {catBreak.length === 0 && (
                  <p style={{ ...mono, fontSize: 11, color: '#444' }}>No active subscriptions to categorize.</p>
                )}
                {catBreak.map((c, i) => (
                  <div key={i} style={{ marginBottom: 24 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
                      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
                        <span style={{ ...mono, fontSize: 10, color: '#444' }}>
                          {String(i + 1).padStart(2, '0')}
                        </span>
                        <span style={{ fontSize: 15, fontWeight: 400 }}>{c.cat}</span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'baseline', gap: 16 }}>
                        <span style={{ fontFamily: "'Outfit', sans-serif", fontSize: 18, fontWeight: 500 }}>{fmt(c.total, primaryCurrency)}</span>
                        <span style={{ ...mono, fontSize: 10, color: '#444' }}>{totalMo > 0 ? Math.round((c.total / totalMo) * 100) : 0}%</span>
                      </div>
                    </div>
                    <HBar
                      pct={totalMo > 0 ? (c.total / totalMo) * 100 : 0}
                      delay={0.1 * i}
                    />
                  </div>
                ))}
              </div>

              <div style={{ animation: 'slideUp 0.6s ease 0.3s both' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 28, borderBottom: '1px solid #000', paddingBottom: 12 }}>
                  <span style={{ ...mono, fontSize: 10, letterSpacing: 3, textTransform: 'uppercase' }}>Upcoming Renewals</span>
                  <span style={{ ...mono, fontSize: 10, color: '#444' }}>Next 30 Days</span>
                </div>
                {upcoming.length === 0 && (
                  <p style={{ ...mono, fontSize: 11, color: '#444' }}>No upcoming renewals.</p>
                )}
                {upcoming.map((s) => {
                  const d = daysUntil(s.next_bill);
                  return (
                    <div key={s.id} style={{
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                      padding: '16px 0', borderBottom: '1px solid #eee'
                    }}>
                      <div>
                        <div style={{ fontSize: 15, marginBottom: 3 }}>{s.name}</div>
                        <div style={{ ...mono, fontSize: 10, color: '#444' }}>{s.category}</div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontFamily: "'Outfit', sans-serif", fontSize: 16, fontWeight: 500 }}>{fmt(s.cost, s.currency)}</div>
                        <div style={{
                          ...mono, fontSize: 10,
                          color: d <= 3 ? '#000' : '#555',
                          fontWeight: d <= 3 ? 600 : 400
                        }}>
                          {d <= 0 ? 'Today' : `${d} days`}
                          {d <= 3 && ' ←'}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* ═══ SUBSCRIPTIONS VIEW ═══ */}
        {!loading && view === 'subscriptions' && (
          <div style={{ animation: 'fadeIn 0.4s ease' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 32 }}>
              <div>
                <div style={{ ...mono, fontSize: 10, letterSpacing: 3, textTransform: 'uppercase', color: '#444', marginBottom: 6 }}>Manage</div>
                <h2 style={{ fontFamily: "'Outfit', sans-serif", fontSize: 28, fontWeight: 600, letterSpacing: '-1px', margin: 0 }}>Subscriptions</h2>
              </div>
              <div style={{ display: 'flex', gap: 12 }}>
                <button onClick={() => setImportOpen(true)} className="action-btn action-btn-outline" style={{ padding: '10px 20px' }}>
                  <span>↑ Import</span>
                </button>
                <button onClick={openAdd} className="action-btn action-btn-filled" style={{ padding: '10px 20px' }}>
                  <span>+ Add New</span>
                </button>
              </div>
            </div>

            {/* Filters */}
            <div style={{ display: 'flex', gap: 16, marginBottom: 24, flexWrap: 'wrap', alignItems: 'center' }}>
              <input
                placeholder="Search..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                style={{ padding: '10px 16px', border: '1px solid #ddd', outline: 'none', fontSize: 13, width: 220, transition: 'border-color 0.2s', ...mono }}
              />
              <div style={{ width: 180 }}>
                <CustomSelect
                  value={filterCat}
                  onChange={setFilterCat}
                  options={[
                    { label: 'All Categories', value: 'All' },
                    ...CAT_LIST.map(c => ({ label: c, value: c }))
                  ]}
                />
              </div>
              <div style={{ width: 140 }}>
                <CustomSelect
                  value={filterStatus}
                  onChange={setFilterStatus}
                  options={[
                    { label: 'All Status', value: 'All' },
                    { label: 'Active', value: 'active' },
                    { label: 'Paused', value: 'paused' },
                    { label: 'Cancelled', value: 'cancelled' }
                  ]}
                />
              </div>
              <div style={{ width: 200 }}>
                <CustomSelect
                  value={sortBy}
                  onChange={setSortBy}
                  options={[
                    { label: 'Cost: High → Low', value: 'cost-desc' },
                    { label: 'Cost: Low → High', value: 'cost-asc' },
                    { label: 'Name: A → Z', value: 'name' },
                    { label: 'Next Bill', value: 'next-bill' }
                  ]}
                />
              </div>
            </div>

            {/* List */}
            {displayed.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px 0', color: '#444' }}>
                <p style={{ ...mono, fontSize: 12 }}>No subscriptions found.</p>
              </div>
            ) : (
              displayed.map(s => {
                const d = s.next_bill ? daysUntil(s.next_bill) : null;
                return (
                  <div key={s.id} className="sub-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 12px', borderBottom: '1px solid #eee' }}
                    onClick={() => openEdit(s)}>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
                        <span style={{ fontSize: 15 }}>{s.name}</span>
                        <span className={`tag ${s.status !== 'active' ? 'tag-paused' : ''}`}>{s.status}</span>
                      </div>
                      <div style={{ ...mono, fontSize: 10, color: '#444' }}>
                        {s.category} · {s.cycle} · {d !== null ? (d <= 0 ? 'Today' : `in ${d} days`) : 'No billing date'}
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                      <span style={{ fontFamily: "'Outfit', sans-serif", fontSize: 18, fontWeight: 500 }}>
                        {fmt(s.cost, s.currency)}
                      </span>
                      <button onClick={e => { e.stopPropagation(); toggle(s.id); }} className="action-btn action-btn-outline action-btn-sm" style={{ padding: '6px 14px' }}>
                        <span>{s.status === 'active' ? 'PAUSE' : 'RESUME'}</span>
                      </button>
                      <button onClick={e => { e.stopPropagation(); del(s.id); }} className="action-btn action-btn-outline action-btn-sm" style={{ padding: '6px 14px', color: '#c00' }}>
                        <span>DEL</span>
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}

        {/* ═══ ANALYTICS VIEW ═══ */}
        {!loading && view === 'analytics' && (
          <div style={{ animation: 'fadeIn 0.4s ease', textAlign: 'center', padding: '60px 0' }}>
            <div style={{ ...mono, fontSize: 10, letterSpacing: 3, textTransform: 'uppercase', color: '#444', marginBottom: 16 }}>Coming Soon</div>
            <h2 style={{ fontFamily: "'Outfit', sans-serif", fontSize: 28, fontWeight: 500 }}>Advanced Analytics</h2>
            <p style={{ fontSize: 14, color: '#444', marginTop: 8 }}>Trends, insights, and optimization suggestions.</p>
          </div>
        )}
      </main>

      {/* ═══ ADD/EDIT MODAL ═══ */}
      <Modal open={modalOpen} onClose={() => setModalOpen(false)}>
        <div style={{ ...mono, fontSize: 10, letterSpacing: 3, textTransform: 'uppercase', color: '#444', marginBottom: 6 }}>
          {editSub ? 'Edit' : 'New'}
        </div>
        <h2 style={{ fontFamily: "'Outfit', sans-serif", fontSize: 24, fontWeight: 600, letterSpacing: '-0.5px', marginBottom: 32, marginTop: 0 }}>
          {editSub ? 'Edit Subscription' : 'Add Subscription'}
        </h2>

        <div style={{ display: 'grid', gap: 20 }}>
          <input
            style={inp}
            placeholder="Service name"
            value={form.name}
            onChange={e => setForm({ ...form, name: e.target.value })}
          />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <input
              style={inp}
              type="number"
              placeholder="Cost"
              value={form.cost}
              onChange={e => setForm({ ...form, cost: e.target.value })}
            />
            <CustomSelect
              value={form.currency}
              onChange={v => setForm({ ...form, currency: v })}
              options={CURRENCIES.map(c => ({ label: c, value: c }))}
            />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <CustomSelect
              value={form.cycle}
              onChange={v => setForm({ ...form, cycle: v })}
              options={CYCLES.map(c => ({ label: c, value: c }))}
            />
            <CustomSelect
              value={form.category}
              onChange={v => setForm({ ...form, category: v })}
              options={CAT_LIST.map(c => ({ label: c, value: c }))}
            />
          </div>
          <div>
            <div
              style={{
                ...mono,
                fontSize: 10,
                letterSpacing: 2,
                textTransform: 'uppercase',
                color: '#444',
                marginBottom: 4,
              }}
            >
              Next billing date
            </div>
            <input
              style={inp}
              type="date"
              placeholder="Next billing date"
              value={form.next_bill}
              onChange={e => setForm({ ...form, next_bill: e.target.value })}
            />
          </div>
          <input
            style={inp}
            placeholder="URL (optional)"
            value={form.url}
            onChange={e => setForm({ ...form, url: e.target.value })}
          />
        </div>

        <button onClick={save} style={{
          marginTop: 32, width: '100%', padding: '16px 0', border: '1px solid #000',
          background: '#000', color: '#fff', cursor: 'pointer',
          ...mono, fontSize: 11, letterSpacing: 3, textTransform: 'uppercase'
        }}>
          {editSub ? 'Save Changes' : 'Add Subscription'}
        </button>
      </Modal>

      {/* ═══ IMPORT MODAL ═══ */}
      <ImportCSVModal
        open={importOpen}
        onClose={() => setImportOpen(false)}
        onImported={() => fetchSubs()}
      />

      {/* ═══ GMAIL SCAN REVIEW MODAL ═══ */}
      <Modal open={scanOpen} onClose={() => setScanOpen(false)}>
        <div style={{ ...mono, fontSize: 10, letterSpacing: 3, textTransform: 'uppercase', color: '#444', marginBottom: 6 }}>
          Email Scan
        </div>
        <h2 style={{ fontFamily: "'Outfit', sans-serif", fontSize: 24, fontWeight: 600, letterSpacing: '-0.5px', marginBottom: 8, marginTop: 0 }}>
          Detected Subscriptions
        </h2>
        <p style={{ ...mono, fontSize: 11, color: '#444', marginBottom: 24 }}>
          {scanResults.length} subscription{scanResults.length !== 1 ? 's' : ''} found in your email. Select which ones to add.
        </p>

        {scanResults.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '32px 0', color: '#444' }}>
            <div style={{ fontSize: 36, marginBottom: 16 }}>∅</div>
            <p style={{ ...mono, fontSize: 12 }}>No subscriptions detected in your email.</p>
          </div>
        ) : (
          <div style={{ maxHeight: 400, overflowY: 'auto', marginBottom: 24 }}>
            {scanResults.map((s, i) => (
              <div
                key={i}
                onClick={() => {
                  const next = new Set(scanSelected);
                  if (next.has(i)) next.delete(i);
                  else next.add(i);
                  setScanSelected(next);
                }}
                style={{
                  display: 'flex', alignItems: 'center', gap: 12,
                  padding: '14px 0', borderBottom: '1px solid #eee',
                  cursor: 'pointer', transition: 'background 0.15s',
                }}
              >
                <div style={{
                  width: 20, height: 20, border: '1.5px solid #000',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  flexShrink: 0,
                  background: scanSelected.has(i) ? '#000' : '#fff',
                  color: scanSelected.has(i) ? '#fff' : '#000',
                  transition: 'all 0.15s',
                }}>
                  {scanSelected.has(i) && '✓'}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 2 }}>{s.name}</div>
                  <div style={{ ...mono, fontSize: 9, color: '#444', display: 'flex', gap: 8 }}>
                    <span>{s.category}</span>
                    <span>·</span>
                    <span>{s.cycle}</span>
                    <span>·</span>
                    <span>{s.emailCount} emails</span>
                    <span>·</span>
                    <span style={{
                      color: s.confidence === 'high' ? '#1a7f37' : s.confidence === 'medium' ? '#bf8700' : '#888',
                      fontWeight: 600,
                    }}>
                      {s.confidence}
                    </span>
                  </div>
                </div>
                <div style={{ fontFamily: "'Outfit', sans-serif", fontSize: 16, fontWeight: 500, flexShrink: 0 }}>
                  {s.cost > 0 ? fmt(s.cost, s.currency) : '—'}
                </div>
              </div>
            ))}
          </div>
        )}

        <div style={{ display: 'flex', gap: 12 }}>
          <button onClick={() => setScanOpen(false)} className="action-btn action-btn-outline" style={{ flex: 1 }}>
            <span>Cancel</span>
          </button>
          {scanResults.length > 0 && (
            <button
              onClick={confirmScanResults}
              className="action-btn action-btn-filled"
              style={{ flex: 1 }}
              disabled={scanSelected.size === 0}
            >
              <span>Add {scanSelected.size} Subscription{scanSelected.size !== 1 ? 's' : ''}</span>
            </button>
          )}
        </div>
      </Modal>

      {/* ═══ FOOTER ═══ */}
      <footer style={{ borderTop: '1px solid #000', padding: '20px 48px' }} />
    </div>
  );
}

export default function DashboardPage() {
  return (
    <ProtectedRoute>
      <DashboardContent />
    </ProtectedRoute>
  );
}

