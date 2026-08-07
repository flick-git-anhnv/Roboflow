import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  FolderKanban,
  Image as ImageIcon,
  Tag,
  Users,
  CheckCircle2,
  RefreshCw,
  Clock,
  ArrowRight,
  Activity,
  AlertCircle,
  Loader2,
  ExternalLink,
  TrendingUp,
  BarChart3,
  Circle,
  PlayCircle,
  CheckCircle,
  Search,
  X,
} from 'lucide-react';
import { api, getCurrentUser } from '../api';
import type { DashboardOverview, Project, ProjectMember, ProjectStatus, RecentActivityItem } from '../types';
import KPICard from '../components/dashboard/KPICard';
import StatusDropdown from '../components/StatusDropdown';

const AUTO_REFRESH_INTERVAL = 30; // seconds

const ACTION_CONFIG: Record<string, { label: string; color: string; dot: string }> = {
  image_completed:   { label: 'Hoàn thành gán nhãn ảnh',  color: '#10B981', dot: '#10B981' },
  annotations_saved: { label: 'Lưu annotation',            color: '#6366F1', dot: '#6366F1' },
  images_uploaded:   { label: 'Tải lên ảnh mới',           color: '#3B82F6', dot: '#3B82F6' },
  project_created:   { label: 'Tạo project mới',           color: '#F59E0B', dot: '#F59E0B' },
  review_submitted:  { label: 'Gửi duyệt ảnh',             color: '#8B5CF6', dot: '#8B5CF6' },
  review_approved:   { label: 'Duyệt chấp nhận ảnh',       color: '#10B981', dot: '#10B981' },
  review_rejected:   { label: 'Từ chối duyệt ảnh',         color: '#EF4444', dot: '#EF4444' },
};

const AVATAR_COLORS = [
  '#6366F1', '#F05922', '#10B981', '#F59E0B', '#3B82F6', '#8B5CF6', '#EC4899',
];

function getAvatarColor(name: string) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h + name.charCodeAt(i)) % AVATAR_COLORS.length;
  return AVATAR_COLORS[h];
}

