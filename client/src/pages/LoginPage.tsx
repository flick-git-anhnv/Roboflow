import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { api } from '../api';
import Logo from '../components/Logo';

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
      // Full reload (không dùng navigate()) để App.tsx remount và đọc lại
      // sessionStorage — nếu không, header sẽ không hiện user/nút đăng xuất
      // cho đến khi user tự F5 (App chỉ đọc user 1 lần lúc mount ban đầu).
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
      background: '#f4f4f8',
    }}>
      <div style={{
        background: '#fff',
        borderRadius: 12,
        padding: '40px 48px',
        boxShadow: '0 4px 24px rgba(37,28,83,0.10)',
        width: 360,
        maxWidth: '94vw',
      }}>
        {/* Brand */}
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <Logo size={40} />
          <div style={{ marginTop: 8, fontWeight: 700, fontSize: 18, color: '#251C53' }}>
            KZTEK Labeling Studio
          </div>
          <div style={{ fontSize: 13, color: '#888', marginTop: 4 }}>Đăng nhập để tiếp tục</div>
        </div>

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#251C53', marginBottom: 6 }}>
              Tên đăng nhập
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
                border: '1.5px solid #d0cce8',
                borderRadius: 8,
                fontSize: 15,
                color: '#251C53',
                outline: 'none',
                boxSizing: 'border-box',
              }}
            />
          </div>

          <div style={{ marginBottom: 20 }}>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#251C53', marginBottom: 6 }}>
              Mật khẩu
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
                border: '1.5px solid #d0cce8',
                borderRadius: 8,
                fontSize: 15,
                color: '#251C53',
                outline: 'none',
                boxSizing: 'border-box',
              }}
            />
          </div>

          {error && (
            <div style={{
              background: '#fff3f0',
              border: '1px solid #F05922',
              color: '#c0392b',
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
            style={{
              width: '100%',
              padding: '11px',
              background: loading ? '#ccc' : '#F05922',
              color: '#fff',
              border: 'none',
              borderRadius: 8,
              fontSize: 15,
              fontWeight: 700,
              cursor: loading ? 'not-allowed' : 'pointer',
              transition: 'background 0.2s',
            }}
          >
            {loading ? 'Đang đăng nhập...' : 'Đăng nhập'}
          </button>
        </form>
      </div>
    </div>
  );
}
