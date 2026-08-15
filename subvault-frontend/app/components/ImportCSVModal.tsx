'use client';

import { useState, useRef } from 'react';
import { imports } from '@/api-client';

const CATEGORIES = ['AI & Tech', 'Cloud & Infra', 'Media & Content', 'Finance', 'Productivity', 'Health', 'Other'];
const CYCLES = ['Monthly', 'Quarterly', 'Yearly'];
const CURRENCIES = ['USD', 'EUR', 'GBP', 'INR', 'JPY'];

const mono = { fontFamily: "'IBM Plex Mono', monospace" };

interface DetectedSub {
  name: string;
  cost: number;
  currency: string;
  cycle: string;
  category: string;
  status: string;
  next_bill: string;
  notes: string;
  confidence: string;
  occurrences: number;
  last_charged: string;
  raw_merchant: string;
  selected?: boolean;
}

interface ImportCSVModalProps {
  open: boolean;
  onClose: () => void;
  onImported: () => void;
}

export default function ImportCSVModal({ open, onClose, onImported }: ImportCSVModalProps) {
  const [step, setStep] = useState<'upload' | 'review' | 'importing' | 'done'>('upload');
  const [csvText, setCsvText] = useState('');
  const [detected, setDetected] = useState<DetectedSub[]>([]);
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currency, setCurrency] = useState('INR');
  const [stats, setStats] = useState({ total: 0, found: 0 });
  const [importResult, setImportResult] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const reset = () => {
    setStep('upload');
    setCsvText('');
    setDetected([]);
    setError(null);
    setStats({ total: 0, found: 0 });
    setImportResult(null);
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.name.endsWith('.csv') && !file.name.endsWith('.tsv') && !file.name.endsWith('.txt')) {
      setError('Please upload a CSV file');
      return;
    }

    const reader = new FileReader();
    reader.onload = (evt) => {
      const text = evt.target?.result as string;
      setCsvText(text);
      setError(null);
    };
    reader.readAsText(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      const text = evt.target?.result as string;
      setCsvText(text);
      setError(null);
    };
    reader.readAsText(file);
  };

  const analyze = async () => {
    if (!csvText.trim()) {
      setError('No CSV data to analyze');
      return;
    }

    setAnalyzing(true);
    setError(null);

    try {
      const result = await imports.detect(csvText, currency);
      const subsWithSelection = result.subscriptions.map((s: DetectedSub) => ({
        ...s,
        selected: s.confidence === 'high' || s.confidence === 'medium',
      }));
      setDetected(subsWithSelection);
      setStats({ total: result.total_transactions, found: result.subscriptions.length });
      setStep('review');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Analysis failed';
      setError(msg);
    } finally {
      setAnalyzing(false);
    }
  };

  const toggleSelect = (idx: number) => {
    setDetected(detected.map((d, i) => i === idx ? { ...d, selected: !d.selected } : d));
  };

  const toggleAll = () => {
    const allSelected = detected.every(d => d.selected);
    setDetected(detected.map(d => ({ ...d, selected: !allSelected })));
  };

  const updateSub = (idx: number, field: string, value: string | number) => {
    setDetected(detected.map((d, i) => i === idx ? { ...d, [field]: value } : d));
  };

  const confirmImport = async () => {
    const selected = detected.filter(d => d.selected);
    if (selected.length === 0) {
      setError('Select at least one subscription to import');
      return;
    }

    setStep('importing');
    setError(null);

    try {
      const result = await imports.confirm(selected.map(s => ({
        name: s.name,
        cost: s.cost,
        currency: s.currency,
        cycle: s.cycle,
        category: s.category,
        status: 'active',
        next_bill: s.next_bill,
        notes: s.notes,
      })));
      setImportResult(result.message);
      setStep('done');
      onImported();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Import failed';
      setError(msg);
      setStep('review');
    }
  };

  const confidenceColor = (c: string) => {
    if (c === 'high') return '#1a7f37';
    if (c === 'medium') return '#9a6700';
    return '#888';
  };

  if (!open) return null;

  return (
    <div
      onClick={handleClose}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(255,255,255,0.85)', backdropFilter: 'blur(20px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
        animation: 'fadeIn 0.3s ease',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: '#fff', border: '1px solid #000', width: 'min(780px, 94vw)',
          maxHeight: '90vh', overflowY: 'auto', padding: '44px 40px',
          animation: 'slideUp 0.4s cubic-bezier(0.16,1,0.3,1)',
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 32 }}>
          <div>
            <div style={{ ...mono, fontSize: 10, letterSpacing: 3, textTransform: 'uppercase', color: '#444', marginBottom: 6 }}>
              {step === 'upload' ? 'Step 1 of 2' : step === 'review' ? 'Step 2 of 2' : step === 'done' ? 'Complete' : 'Importing...'}
            </div>
            <h2 style={{ fontFamily: "'Outfit', sans-serif", fontSize: 24, fontWeight: 600, letterSpacing: '-0.5px', margin: 0 }}>
              {step === 'upload' ? 'Import Bank Statement' :
               step === 'review' ? 'Review Detected Subscriptions' :
               step === 'done' ? 'Import Successful' : 'Importing...'}
            </h2>
          </div>
          <button onClick={handleClose} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', padding: '4px 8px', color: '#444' }}>✕</button>
        </div>

        {/* Upload Step */}
        {step === 'upload' && (
          <div>
            <p style={{ fontSize: 14, color: '#444', marginBottom: 24, lineHeight: 1.6 }}>
              Upload your bank statement as a CSV file. SubVault will analyze your transactions and
              automatically detect recurring subscriptions.
            </p>

            {/* Currency selector */}
            <div style={{ marginBottom: 24 }}>
              <label style={{ ...mono, fontSize: 10, letterSpacing: 2, textTransform: 'uppercase', color: '#444', display: 'block', marginBottom: 8 }}>
                Statement Currency
              </label>
              <div style={{ display: 'flex', gap: 8 }}>
                {CURRENCIES.map(c => (
                  <button
                    key={c}
                    onClick={() => setCurrency(c)}
                    style={{
                      padding: '8px 16px', border: '1px solid', cursor: 'pointer',
                      borderColor: currency === c ? '#000' : '#ddd',
                      background: currency === c ? '#000' : '#fff',
                      color: currency === c ? '#fff' : '#666',
                      ...mono, fontSize: 11, letterSpacing: 1, transition: 'all 0.2s',
                    }}
                  >
                    {c}
                  </button>
                ))}
              </div>
            </div>

            {/* Drop zone */}
            <div
              onDrop={handleDrop}
              onDragOver={e => e.preventDefault()}
              onClick={() => fileRef.current?.click()}
              style={{
                border: '2px dashed', borderColor: csvText ? '#000' : '#ccc',
                padding: '48px 32px', textAlign: 'center', cursor: 'pointer',
                transition: 'all 0.3s ease', marginBottom: 20,
                background: csvText ? '#f8f8f6' : '#fafafa',
              }}
            >
              <input
                ref={fileRef}
                type="file"
                accept=".csv,.tsv,.txt"
                onChange={handleFile}
                style={{ display: 'none' }}
              />
              {csvText ? (
                <div>
                  <div style={{ fontSize: 28, marginBottom: 8 }}>✓</div>
                  <div style={{ ...mono, fontSize: 12, letterSpacing: 1, color: '#000' }}>
                    CSV loaded — {csvText.split('\n').length - 1} rows detected
                  </div>
                  <div style={{ ...mono, fontSize: 10, color: '#444', marginTop: 6 }}>Click to replace</div>
                </div>
              ) : (
                <div>
                  <div style={{ fontSize: 28, marginBottom: 8, color: '#444' }}>↑</div>
                  <div style={{ ...mono, fontSize: 12, letterSpacing: 1, color: '#444' }}>
                    Drop your CSV here or click to browse
                  </div>
                  <div style={{ ...mono, fontSize: 10, color: '#444', marginTop: 8 }}>
                    Supports most bank statement formats
                  </div>
                </div>
              )}
            </div>

            {/* Or paste */}
            <details style={{ marginBottom: 24 }}>
              <summary style={{ ...mono, fontSize: 10, letterSpacing: 2, color: '#444', cursor: 'pointer', marginBottom: 8 }}>
                OR PASTE CSV TEXT
              </summary>
              <textarea
                value={csvText}
                onChange={e => setCsvText(e.target.value)}
                placeholder={`Date,Description,Debit,Credit\n2025-01-15,NETFLIX,649,\n2025-01-15,SPOTIFY INDIA,119,\n...`}
                style={{
                  width: '100%', height: 140, padding: 16, border: '1px solid #ddd',
                  fontFamily: "'IBM Plex Mono', monospace", fontSize: 12, resize: 'vertical',
                  outline: 'none', background: '#fafafa',
                }}
              />
            </details>

            {error && (
              <div style={{ ...mono, fontSize: 11, color: '#d32f2f', marginBottom: 16, padding: '12px 16px', background: '#ffeaea', border: '1px solid #f5c6cb' }}>
                {error}
              </div>
            )}

            <button
              onClick={analyze}
              disabled={!csvText.trim() || analyzing}
              style={{
                width: '100%', padding: '14px 0', border: '1px solid #000',
                background: csvText.trim() ? '#000' : '#ccc', color: '#fff',
                cursor: csvText.trim() && !analyzing ? 'pointer' : 'not-allowed',
                ...mono, fontSize: 11, letterSpacing: 3, textTransform: 'uppercase',
                transition: 'all 0.2s',
              }}
            >
              {analyzing ? 'Analyzing Transactions...' : 'Detect Subscriptions'}
            </button>
          </div>
        )}

        {/* Review Step */}
        {step === 'review' && (
          <div>
            <div style={{ display: 'flex', gap: 24, marginBottom: 24 }}>
              <div style={{ padding: '12px 20px', background: '#f5f5f3', flex: 1 }}>
                <div style={{ ...mono, fontSize: 10, color: '#444', letterSpacing: 2, textTransform: 'uppercase', marginBottom: 4 }}>Transactions</div>
                <div style={{ fontFamily: "'Outfit', sans-serif", fontSize: 22, fontWeight: 500 }}>{stats.total.toLocaleString()}</div>
              </div>
              <div style={{ padding: '12px 20px', background: '#f5f5f3', flex: 1 }}>
                <div style={{ ...mono, fontSize: 10, color: '#444', letterSpacing: 2, textTransform: 'uppercase', marginBottom: 4 }}>Subscriptions Found</div>
                <div style={{ fontFamily: "'Outfit', sans-serif", fontSize: 22, fontWeight: 500 }}>{stats.found}</div>
              </div>
              <div style={{ padding: '12px 20px', background: '#f5f5f3', flex: 1 }}>
                <div style={{ ...mono, fontSize: 10, color: '#444', letterSpacing: 2, textTransform: 'uppercase', marginBottom: 4 }}>Selected</div>
                <div style={{ fontFamily: "'Outfit', sans-serif", fontSize: 22, fontWeight: 500 }}>{detected.filter(d => d.selected).length}</div>
              </div>
            </div>

            {detected.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px 0', color: '#444' }}>
                <div style={{ fontSize: 28, marginBottom: 12 }}>∅</div>
                <p style={{ fontSize: 14 }}>No recurring subscriptions detected in your statement.</p>
                <p style={{ ...mono, fontSize: 11, color: '#444', marginTop: 8 }}>
                  Try uploading a statement with at least 3 months of history.
                </p>
              </div>
            ) : (
              <>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, borderBottom: '1px solid #000', paddingBottom: 8 }}>
                  <button onClick={toggleAll} style={{ ...mono, fontSize: 10, letterSpacing: 2, background: 'none', border: 'none', cursor: 'pointer', textTransform: 'uppercase', color: '#444' }}>
                    {detected.every(d => d.selected) ? 'Deselect All' : 'Select All'}
                  </button>
                  <span style={{ ...mono, fontSize: 10, color: '#444' }}>Click to edit</span>
                </div>

                <div style={{ maxHeight: '40vh', overflowY: 'auto' }}>
                  {detected.map((sub, idx) => (
                    <div key={idx} style={{
                      display: 'grid', gridTemplateColumns: '32px 1fr auto',
                      gap: 16, alignItems: 'center', padding: '14px 8px',
                      borderBottom: '1px solid #eee',
                      opacity: sub.selected ? 1 : 0.5, transition: 'opacity 0.2s',
                    }}>
                      {/* Checkbox */}
                      <div
                        onClick={() => toggleSelect(idx)}
                        style={{
                          width: 20, height: 20, border: '1.5px solid',
                          borderColor: sub.selected ? '#000' : '#ccc',
                          background: sub.selected ? '#000' : '#fff',
                          cursor: 'pointer', display: 'flex', alignItems: 'center',
                          justifyContent: 'center', transition: 'all 0.2s',
                        }}
                      >
                        {sub.selected && <span style={{ color: '#fff', fontSize: 12, lineHeight: 1 }}>✓</span>}
                      </div>

                      {/* Details */}
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                          <input
                            value={sub.name}
                            onChange={e => updateSub(idx, 'name', e.target.value)}
                            style={{ fontSize: 14, fontWeight: 500, border: 'none', outline: 'none', padding: '2px 0', fontFamily: "'Libre Baskerville', serif", width: '60%', background: 'transparent' }}
                          />
                          <span style={{ ...mono, fontSize: 9, letterSpacing: 1, padding: '2px 6px', background: `${confidenceColor(sub.confidence)}15`, color: confidenceColor(sub.confidence), textTransform: 'uppercase' }}>
                            {sub.confidence}
                          </span>
                        </div>
                        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                          <select
                            value={sub.category}
                            onChange={e => updateSub(idx, 'category', e.target.value)}
                            style={{ ...mono, fontSize: 10, border: 'none', outline: 'none', color: '#444', cursor: 'pointer', background: 'transparent' }}
                          >
                            {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                          </select>
                          <span style={{ color: '#ddd' }}>·</span>
                          <select
                            value={sub.cycle}
                            onChange={e => updateSub(idx, 'cycle', e.target.value)}
                            style={{ ...mono, fontSize: 10, border: 'none', outline: 'none', color: '#444', cursor: 'pointer', background: 'transparent' }}
                          >
                            {CYCLES.map(c => <option key={c} value={c}>{c}</option>)}
                          </select>
                          <span style={{ color: '#ddd' }}>·</span>
                          <span style={{ ...mono, fontSize: 10, color: '#444' }}>{sub.occurrences}× charged</span>
                        </div>
                      </div>

                      {/* Amount */}
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4, justifyContent: 'flex-end' }}>
                          <select
                            value={sub.currency}
                            onChange={e => updateSub(idx, 'currency', e.target.value)}
                            style={{ ...mono, fontSize: 10, border: 'none', outline: 'none', color: '#444', cursor: 'pointer', background: 'transparent', textAlign: 'right' }}
                          >
                            {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
                          </select>
                          <input
                            type="number"
                            value={sub.cost}
                            onChange={e => updateSub(idx, 'cost', parseFloat(e.target.value) || 0)}
                            style={{ fontFamily: "'Outfit', sans-serif", fontSize: 16, fontWeight: 500, border: 'none', outline: 'none', width: 80, textAlign: 'right', background: 'transparent' }}
                          />
                        </div>
                        <div style={{ ...mono, fontSize: 9, color: '#444' }}>next: {sub.next_bill}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}

            {error && (
              <div style={{ ...mono, fontSize: 11, color: '#d32f2f', marginTop: 16, padding: '12px 16px', background: '#ffeaea', border: '1px solid #f5c6cb' }}>
                {error}
              </div>
            )}

            <div style={{ display: 'flex', gap: 12, marginTop: 24 }}>
              <button
                onClick={() => { reset(); }}
                style={{
                  flex: 1, padding: '14px 0', border: '1px solid #ccc', background: '#fff',
                  cursor: 'pointer', ...mono, fontSize: 11, letterSpacing: 2, textTransform: 'uppercase',
                  color: '#444', transition: 'all 0.2s',
                }}
              >
                Start Over
              </button>
              <button
                onClick={confirmImport}
                disabled={detected.filter(d => d.selected).length === 0}
                style={{
                  flex: 2, padding: '14px 0', border: '1px solid #000',
                  background: detected.filter(d => d.selected).length > 0 ? '#000' : '#ccc',
                  color: '#fff', cursor: detected.filter(d => d.selected).length > 0 ? 'pointer' : 'not-allowed',
                  ...mono, fontSize: 11, letterSpacing: 3, textTransform: 'uppercase',
                  transition: 'all 0.2s',
                }}
              >
                Import {detected.filter(d => d.selected).length} Subscription{detected.filter(d => d.selected).length !== 1 ? 's' : ''}
              </button>
            </div>
          </div>
        )}

        {/* Importing */}
        {step === 'importing' && (
          <div style={{ textAlign: 'center', padding: '40px 0' }}>
            <div className="inline-block animate-spin" style={{ width: 32, height: 32, border: '2px solid #eee', borderTopColor: '#000', borderRadius: '50%', marginBottom: 16 }} />
            <p style={{ ...mono, fontSize: 12, letterSpacing: 1, color: '#444' }}>Importing subscriptions...</p>
          </div>
        )}

        {/* Done */}
        {step === 'done' && (
          <div style={{ textAlign: 'center', padding: '40px 0' }}>
            <div style={{ fontSize: 36, marginBottom: 16 }}>✓</div>
            <p style={{ fontSize: 16, marginBottom: 8 }}>{importResult}</p>
            <p style={{ ...mono, fontSize: 11, color: '#444', marginBottom: 24 }}>
              Your subscriptions are now tracked in SubVault.
            </p>
            <button
              onClick={handleClose}
              style={{
                padding: '14px 48px', border: '1px solid #000', background: '#000', color: '#fff',
                cursor: 'pointer', ...mono, fontSize: 11, letterSpacing: 3, textTransform: 'uppercase',
              }}
            >
              Done
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