export const DashboardPage: React.FC = () => {
  const currentUser = getCurrentUser();
  const isAnnotator = currentUser?.role === 'annotator';
  const canEdit = !isAnnotator;
  const navigate = useNavigate();

  const [overview, setOverview] = useState<DashboardOverview | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [countdown, setCountdown] = useState<number>(AUTO_REFRESH_INTERVAL);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [search, setSearch] = useState<string>('');
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchData = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    setError(null);
    try {
      const [overviewData, projectsData] = await Promise.all([
        api.getDashboardOverview(),
        api.listProjects(),
      ]);
      setOverview(overviewData);
      setProjects(projectsData);
      setLastUpdated(new Date());
      setCountdown(AUTO_REFRESH_INTERVAL);
    } catch (err: any) {
      setError(err.message || 'Không thể tải dữ liệu trang tổng quan');
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  const startAutoRefresh = useCallback(() => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    if (countdownRef.current) clearInterval(countdownRef.current);
    countdownRef.current = setInterval(() => {
      setCountdown((prev) => (prev <= 1 ? AUTO_REFRESH_INTERVAL : prev - 1));
    }, 1000);
    intervalRef.current = setInterval(() => {
      fetchData(true);
    }, AUTO_REFRESH_INTERVAL * 1000);
  }, [fetchData]);

  useEffect(() => {
    fetchData();
    startAutoRefresh();
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      if (countdownRef.current) clearInterval(countdownRef.current);
    };
  }, [fetchData, startAutoRefresh]);

  const formatTimeAgo = (dateStr: string) => {
    try {
      const date = new Date(dateStr);
      const now = new Date();
      const diffMs = now.getTime() - date.getTime();
      const diffMins = Math.floor(diffMs / (1000 * 60));
      if (diffMins < 1) return 'Vừa xong';
      if (diffMins < 60) return `${diffMins} phút trước`;
      const diffHours = Math.floor(diffMins / 60);
      if (diffHours < 24) return `${diffHours} giờ trước`;
      return `${Math.floor(diffHours / 24)} ngày trước`;
    } catch { return dateStr; }
  };

  const filteredProjects = projects.filter(p =>
    (statusFilter === 'all' || (p.status ?? 'active') === statusFilter) &&
    p.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="db-root">

      {/* ── Header ── */}
      <div className="db-header">
        <div className="db-header-left">
          <div className="db-header-icon"><BarChart3 size={16} /></div>
          <div>
            <h1 className="db-title">Dashboard Tổng Quan</h1>
            <p className="db-subtitle">Báo cáo quy mô dữ liệu, tiến độ gán nhãn và hoạt động hệ thống</p>
          </div>
        </div>
        <div className="db-header-right">
          {lastUpdated && (
            <div className="db-refresh-badge">
              <Clock size={12} />
              <span>{lastUpdated.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
              <span className="db-countdown-dot" />
              <span className="db-countdown-text">{countdown}s</span>
            </div>
          )}
          <button
            type="button"
            className="btn btn-secondary db-refresh-btn"
            onClick={() => { fetchData(); startAutoRefresh(); }}
            disabled={loading}
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            Làm mới
          </button>
        </div>
      </div>

      {/* ── Error ── */}
      {error && (
        <div className="alert alert-error">
          <AlertCircle size={16} />
          <span>{error}</span>
        </div>
      )}

      {/* ── Loading state ── */}
      {loading && !overview ? (
        <div className="db-loading">
          <Loader2 size={32} className="animate-spin" />
          <span>Đang tải dữ liệu...</span>
        </div>
      ) : (
        <>
          {/* ── KPI Row ── */}
          <div className="db-kpi-row">
            <KPICard
              title="Tổng Dự án"
              value={overview?.totalProjects ?? projects.length}
              subtext="Dự án gán nhãn"
              icon={<FolderKanban size={16} />}
              colorScheme="primary"
            />
            <KPICard
              title="Tổng Ảnh"
              value={(overview?.totalImages ?? 0).toLocaleString()}
              subtext="Toàn bộ hệ thống"
              icon={<ImageIcon size={16} />}
              colorScheme="info"
            />
            <KPICard
              title="Tổng Annotation"
              value={(overview?.totalAnnotations ?? 0).toLocaleString()}
              subtext="Bounding boxes / Quad"
              icon={<Tag size={16} />}
              colorScheme="purple"
            />
            <KPICard
              title="Thành viên"
              value={overview?.totalUsers ?? 0}
              subtext="Tài khoản hệ thống"
              icon={<Users size={16} />}
              colorScheme="warning"
            />
            <KPICard
              title="Hoàn thành"
              value={`${overview?.globalCompletionPercent ?? 0}%`}
              subtext="Tiến độ tổng thể"
              icon={<CheckCircle2 size={16} />}
              colorScheme="success"
              trend={
                (overview?.globalCompletionPercent ?? 0) > 0
                  ? { value: 'Đang tiến triển', isPositive: true }
                  : undefined
              }
            />
          </div>

          {/* ── Main content ── */}
          <div className="db-main">

            {/* LEFT: Projects */}
            <div className="db-projects-col">
              <div className="db-section-header">
                <h2 className="db-section-title">
                  <FolderKanban size={16} />
                  Tổng quan Dự án
                  <span className="db-section-count">{projects.length}</span>
                </h2>
                <Link to="/" className="db-view-all">
                  Xem tất cả <ArrowRight size={13} />
                </Link>
              </div>

              {/* ── Filter bar: search + status tabs ── */}
              <div className="db-filter-bar">
                <div className="db-search-wrap">
                  <Search size={13} className="db-search-icon" />
                  <input
                    className="db-search-input"
                    type="text"
                    placeholder="Tìm tên dự án..."
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                  />
                  {search && (
                    <button className="db-search-clear" onClick={() => setSearch('')}>
                      <X size={12} />
                    </button>
                  )}
                </div>
                <div className="db-status-filter-tabs">
                  {[
                    { key: 'all',      label: 'Tất cả' },
                    { key: 'planning', label: 'Kế hoạch' },
                    { key: 'active',   label: 'Đang làm' },
                    { key: 'done',     label: 'Xong' },
                  ].map(tab => (
                    <button
                      key={tab.key}
                      className={`db-status-tab ${statusFilter === tab.key ? 'active' : ''}`}
                      onClick={() => setStatusFilter(tab.key)}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>
              </div>

              {filteredProjects.length === 0 ? (
                <div className="db-empty-state">
                  <FolderKanban size={36} opacity={0.3} />
                  <p>{search ? `Không tìm thấy dự án "${search}"` : projects.length === 0 ? 'Chưa có dự án nào' : 'Không có dự án nào ở trạng thái này'}</p>
                  {(search || statusFilter !== 'all') && (
                    <button className="btn btn-sm btn-outline" onClick={() => { setSearch(''); setStatusFilter('all'); }} style={{ marginTop: 8 }}>
                      Xóa bộ lọc
                    </button>
                  )}
                </div>
              ) : (
                <div className="db-project-grid">
                  {filteredProjects.map((project) => {
                    const percent = project.image_count > 0
                      ? Math.round((project.labeled_count / project.image_count) * 100)
                      : 0;
                    const progressColor =
                      percent >= 80 ? '#10B981' :
                      percent >= 40 ? '#6366F1' : '#F59E0B';

                    return (
                      <div
                        key={project.id}
                        className={`db-project-card db-card-status-${project.status ?? 'active'}`}
                        style={{ cursor: 'pointer' }}
                        onClick={() => navigate(`/projects/${project.id}`)}
                      >
                        <div className="db-project-card-body">
                          {/* Hàng 1: Tên dự án — full width */}
                          <h3 className="db-project-name">
                            <Link to={`/projects/${project.id}`} onClick={e => e.stopPropagation()}>{project.name}</Link>
                          </h3>

                          {/* Description — luôn render để giữ chiều cao cân đối */}
                          <p className="db-project-desc db-project-desc-fixed">
                            {project.description || '\u00a0'}
                          </p>

                          {/* Hàng 1: ảnh + classes */}
                          <div className="db-project-stats">
                            <div className="db-stat-chip db-stat-blue">
                              <ImageIcon size={12} />
                              <span>{project.image_count.toLocaleString()}</span>
                              <span className="db-stat-label">ảnh</span>
                            </div>
                            <div className="db-stat-chip db-stat-purple">
                              <Tag size={12} />
                              <span>{project.class_count}</span>
                              <span className="db-stat-label">classes</span>
                            </div>
                          </div>

                          {/* Hàng 2: gán nhãn + hoàn thành */}
                          <div className="db-project-stats">
                            <div className="db-stat-chip db-stat-orange">
                              <CheckCircle2 size={12} />
                              <span>{project.labeled_count.toLocaleString()}</span>
                              <span className="db-stat-label">gán nhãn</span>
                            </div>
                            <div className="db-stat-chip db-stat-green">
                              <CheckCircle2 size={12} />
                              <span>{(project.completed_count ?? 0).toLocaleString()}</span>
                              <span className="db-stat-label">hoàn thành</span>
                            </div>
                          </div>

                          {project.members && project.members.length > 0 && (
                            <div className="db-project-members">
                              <div className="db-members-label">
                                <Users size={11} />
                                Thành viên label
                              </div>
                              <div className="db-members-list">
                                {project.members.map((m: ProjectMember) => {
                                  const labeledPct = m.assigned_count > 0
                                    ? Math.min(100, Math.round((m.labeled_count / m.assigned_count) * 100))
                                    : 0;
                                  const donePct = m.assigned_count > 0
                                    ? Math.min(100, Math.round((m.done_count / m.assigned_count) * 100))
                                    : 0;
                                  return (
                                    <div key={m.user_id} className="db-member-row">
                                      <div
                                        className="db-member-avatar"
                                        title={m.display_name}
                                        style={{ background: m.color || '#6366F1' }}
                                      >
                                        {m.display_name.charAt(0).toUpperCase()}
                                      </div>
                                      <div className="db-member-body">
                                        <div className="db-member-top">
                                          <span className="db-member-name">{m.display_name}</span>
                                          <div className="db-member-badges">
                                            <span className="db-mbadge db-mbadge-done" title="Đã hoàn thành (reviewed)">
                                              <CheckCircle2 size={10} /> {m.done_count}
                                            </span>
                                            <span className="db-mbadge db-mbadge-labeled" title="Đã gán nhãn">
                                              <CheckCircle2 size={10} /> {m.labeled_count}
                                            </span>
                                            <span className="db-mbadge db-mbadge-total" title="Được giao">
                                              <ImageIcon size={10} /> {m.assigned_count}
                                            </span>
                                          </div>
                                        </div>
                                        <div className="db-member-bar-track">
                                          {/* Layer 1: labeled (mờ hơn) */}
                                          <div
                                            className="db-member-bar-fill db-member-bar-labeled"
                                            style={{ width: `${labeledPct}%`, background: m.color || '#6366F1', opacity: 0.35 }}
                                          />
                                          {/* Layer 2: done (đậm) */}
                                          <div
                                            className="db-member-bar-fill db-member-bar-done"
                                            style={{ width: `${donePct}%`, background: m.color || '#6366F1' }}
                                          />
                                        </div>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          )}

                          {/* Hàng cuối: Status badge + Progress pill */}
                          <div className="db-project-meta-row" style={{ marginTop: 'auto', paddingTop: '6px' }}>
                            {canEdit ? (
                              <StatusDropdown
                                projectId={project.id}
                                status={(project.status as ProjectStatus) ?? 'active'}
                                onChanged={(newStatus) => {
                                  setProjects(prev =>
                                    prev.map(p => p.id === project.id ? { ...p, status: newStatus } : p)
                                  );
                                }}
                              />
                            ) : (
                              <span className={`status-badge ${project.status ?? 'active'}`}>
                                {project.status === 'planning' && <><Circle size={8} fill="currentColor" /> Kế hoạch</>}
                                {project.status === 'done'     && <><CheckCircle size={8} /> Hoàn tất</>}
                                {(!project.status || project.status === 'active') && <><PlayCircle size={8} /> Đang làm</>}
                              </span>
                            )}
                            <div className="db-progress-pill" style={{ '--pill-color': progressColor } as React.CSSProperties}>
                              <span className="db-progress-pill-pct" style={{ color: progressColor }}>{percent}%</span>
                              <div className="db-progress-pill-track">
                                <div className="db-progress-pill-fill" style={{ width: `${percent}%`, background: progressColor }} />
                              </div>
                            </div>
                          </div>

                        </div>

                        <div className="db-project-footer">
                          <Link to={`/projects/${project.id}`} className="db-project-link" onClick={e => e.stopPropagation()}>
                            <TrendingUp size={13} />
                            Chi tiết & Analytics
                            <ExternalLink size={11} />
                          </Link>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* RIGHT: Activity Feed */}
            <div className="db-activity-col">
              <div className="db-section-header">
                <h2 className="db-section-title">
                  <Activity size={16} />
                  Hoạt động Gần đây
                </h2>
              </div>

              <div className="db-activity-card">
                {!overview?.recentActivity || overview.recentActivity.length === 0 ? (
                  <div className="db-activity-empty">
                    <Activity size={28} opacity={0.25} />
                    <p>Chưa có hoạt động</p>
                  </div>
                ) : (
                  <div className="db-activity-list">
                    {overview.recentActivity.map((act) => {
                      const cfg = ACTION_CONFIG[act.action] ?? { label: act.action, color: '#9E97BF', dot: '#9E97BF' };
                      const name = act.actor_name || 'Hệ thống';
                      return (
                        <div key={act.id} className="db-activity-item">
                          <div className="db-activity-timeline">
                            <div className="db-activity-dot" style={{ background: cfg.dot }} />
                            <div className="db-activity-line" />
                          </div>
                          <div className="db-activity-body">
                            <div
                              className="db-activity-avatar"
                              style={{ background: getAvatarColor(name) }}
                            >
                              {name.charAt(0).toUpperCase()}
                            </div>
                            <div className="db-activity-content">
                              <div className="db-activity-actor">{name}</div>
                              <div className="db-activity-action" style={{ color: cfg.color }}>
                                {cfg.label}
                              </div>
                              {act.project_id && (
                                <div className="db-activity-project">
                                  <FolderKanban size={10} />
                                  {act.project_id}
                                </div>
                              )}
                            </div>
                            <div className="db-activity-time">
                              <Clock size={10} />
                              {formatTimeAgo(act.created_at)}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

          </div>
        </>
      )}
    </div>
  );
};

export default DashboardPage;
