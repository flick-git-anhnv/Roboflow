import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { api } from '../api';
import Logo from '../components/Logo';
import { Lock, User } from 'lucide-react';

export default function LoginPage() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string })?.from || '/';

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const data = await api.login(username.trim(), password);
      // Token stored in cookie by server; also cache in sessionStorage for Bearer header
      sessionStorage.setItem('kztek_token', data.token);
      sessionStorage.setItem('kztek_user', JSON.stringify(data.user));
      window.location.replace(from);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Đăng nhập thất bại';
      if (msg.includes('AUTH_INVALID_CREDENTIALS')) {
        setError('Tên đăng nhập hoặc mật khẩu không đúng');
      } else if (msg.includes('AUTH_RATE_LIMITED')) {
        setError('Quá nhiều lần thử. Vui lòng đợi 15 phút.');
      } else if (msg.includes('AUTH_DISABLED')) {
        setError('Tài khoản đã bị vô hiệu hoá. Liên hệ admin.');
      } else {
        setError(msg);
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'var(--bg-primary)',
      color: 'var(--text-primary)',
      transition: 'background-color 0.2s ease, color 0.2s ease',
      padding: 16,
    }}>
      <div style={{
        background: 'var(--bg-card)',
        color: 'var(--text-primary)',
        borderRadius: 12,
        padding: '40px 48px',
        boxShadow: 'var(--shadow-md)',
        border: '1px solid var(--border-color)',
        width: 380,
        maxWidth: '94vw',
      }}>
        {/* Brand */}
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <Logo size={40} />
          <div style={{ marginTop: 10, fontWeight: 700, fontSize: 18, color: 'var(--text-primary)' }}>
            KZTEK Labeling Studio
          </div>
          <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 4 }}>Đăng nhập để tiếp tục</div>
        </div>

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 6 }}>
              <User size={14} color="var(--accent-color)" />
              <span>Tên đăng nhập</span>
            </label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="username"
              autoFocus
              autoComplete="username"
              required
              style={{
                width: '100%',
                padding: '10px 12px',
                border: '1.5px solid var(--border-color)',
                borderRadius: 8,
                fontSize: 15,
                color: 'var(--text-primary)',
                background: 'var(--bg-card)',
                outline: 'none',
                boxSizing: 'border-box',
              }}
            />
          </div>

          <div style={{ marginBottom: 20 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 6 }}>
              <Lock size={14} color="var(--accent-color)" />
              <span>Mật khẩu</span>
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              autoComplete="current-password"
              required
              style={{
                width: '100%',
                padding: '10px 12px',
                border: '1.5px solid var(--border-color)',
                borderRadius: 8,
                fontSize: 15,
                color: 'var(--text-primary)',
                background: 'var(--bg-card)',
                outline: 'none',
                boxSizing: 'border-box',
              }}
            />
          </div>

          {error && (
            <div style={{
              background: 'rgba(240, 89, 34, 0.1)',
              border: '1px solid var(--danger)',
              color: 'var(--danger)',
              borderRadius: 8,
              padding: '10px 14px',
              fontSize: 13,
              marginBottom: 16,
            }}>
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="btn btn-primary"
            style={{
              width: '100%',
              padding: '11px',
              fontSize: 15,
              fontWeight: 700,
              justifyContent: 'center',
            }}
          >
            {loading ? 'Đang đăng nhập...' : 'Đăng nhập'}
          </button>
        </form>
      </div>
    </div>
  );
}

