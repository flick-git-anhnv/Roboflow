import { lazy, Suspense, useEffect, useState } from 'react';
import { Routes, Route, Link, NavLink, Navigate, useLocation } from 'react-router-dom';
import Logo from './components/Logo';
import { getToken, clearAuth, api } from './api';
import type { User } from './types';
import { ThemeProvider, useTheme } from './context/ThemeContext';
import { Sun, Moon, LogOut, Users, Menu, X, User as UserIcon, LayoutDashboard, FolderKanban } from 'lucide-react';

const ProjectsPage = lazy(() => import('./pages/ProjectsPage'));
const ProjectDetailPage = lazy(() => import('./pages/ProjectDetailPage'));
const AnnotatorPage = lazy(() => import('./pages/AnnotatorPage'));
const LoginPage = lazy(() => import('./pages/LoginPage'));
const UsersPage = lazy(() => import('./pages/UsersPage'));
const DashboardPage = lazy(() => import('./pages/DashboardPage'));

function PageFallback() {
  return (
    <div className="page-loading-fallback" style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: '60vh',
      gap: '1rem',
      color: 'var(--text-secondary, #666)'
    }}>
      <div className="loading-spinner" style={{
        width: 36,
        height: 36,
        border: '3px solid var(--border-color, #ccc)',
        borderTopColor: 'var(--color-primary, #F05922)',
        borderRadius: '50%',
        animation: 'spin 0.8s linear infinite'
      }} />
      <span>Đang tải trang...</span>
    </div>
  );
}

function ThemeToggleBtn() {
  const { theme, toggleTheme } = useTheme();
  return (
    <button
      onClick={toggleTheme}
      className="theme-toggle-btn"
      title={theme === 'dark' ? 'Chuyển sang Giao diện Sáng' : 'Chuyển sang Giao diện Tối'}
      aria-label="Toggle theme"
    >
      {theme === 'dark' ? <Sun size={18} className="theme-icon sun" /> : <Moon size={18} className="theme-icon moon" />}
      <span className="theme-toggle-text">{theme === 'dark' ? 'Sáng' : 'Tối'}</span>
    </button>
  );
}

// ── Auth guard ────────────────────────────────────────────────────────────────
function RequireAuth({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const token = getToken();
  if (!token) {
    return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  }
  return <>{children}</>;
}

// ── App Shell ────────────────────────────────────────────────────────────────
function AppShell() {
  const [user, setUser] = useState<User | null>(() => {
    try {
      const raw = sessionStorage.getItem('kztek_user');
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  });
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const location = useLocation();

  // Close mobile menu on route change
  useEffect(() => {
    setMobileMenuOpen(false);
  }, [location.pathname]);

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

  const isAnnotator = location.pathname.includes('/annotate/');

  return (
    <div className={`app-shell ${isAnnotator ? 'annotator-mode' : 'has-sidebar'}`}>
      {!isAnnotator && (
        <aside className={`sidemenu ${mobileMenuOpen ? 'mobile-open' : ''}`}>
          <div className="sidemenu-brand">
            <Logo size={28} />
            <div className="brand-text">
              <span className="brand-title">KZTEK</span>
              <span className="brand-subtitle">Labeling Studio</span>
            </div>
          </div>

          <nav className="sidemenu-nav">
            <NavLink to="/" end className={({ isActive }) => `sidemenu-link ${isActive ? 'active' : ''}`}>
              <FolderKanban size={18} />
              <span>Dự án</span>
            </NavLink>

            <NavLink to="/dashboard" className={({ isActive }) => `sidemenu-link ${isActive ? 'active' : ''}`}>
              <LayoutDashboard size={18} />
              <span>Dashboard</span>
            </NavLink>

            {user && user.role === 'admin' && (
              <NavLink to="/users" className={({ isActive }) => `sidemenu-link ${isActive ? 'active' : ''}`}>
                <Users size={18} />
                <span>Quản lý tài khoản</span>
              </NavLink>
            )}
          </nav>

          <div className="sidemenu-footer">
            <ThemeToggleBtn />

            {user && (
              <div className="sidemenu-user">
                <div className="user-info">
                  <span className="user-dot" style={{ background: user.color || '#4A3F8C' }} />
                  <span className="user-name" title={user.display_name}>{user.display_name}</span>
                  <span className="user-role">{user.role}</span>
                </div>
                <button onClick={handleLogout} className="btn-sidemenu-logout" title="Đăng xuất">
                  <LogOut size={16} />
                </button>
              </div>
            )}
          </div>
        </aside>
      )}

      <div className="app-content-wrapper">
        {!isAnnotator && (
          <header className="topbar-minimal">
            <button
              className="mobile-menu-toggle"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              aria-label="Toggle navigation menu"
              style={{ display: 'none' }} /* controlled via CSS media queries */
            >
              {mobileMenuOpen ? <X size={22} /> : <Menu size={22} />}
            </button>
            <span className="topbar-subtitle">Công cụ gán nhãn ảnh nội bộ v2.0</span>
          </header>
        )}
        <main className="app-main">
          <Suspense fallback={<PageFallback />}>
            <Routes>
              <Route path="/" element={<ProjectsPage />} />
              <Route path="/dashboard" element={<DashboardPage />} />
              <Route path="/users" element={<UsersPage />} />
              <Route path="/projects/:projectId" element={<ProjectDetailPage />} />
              <Route path="/projects/:projectId/annotate/:imageId" element={<AnnotatorPage />} />
            </Routes>
          </Suspense>
        </main>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <Suspense fallback={<PageFallback />}>
        <Routes>
          {/* Public */}
          <Route path="/login" element={<LoginPage />} />

          {/* Protected shell */}
          <Route
            path="/*"
            element={
              <RequireAuth>
                <AppShell />
              </RequireAuth>
            }
          />
        </Routes>
      </Suspense>
    </ThemeProvider>
  );
}
