'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, setToken } from './lib/api';

export default function Login() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function submit(e) {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const res = await api('/api/login', {
        method: 'POST',
        body: JSON.stringify({ username, password }),
      });
      if (res.token) {
        setToken(res.token);
        router.push('/dashboard');
      } else setError(res.error || 'Login failed');
    } catch (e) { setError(e.message); }
    setLoading(false);
  }

  return (
    <div style={{
      display: 'flex', justifyContent: 'center', alignItems: 'center',
      minHeight: '100vh',
    }}>
      <form onSubmit={submit} className="card" style={{ width: 380 }}>
        <h1 style={{ textAlign: 'center', marginBottom: 20, fontSize: 20 }}>
          <i className="fas fa-server" style={{ color: '#1f6feb', marginRight: 8 }} />
          VPS Bot Panel
        </h1>
        {error && (
          <div style={{
            color: '#cf222e', background: '#ffebe9',
            padding: 10, borderRadius: 6, marginBottom: 12, fontSize: 13,
          }}>
            <i className="fas fa-exclamation-circle" /> {error}
          </div>
        )}
        <label style={{ fontSize: 12, color: '#57606a' }}>Username</label>
        <input value={username} onChange={e => setUsername(e.target.value)}
          style={{ marginBottom: 12, marginTop: 4 }} />
        <label style={{ fontSize: 12, color: '#57606a' }}>Password</label>
        <input type="password" value={password} onChange={e => setPassword(e.target.value)}
          style={{ marginBottom: 16, marginTop: 4 }} />
        <button className="primary" style={{ width: '100%' }} disabled={loading}>
          <i className="fas fa-sign-in-alt" /> {loading ? 'Signing in...' : 'Sign In'}
        </button>
      </form>
    </div>
  );
        }
