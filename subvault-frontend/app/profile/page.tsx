'use client';

import { useState } from 'react';
import { ProtectedRoute } from '@/app/components/auth/ProtectedRoute';
import { useAuth } from '@/app/components/auth/useAuth';
import { auth as apiAuth } from '@/api-client';

function ProfileContent() {
  const { user, isLoading, logout, updateProfile } = useAuth();

  const initialName =
    (user && typeof user.name === 'string' && user.name) ||
    (user && typeof user.email === 'string' ? user.email.split('@')[0] : '');

  const [name, setName] = useState(initialName);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Password section
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [pwSaving, setPwSaving] = useState(false);
  const [pwMessage, setPwMessage] = useState<string | null>(null);
  const [pwError, setPwError] = useState<string | null>(null);

  // Delete account section
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteInput, setDeleteInput] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const handleDeleteAccount = async () => {
    if (deleteInput !== 'DELETE') return;
    setDeleting(true);
    setDeleteError(null);
    try {
      await apiAuth.deleteAccount();
      logout();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to delete account';
      setDeleteError(msg);
      setDeleting(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      await updateProfile({ name: name.trim() });
      setMessage('Saved');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to update profile';
      setError(msg);
    } finally {
      setSaving(false);
    }
  };

  const handleSetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPwError(null);
    setPwMessage(null);

    if (newPassword.length < 6) {
      setPwError('Password must be at least 6 characters');
      return;
    }
    if (newPassword !== confirmPassword) {
      setPwError('Passwords do not match');
      return;
    }

    setPwSaving(true);
    try {
      await apiAuth.setPassword(newPassword, currentPassword || undefined);
      setPwMessage('Password updated successfully');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to set password';
      setPwError(msg);
    } finally {
      setPwSaving(false);
    }
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        background: '#FAFAF8',
        color: '#000',
        fontFamily: "'Libre Baskerville', serif",
        padding: '48px 24px',
        display: 'flex',
        justifyContent: 'center',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 560,
          background: '#fff',
          border: '1px solid #000',
          padding: '32px 32px 40px',
        }}
      >
        <style>{`
          .back-link {
            position: relative;
            cursor: pointer;
            padding: 4px 0;
            font-family: 'IBM Plex Mono', monospace;
            font-size: 13px;
            letter-spacing: 2px;
            text-transform: uppercase;
            color: #000;
            text-decoration: none;
            display: inline-block;
            font-weight: 500;
          }
          .back-link::after {
            content: "";
            position: absolute;
            bottom: -2px;
            left: 0;
            width: 100%;
            height: 1.5px;
            background: #000;
            transform: scaleX(0);
            transform-origin: right;
            transition: transform 0.3s ease;
          }
          .back-link:hover::after {
            transform: scaleX(1);
            transform-origin: left;
          }

          .action-btn {
            position: relative; overflow: hidden;
            font-family: 'IBM Plex Mono', monospace; font-size: 10px;
            letter-spacing: 2px; text-transform: uppercase;
            padding: 10px 22px; cursor: pointer;
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
            border: 1px solid #000; background: #fff; color: #000;
          }
          .action-btn-outline::before { background: #000; }
          .action-btn-outline:hover { color: #fff; }
          .action-btn-filled {
            border: 1px solid #000; background: #000; color: #fff;
          }
          .action-btn-filled:hover {
            transform: translateY(-2px);
            box-shadow: 0 4px 12px rgba(0,0,0,0.25);
          }
          .action-btn-filled::before { background: #222; }
          .action-btn:disabled {
            opacity: 0.7; cursor: not-allowed;
            transform: none !important; box-shadow: none !important;
          }
          .action-btn:disabled::before { display: none; }
        `}</style>
        <div style={{ marginBottom: 20 }}>
          <a href="/dashboard" className="back-link">
            ← Back
          </a>
        </div>

        <h1
          style={{
            fontFamily: "'Outfit', sans-serif",
            fontSize: 24,
            fontWeight: 600,
            letterSpacing: '-0.5px',
            margin: 0,
            marginBottom: 4,
          }}
        >
          Account
        </h1>
        <p style={{ fontSize: 13, color: '#444', marginTop: 0, marginBottom: 28 }}>
          Manage your SubVault profile and sign‑in details.
        </p>

        {isLoading ? (
          <p style={{ fontSize: 13, color: '#444' }}>Loading profile…</p>
        ) : (
          <form onSubmit={handleSave} style={{ display: 'grid', gap: 20 }}>
            <div>
              <div
                style={{
                  fontFamily: "'IBM Plex Mono', monospace",
                  fontSize: 10,
                  letterSpacing: 2,
                  textTransform: 'uppercase',
                  color: '#444',
                  marginBottom: 6,
                }}
              >
                Name
              </div>
              <input
                value={name}
                onChange={e => setName(e.target.value)}
                style={{
                  width: '100%',
                  padding: '10px 0',
                  border: 'none',
                  borderBottom: '1px solid #ccc',
                  fontSize: 16,
                  fontFamily: "'Libre Baskerville', serif",
                  outline: 'none',
                  background: 'none',
                }}
              />
            </div>

            <div>
              <div
                style={{
                  fontFamily: "'IBM Plex Mono', monospace",
                  fontSize: 10,
                  letterSpacing: 2,
                  textTransform: 'uppercase',
                  color: '#444',
                  marginBottom: 6,
                }}
              >
                Email
              </div>
              <div style={{ fontSize: 16 }}>
                {user && typeof user.email === 'string' ? user.email : '—'}
              </div>
            </div>

            {error && (
              <div
                style={{
                  fontFamily: "'IBM Plex Mono', monospace",
                  fontSize: 11,
                  color: '#c00',
                }}
              >
                {error}
              </div>
            )}
            {message && (
              <div
                style={{
                  fontFamily: "'IBM Plex Mono', monospace",
                  fontSize: 11,
                  color: '#1a7f37',
                }}
              >
                {message}
              </div>
            )}

            <div
              style={{
                marginTop: 12,
                paddingTop: 20,
                borderTop: '1px solid #eee',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: 16,
              }}
            >
              <button
                type="submit"
                disabled={saving || !name.trim()}
                className="action-btn action-btn-filled"
              >
                <span>{saving ? 'Saving…' : 'Save changes'}</span>
              </button>

              <button
                type="button"
                onClick={logout}
                className="action-btn action-btn-outline"
              >
                <span>Logout</span>
              </button>
            </div>
          </form>
        )}

        {/* Password Section */}
        {!isLoading && (
          <div
            style={{
              marginTop: 32,
              paddingTop: 28,
              borderTop: '1px solid #000',
            }}
          >
            <h2
              style={{
                fontFamily: "'Outfit', sans-serif",
                fontSize: 18,
                fontWeight: 600,
                letterSpacing: '-0.3px',
                margin: 0,
                marginBottom: 4,
              }}
            >
              Password
            </h2>
            <p style={{ fontSize: 13, color: '#444', marginTop: 0, marginBottom: 20 }}>
              Set or update your password to enable email & password login.
            </p>

            <form onSubmit={handleSetPassword} style={{ display: 'grid', gap: 16 }}>
              <div>
                <div
                  style={{
                    fontFamily: "'IBM Plex Mono', monospace",
                    fontSize: 10,
                    letterSpacing: 2,
                    textTransform: 'uppercase',
                    color: '#444',
                    marginBottom: 6,
                  }}
                >
                  Current Password
                </div>
                <input
                  type="password"
                  value={currentPassword}
                  onChange={e => setCurrentPassword(e.target.value)}
                  placeholder="Leave blank if you signed up with Google"
                  style={{
                    width: '100%',
                    padding: '10px 0',
                    border: 'none',
                    borderBottom: '1px solid #ccc',
                    fontSize: 16,
                    fontFamily: "'Libre Baskerville', serif",
                    outline: 'none',
                    background: 'none',
                  }}
                />
              </div>

              <div>
                <div
                  style={{
                    fontFamily: "'IBM Plex Mono', monospace",
                    fontSize: 10,
                    letterSpacing: 2,
                    textTransform: 'uppercase',
                    color: '#444',
                    marginBottom: 6,
                  }}
                >
                  New Password
                </div>
                <input
                  type="password"
                  value={newPassword}
                  onChange={e => setNewPassword(e.target.value)}
                  placeholder="At least 6 characters"
                  required
                  style={{
                    width: '100%',
                    padding: '10px 0',
                    border: 'none',
                    borderBottom: '1px solid #ccc',
                    fontSize: 16,
                    fontFamily: "'Libre Baskerville', serif",
                    outline: 'none',
                    background: 'none',
                  }}
                />
              </div>

              <div>
                <div
                  style={{
                    fontFamily: "'IBM Plex Mono', monospace",
                    fontSize: 10,
                    letterSpacing: 2,
                    textTransform: 'uppercase',
                    color: '#444',
                    marginBottom: 6,
                  }}
                >
                  Confirm Password
                </div>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={e => setConfirmPassword(e.target.value)}
                  required
                  style={{
                    width: '100%',
                    padding: '10px 0',
                    border: 'none',
                    borderBottom: '1px solid #ccc',
                    fontSize: 16,
                    fontFamily: "'Libre Baskerville', serif",
                    outline: 'none',
                    background: 'none',
                  }}
                />
              </div>

              {pwError && (
                <div
                  style={{
                    fontFamily: "'IBM Plex Mono', monospace",
                    fontSize: 11,
                    color: '#c00',
                  }}
                >
                  {pwError}
                </div>
              )}
              {pwMessage && (
                <div
                  style={{
                    fontFamily: "'IBM Plex Mono', monospace",
                    fontSize: 11,
                    color: '#1a7f37',
                  }}
                >
                  {pwMessage}
                </div>
              )}

              <div style={{ marginTop: 4 }}>
                <button
                  type="submit"
                  disabled={pwSaving || !newPassword}
                  className="action-btn action-btn-filled"
                >
                  <span>{pwSaving ? 'Updating…' : 'Set Password'}</span>
                </button>
              </div>
            </form>
          </div>
        )}

        {/* ═══ DELETE ACCOUNT ═══ */}
        {!isLoading && (
          <div
            style={{
              marginTop: 32,
              paddingTop: 28,
              borderTop: '1px solid #000',
            }}
          >


            {!showDeleteConfirm ? (
              <button
                type="button"
                onClick={() => setShowDeleteConfirm(true)}
                style={{
                  fontFamily: "'IBM Plex Mono', monospace",
                  fontSize: 10,
                  letterSpacing: 2,
                  textTransform: 'uppercase',
                  padding: '10px 22px',
                  border: '1px solid #c00',
                  background: '#fff',
                  color: '#c00',
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                }}
                onMouseEnter={e => { (e.target as HTMLButtonElement).style.background = '#c00'; (e.target as HTMLButtonElement).style.color = '#fff'; }}
                onMouseLeave={e => { (e.target as HTMLButtonElement).style.background = '#fff'; (e.target as HTMLButtonElement).style.color = '#c00'; }}
              >
                Delete Account
              </button>
            ) : (
              <div style={{ display: 'grid', gap: 12 }}>
                <div
                  style={{
                    fontFamily: "'IBM Plex Mono', monospace",
                    fontSize: 11,
                    color: '#444',
                    padding: '12px 16px',
                    background: '#fff5f5',
                    border: '1px solid #fcc',
                  }}
                >
                  Type <strong>DELETE</strong> to confirm. This will remove your account, all subscriptions, and linked OAuth data permanently.
                </div>
                <input
                  value={deleteInput}
                  onChange={e => setDeleteInput(e.target.value)}
                  placeholder="Type DELETE to confirm"
                  style={{
                    width: '100%',
                    padding: '10px 0',
                    border: 'none',
                    borderBottom: '1px solid #c00',
                    fontSize: 14,
                    fontFamily: "'IBM Plex Mono', monospace",
                    letterSpacing: 2,
                    outline: 'none',
                    background: 'none',
                    color: '#c00',
                  }}
                />
                {deleteError && (
                  <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, color: '#c00' }}>
                    {deleteError}
                  </div>
                )}
                <div style={{ display: 'flex', gap: 12 }}>
                  <button
                    type="button"
                    onClick={handleDeleteAccount}
                    disabled={deleteInput !== 'DELETE' || deleting}
                    style={{
                      fontFamily: "'IBM Plex Mono', monospace",
                      fontSize: 10,
                      letterSpacing: 2,
                      textTransform: 'uppercase',
                      padding: '10px 22px',
                      border: '1px solid #c00',
                      background: deleteInput === 'DELETE' ? '#c00' : '#eee',
                      color: deleteInput === 'DELETE' ? '#fff' : '#888',
                      cursor: deleteInput === 'DELETE' ? 'pointer' : 'not-allowed',
                      transition: 'all 0.2s',
                    }}
                  >
                    {deleting ? 'Deleting…' : 'Confirm Delete'}
                  </button>
                  <button
                    type="button"
                    onClick={() => { setShowDeleteConfirm(false); setDeleteInput(''); setDeleteError(null); }}
                    style={{
                      fontFamily: "'IBM Plex Mono', monospace",
                      fontSize: 10,
                      letterSpacing: 2,
                      textTransform: 'uppercase',
                      padding: '10px 22px',
                      border: '1px solid #ccc',
                      background: '#fff',
                      color: '#000',
                      cursor: 'pointer',
                    }}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default function ProfilePage() {
  return (
    <ProtectedRoute>
      <ProfileContent />
    </ProtectedRoute>
  );
}


