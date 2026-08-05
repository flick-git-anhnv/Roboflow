import { Routes, Route, Link, Navigate, useLocation } from 'react-router-dom';
import ProjectsPage from './pages/ProjectsPage';
import ProjectDetailPage from './pages/ProjectDetailPage';
import AnnotatorPage from './pages/AnnotatorPage';
import LoginPage from './pages/LoginPage';
import UsersPage from './pages/UsersPage';
import Logo from './components/Logo';
import { getToken, clearAuth, api } from './api';
import type { User } from './types';
import { useEffect, useState } from 'react';

// ── Auth guard ────────────────────────────────────────────────────────────────
function RequireAuth({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const token = getToken();
  if (!token) {
    return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  }
  return <>{children}</>;
}

// ── App ───────────────────────────────────────────────────────────────────────
export default function App() {
  const [user, setUser] = useState<User | null>(() => {
    try {
      const raw = sessionStorage.getItem('kztek_user');
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  });

  // Verify token on mount (in case of page refresh)
  useEffect(() => {
    const token = getToken();
    if (!token) return;
    api.getMe()
      .then((u) => {
        setUser(u);
        sessionStorage.setItem('kztek_user', JSON.stringify(u));
      })
      .catch(() => {
        clearAuth();
        setUser(null);
      });
  }, []);

  function handleLogout() {
    api.logout().finally(() => {
      setUser(null);
      window.location.replace('/login');
    });
  }

  return (
    <Routes>
      {/* Public */}
      <Route path="/login" element={<LoginPage />} />

      {/* Protected shell */}
      <Route
        path="/*"
        element={
          <RequireAuth>
            <div className="app-shell">
              <header className="topbar">
                <Link to="/" className="brand">
                  <Logo size={28} />
                  <span>KZTEK Labeling Studio</span>
                </Link>
                <span className="topbar-subtitle">Công cụ gán nhãn ảnh nội bộ</span>
                {user && (
                  <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 10 }}>
                    {user.role === 'admin' && (
                      <Link to="/users" style={{ fontSize: 13, color: '#4A3F8C', textDecoration: 'none' }}>
                        Quản lý tài khoản
                      </Link>
                    )}
                    <span style={{
                      fontSize: 13,
                      color: '#4A3F8C',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                    }}>
                      <span style={{
                        display: 'inline-block',
                        width: 10,
                        height: 10,
                        borderRadius: '50%',
                        background: user.color,
                      }} />
                      {user.display_name} ({user.role})
                    </span>
                    <button
                      onClick={handleLogout}
                      style={{
                        fontSize: 12,
                        padding: '4px 10px',
                        background: 'none',
                        border: '1px solid #ccc',
                        borderRadius: 6,
                        cursor: 'pointer',
                        color: '#666',
                      }}
                    >
                      Đăng xuất
                    </button>
                  </div>
                )}
              </header>
              <main className="app-main">
                <Routes>
                  <Route path="/" element={<ProjectsPage />} />
                  <Route path="/users" element={<UsersPage />} />
                  <Route path="/projects/:projectId" element={<ProjectDetailPage />} />
                  <Route path="/projects/:projectId/annotate/:imageId" element={<AnnotatorPage />} />
                </Routes>
              </main>
            </div>
          </RequireAuth>
        }
      />
    </Routes>
  );
}
