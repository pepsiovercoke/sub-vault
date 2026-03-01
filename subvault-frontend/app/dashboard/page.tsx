'use client';

import { useState, useEffect, useRef } from 'react';
import { ProtectedRoute } from '@/app/components/auth/ProtectedRoute';
import { useAuth } from '@/app/components/auth/useAuth';
import Link from 'next/link';

const CATEGORIES = {
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

const initialSubs = [
  { id: 1, name: 'OpenAI API', cost: 120, currency: 'USD', cycle: 'Monthly', category: 'AI & Tech', status: 'active', nextBill: '2026-03-15', notes: 'GPT-4 Turbo access' },
  { id: 2, name: 'AWS', cost: 2400, currency: 'USD', cycle: 'Monthly', category: 'Cloud & Infra', status: 'active', nextBill: '2026-03-01', notes: 'Production infrastructure' },
  { id: 3, name: 'Figma Enterprise', cost: 75, currency: 'USD', cycle: 'Monthly', category: 'Productivity', status: 'active', nextBill: '2026-03-20', notes: 'Design team licenses' },
  { id: 4, name: 'Bloomberg Terminal', cost: 2083, currency: 'USD', cycle: 'Monthly', category: 'Finance', status: 'active', nextBill: '2026-03-05', notes: 'Market intelligence' },
  { id: 5, name: 'Netflix Premium', cost: 22.99, currency: 'USD', cycle: 'Monthly', category: 'Media & Content', status: 'active', nextBill: '2026-03-12', notes: '4K streaming' },
];

const fmt = (n, c = 'USD') => new Intl.NumberFormat('en-US', { style: 'currency', currency: c, minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(n);
const annualize = (cost, cycle) => cycle === 'Monthly' ? cost * 12 : cycle === 'Quarterly' ? cost * 4 : cost;
const monthize = (cost, cycle) => cycle === 'Yearly' ? cost / 12 : cycle === 'Quarterly' ? cost / 3 : cost;
const daysUntil = (d) => Math.ceil((new Date(d) - new Date()) / 864e5);

const ArrowCTA = ({ children, onClick, style = {}, reversed = false }) => (
  <button onClick={onClick} className="cta-btn" style={{ border: 'none', background: 'none', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', padding: 0, ...style }}>
    {reversed && (
      <svg width="28" height="16" viewBox="0 0 28 16" fill="none" style={{ transform: 'rotate(180deg)', marginRight: 6 }} className="cta-arrow">
        <path d="M8 1L1 8L8 15" stroke="currentColor" strokeWidth="1.2" />
        <line x1="1" y1="8" x2="27" y2="8" stroke="currentColor" strokeWidth="1.2" />
      </svg>
    )}
    <span className="hover-underline">{children}</span>
    {!reversed && (
      <svg width="28" height="16" viewBox="0 0 28 16" fill="none" style={{ marginLeft: 6 }} className="cta-arrow">
        <path d="M20 1L27 8L20 15" stroke="currentColor" strokeWidth="1.2" />
        <line x1="0" y1="8" x2="27" y2="8" stroke="currentColor" strokeWidth="1.2" />
      </svg>
    )}
  </button>
);

const AnimNum = ({ value, prefix = '$' }) => {
  const [d, setD] = useState(0);
  const ref = useRef();
  useEffect(() => {
    let s = d, st = null;
    const run = (ts) => {
      if (!st) st = ts;
      const p = Math.min((ts - st) / 700, 1);
      setD(s + (value - s) * (1 - Math.pow(1 - p, 3)));
      if (p < 1) ref.current = requestAnimationFrame(run);
    };
    ref.current = requestAnimationFrame(run);
    return () => cancelAnimationFrame(ref.current);
  }, [value]);
  return <span>{prefix}{Math.round(d).toLocaleString()}</span>;
};

const HBar = ({ pct, delay = 0 }) => (
  <div style={{ height: 2, background: '#e8e8e8', width: '100%', overflow: 'hidden' }}>
    <div style={{ height: '100%', background: '#000', width: `${pct}%`, transition: `width 1s cubic-bezier(0.16,1,0.3,1) ${delay}s` }} />
  </div>
);

const Modal = ({ open, onClose, children }) => {
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
  const { user, logout } = useAuth();
  const [subs, setSubs] = useState(initialSubs);
  const [view, setView] = useState('dashboard');
  const [search, setSearch] = useState('');
  const [filterCat, setFilterCat] = useState('All');
  const [filterStatus, setFilterStatus] = useState('All');
  const [sortBy, setSortBy] = useState('cost-desc');
  const [modalOpen, setModalOpen] = useState(false);
  const [editSub, setEditSub] = useState(null);
  const [detailSub, setDetailSub] = useState(null);
  const [mounted, setMounted] = useState(false);
  const [form, setForm] = useState({ name: '', cost: '', currency: 'USD', cycle: 'Monthly', category: 'AI & Tech', status: 'active', nextBill: '', notes: '' });

  useEffect(() => { setTimeout(() => setMounted(true), 50); }, []);

  const openAdd = () => { setEditSub(null); setForm({ name: '', cost: '', currency: 'USD', cycle: 'Monthly', category: 'AI & Tech', status: 'active', nextBill: '', notes: '' }); setModalOpen(true); };
  const openEdit = (s) => { setEditSub(s); setForm({ ...s, cost: String(s.cost) }); setModalOpen(true); };
  const save = () => {
    if (!form.name || !form.cost) return;
    if (editSub) setSubs(subs.map(s => s.id === editSub.id ? { ...s, ...form, cost: parseFloat(form.cost) } : s));
    else setSubs([...subs, { ...form, cost: parseFloat(form.cost), id: Date.now() }]);
    setModalOpen(false);
  };
  const del = (id) => setSubs(subs.filter(s => s.id !== id));
  const toggle = (id) => setSubs(subs.map(s => s.id === id ? { ...s, status: s.status === 'active' ? 'paused' : 'active' } : s));

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
  else if (sortBy === 'next-bill') displayed.sort((a, b) => new Date(a.nextBill) - new Date(b.nextBill));

  const upcoming = [...active].sort((a, b) => new Date(a.nextBill) - new Date(b.nextBill)).slice(0, 6);
  const maxCat = catBreak.length ? catBreak[0].total : 1;

  const mono = { fontFamily: "'IBM Plex Mono', monospace" };

  const inp = {
    width: '100%', padding: '14px 0', border: 'none', borderBottom: '1px solid #ccc',
    fontSize: 15, fontFamily: "'Libre Baskerville', serif", outline: 'none', background: 'none',
    color: '#000', transition: 'border-color 0.3s ease', letterSpacing: '0.3px'
  };

  const sel = { ...inp, appearance: 'none', cursor: 'pointer', backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='10' viewBox='0 0 24 24' fill='none' stroke='%23555' stroke-width='1.5'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E")`, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 4px center' };

  return (
    <div style={{
      minHeight: '100vh', background: '#FAFAF8', color: '#000',
      fontFamily: "'Libre Baskerville', serif", position: 'relative'
    }}>
      <link href="https://fonts.googleapis.com/css2?family=Libre+Baskerville:ital,wght@0,400;0,700;1,400&family=IBM+Plex+Mono:wght@300;400;500;600&family=Outfit:wght@300;400;500;600;700&display=swap" rel="stylesheet" />

      <style>{`
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes slideUp { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }

        .hover-underline {
          position: relative;
          padding-bottom: 4px;
          letter-spacing: 3px;
          font-size: 11px;
          text-transform: uppercase;
          font-family: 'IBM Plex Mono', monospace;
          font-weight: 500;
          color: #000;
        }
        .hover-underline::after {
          content: "";
          position: absolute;
          width: 100%;
          transform: scaleX(0);
          height: 1.5px;
          bottom: 0;
          left: 0;
          background: #000;
          transform-origin: bottom right;
          transition: transform 0.3s ease-out;
        }
        .cta-btn:hover .hover-underline::after {
          transform: scaleX(1);
          transform-origin: bottom left;
        }
        .cta-btn .cta-arrow { transform: translateX(-3px); transition: transform 0.3s ease; }
        .cta-btn:hover .cta-arrow { transform: translateX(0); }
        .cta-btn:active .cta-arrow { transform: scale(0.92); }

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
        .tag-paused { border-color: #888; color: #666; }

        input:focus, select:focus { border-bottom-color: #000 !important; }

        ::-webkit-scrollbar { width: 3px; }
        ::-webkit-scrollbar-thumb { background: #ccc; }
      `}</style>

      {/* ═══ HEADER ═══ */}
      <header style={{
        padding: '28px 48px', display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between',
        borderBottom: '1px solid #000', opacity: mounted ? 1 : 0, transition: 'opacity 0.8s ease'
      }}>
        <div>
          <div style={{ ...mono, fontSize: 10, letterSpacing: 4, textTransform: 'uppercase', color: '#666', marginBottom: 4 }}>Est. 2026</div>
          <div style={{ fontFamily: "'Outfit', sans-serif", fontSize: 28, fontWeight: 700, letterSpacing: '-1px', lineHeight: 1 }}>SubVault</div>
        </div>

        <nav style={{ display: 'flex', gap: 32, alignItems: 'center' }}>
          {['dashboard', 'subscriptions', 'analytics'].map(v => (
            <span key={v} className={`nav-item ${view === v ? 'active' : ''}`} onClick={() => setView(v)}
              style={{ color: view === v ? '#000' : '#666', fontWeight: view === v ? 600 : 400 }}>
              {v}
            </span>
          ))}
        </nav>

        <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
          <span style={{ ...mono, fontSize: 11, color: '#666' }}>Welcome, {user?.name || 'User'}</span>
          <Link href="/auth/logout" style={{ textDecoration: 'none' }}>
            <button style={{
              background: 'none', border: '1px solid #000', padding: '8px 16px', cursor: 'pointer',
              ...mono, fontSize: 10, letterSpacing: 2, textTransform: 'uppercase', color: '#000',
              transition: 'all 0.2s ease'
            }}>Logout</button>
          </Link>
        </div>
      </header>

      <main style={{ padding: '48px 48px 80px', maxWidth: 1320, margin: '0 auto' }}>
        {view === 'dashboard' && (
          <div style={{ animation: 'fadeIn 0.6s ease' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1px 1fr 1px 1fr 1px 1fr', gap: 0, marginBottom: 64 }}>
              {[
                { label: 'Monthly', value: totalMo, pre: '$' },
                null,
                { label: 'Annual', value: totalYr, pre: '$' },
                null,
                { label: 'Active', value: active.length, pre: '' },
                null,
                { label: 'Avg / Service', value: active.length ? totalMo / active.length : 0, pre: '$' },
              ].map((item, i) =>
                item === null ? (
                  <div key={i} style={{ background: '#ddd', margin: '8px 0' }} />
                ) : (
                  <div key={i} style={{ padding: '0 32px', animation: `slideUp 0.6s ease ${i * 0.08}s both` }}>
                    <div style={{ ...mono, fontSize: 10, letterSpacing: 3, textTransform: 'uppercase', color: '#555', marginBottom: 12 }}>{item.label}</div>
                    <div style={{ fontFamily: "'Outfit', sans-serif", fontSize: 42, fontWeight: 300, letterSpacing: '-2px', lineHeight: 1 }}>
                      <AnimNum value={item.value} prefix={item.pre} />
                    </div>
                  </div>
                )
              )}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 64 }}>
              <div style={{ animation: 'slideUp 0.6s ease 0.2s both' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 28, borderBottom: '1px solid #000', paddingBottom: 12 }}>
                  <span style={{ ...mono, fontSize: 10, letterSpacing: 3, textTransform: 'uppercase' }}>Spend by Category</span>
                  <span style={{ ...mono, fontSize: 10, color: '#666' }}>Monthly</span>
                </div>
                {catBreak.map((c, i) => (
                  <div key={i} style={{ marginBottom: 24 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
                      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
                        <span style={{ ...mono, fontSize: 10, color: '#777' }}>{c.idx}</span>
                        <span style={{ fontSize: 15, fontWeight: 400 }}>{c.cat}</span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'baseline', gap: 16 }}>
                        <span style={{ fontFamily: "'Outfit', sans-serif", fontSize: 18, fontWeight: 500 }}>{fmt(c.total)}</span>
                        <span style={{ ...mono, fontSize: 10, color: '#666' }}>{Math.round((c.total / totalMo) * 100)}%</span>
                      </div>
                    </div>
                    <HBar pct={(c.total / maxCat) * 100} delay={0.1 * i} />
                  </div>
                ))}
              </div>

              <div style={{ animation: 'slideUp 0.6s ease 0.3s both' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 28, borderBottom: '1px solid #000', paddingBottom: 12 }}>
                  <span style={{ ...mono, fontSize: 10, letterSpacing: 3, textTransform: 'uppercase' }}>Upcoming Renewals</span>
                  <span style={{ ...mono, fontSize: 10, color: '#666' }}>Next 30 Days</span>
                </div>
                {upcoming.map((s) => {
                  const d = daysUntil(s.nextBill);
                  return (
                    <div key={s.id} style={{
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                      padding: '16px 0', borderBottom: '1px solid #eee'
                    }}>
                      <div>
                        <div style={{ fontSize: 15, marginBottom: 3 }}>{s.name}</div>
                        <div style={{ ...mono, fontSize: 10, color: '#666' }}>{s.category}</div>
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
      </main>

      <footer style={{ borderTop: '1px solid #000', padding: '20px 48px', display: 'flex', justifyContent: 'space-between' }}>
        <span style={{ ...mono, fontSize: 10, color: '#666', letterSpacing: 2 }}>SUBVAULT © 2026</span>
        <span style={{ ...mono, fontSize: 10, color: '#666', letterSpacing: 2 }}>BUILT FOR VISIONARIES</span>
      </footer>
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
