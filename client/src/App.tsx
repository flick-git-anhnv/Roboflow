import { lazy, Suspense, useEffect, useState } from 'react';
import { Routes, Route, Link, NavLink, Navigate, useLocation } from 'react-router-dom';
import Logo from './components/Logo';
import { getToken, clearAuth, api } from './api';
import type { User } from './types';
import { ThemeProvider, useTheme } from './context/ThemeContext';
import { Sun, Moon, LogOut, Users, Menu, X, User as UserIcon, LayoutDashboard, FolderKanban, ChevronLeft } from 'lucide-react';

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

  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    try {
      return localStorage.getItem('kztek_sidebar_collapsed') === 'true';
    } catch {
      return false;
    }
  });

  const handleToggleSidebar = () => {
    setSidebarCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem('kztek_sidebar_collapsed', String(next));
      } catch {}
      return next;
    });
  };

  const isAnnotator = location.pathname.includes('/annotate/');

  return (
    <div className={`app-shell ${isAnnotator ? 'annotator-mode' : 'has-sidebar'} ${sidebarCollapsed ? 'sidebar-collapsed' : ''}`}>
      {!isAnnotator && (
        <aside className={`sidemenu ${mobileMenuOpen ? 'mobile-open' : ''}`}>
          <div className="sidemenu-brand">
            <Logo size={28} />
            <div className="brand-text" style={{ flex: 1 }}>
              <span className="brand-title">KZTEK</span>
              <span className="brand-subtitle">Labeling Studio</span>
            </div>
            <button
              onClick={handleToggleSidebar}
              className="btn-collapse-sidebar"
              title="Thu gọn menu"
            >
              <ChevronLeft size={18} />
            </button>
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
              <div className="sidemenu-user-profile">
                <div className="user-profile-header">
                  <div className="user-avatar" style={{ background: user.color || '#4A3F8C' }}>
                    {user.display_name ? user.display_name.charAt(0).toUpperCase() : user.username.charAt(0).toUpperCase()}
                  </div>
                  <div className="user-details">
                    <span className="user-display-name" title={user.display_name}>{user.display_name}</span>
                    <span className="user-username">@{user.username}</span>
                    <span className={`user-role-badge role-${user.role}`}>{user.role}</span>
                  </div>
                </div>
                <button onClick={handleLogout} className="btn-sidemenu-logout-full">
                  <LogOut size={14} />
                  <span>Đăng xuất</span>
                </button>
              </div>
            )}
          </div>
        </aside>
      )}

      <div className="app-content-wrapper">
        {!isAnnotator && (
          <header className="topbar-minimal">
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <button
                className="mobile-menu-toggle"
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                aria-label="Toggle navigation menu"
                style={{ display: 'none' }} /* controlled via CSS media queries */
              >
                {mobileMenuOpen ? <X size={22} /> : <Menu size={22} />}
              </button>

              {sidebarCollapsed && (
                <button
                  className="desktop-menu-toggle"
                  onClick={handleToggleSidebar}
                  aria-label="Mở menu bên"
                  title="Mở menu bên"
                >
                  <Menu size={22} />
                </button>
              )}
            </div>
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
