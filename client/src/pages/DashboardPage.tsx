import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
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
} from 'lucide-react';
import { api } from '../api';
import type { DashboardOverview, Project, RecentActivityItem } from '../types';
import KPICard from '../components/dashboard/KPICard';

export const DashboardPage: React.FC = () => {
  const [overview, setOverview] = useState<DashboardOverview | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [overviewData, projectsData] = await Promise.all([
        api.getDashboardOverview(),
        api.listProjects(),
      ]);
      setOverview(overviewData);
      setProjects(projectsData);
    } catch (err: any) {
      setError(err.message || 'Không thể tải dữ liệu trang tổng quan');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const formatActionText = (item: RecentActivityItem) => {
    switch (item.action) {
      case 'image_completed':
        return 'Đã hoàn thành gán nhãn ảnh';
      case 'annotations_saved':
        return 'Đã lưu annotation';
      case 'images_uploaded':
        return 'Đã tải lên ảnh mới';
      case 'project_created':
        return 'Đã tạo project mới';
      case 'review_submitted':
        return 'Đã gửi duyệt ảnh';
      case 'review_approved':
        return 'Đã duyệt chấp nhận ảnh';
      case 'review_rejected':
        return 'Đã từ chối duyệt ảnh';
      default:
        return item.action;
    }
  };

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
      const diffDays = Math.floor(diffHours / 24);
      return `${diffDays} ngày trước`;
    } catch {
      return dateStr;
    }
  };

  return (
    <div className="dashboard-container">
      {/* Header */}
      <div className="dashboard-header">
        <div className="dashboard-header-titles">
          <h1>Dashboard Tổng Quan System</h1>
          <p>Báo cáo tổng hợp quy mô dữ liệu, tiến độ gán nhãn và hoạt động toàn hệ thống.</p>
        </div>
        <div className="dashboard-actions">
          <button
            type="button"
            className="btn btn-secondary"
            onClick={fetchData}
            disabled={loading}
          >
            <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
            <span>Làm mới</span>
          </button>
        </div>
      </div>

      {error && (
        <div className="alert alert-error">
          <AlertCircle size={18} />
          <span>{error}</span>
        </div>
      )}

      {loading && !overview ? (
        <div className="dashboard-loading-state">
          <Loader2 size={32} className="animate-spin" />
          <span>Đang tải dữ liệu báo cáo hệ thống...</span>
        </div>
      ) : (
        <>
          {/* Tier 1: 5 KPI Summary Cards */}
          <div className="dashboard-kpi-grid">
            <KPICard
              title="Tổng số Dự án"
              value={overview?.totalProjects ?? projects.length ?? 0}
              subtext="Dự án gán nhãn"
              icon={<FolderKanban size={24} />}
              colorScheme="primary"
            />

            <KPICard
              title="Tổng số Ảnh"
              value={(overview?.totalImages ?? 0).toLocaleString()}
              subtext="Toàn bộ hệ thống"
              icon={<ImageIcon size={24} />}
              colorScheme="info"
            />

            <KPICard
              title="Tổng Annotation"
              value={(overview?.totalAnnotations ?? 0).toLocaleString()}
              subtext="Bounding boxes / Quad"
              icon={<Tag size={24} />}
              colorScheme="purple"
            />

            <KPICard
              title="Thành viên Hoạt động"
              value={overview?.totalUsers ?? 0}
              subtext="Tài khoản trên hệ thống"
              icon={<Users size={24} />}
              colorScheme="warning"
            />

            <KPICard
              title="Tỷ lệ Hoàn thành"
              value={`${overview?.globalCompletionPercent ?? 0}%`}
              subtext="Tiến độ tổng thể"
              icon={<CheckCircle2 size={24} />}
              colorScheme="success"
            />
          </div>

          {/* Tier 2: Project Overview & Recent Activity Feed */}
          <div className="dashboard-main-grid">
            {/* Left Section: Project Overview Cards */}
            <div className="dashboard-projects-section">
              <div className="section-header">
                <h2>Tổng quan Dự án ({projects.length})</h2>
                <Link to="/" className="btn-link">
                  Xem tất cả dự án <ArrowRight size={14} />
                </Link>
              </div>

              <div className="project-cards-grid">
                {projects.map((project) => {
                  const percent = project.image_count > 0
                    ? Math.round((project.labeled_count / project.image_count) * 100)
                    : 0;

                  return (
                    <div key={project.id} className="dashboard-project-card">
                      <div className="project-card-top">
                        <h3 className="project-card-title">
                          <Link to={`/projects/${project.id}`}>{project.name}</Link>
                        </h3>
                        <span className="project-card-id">{project.id}</span>
                      </div>

                      {project.description && (
                        <p className="project-card-desc">{project.description}</p>
                      )}

                      <div className="project-card-stats-row">
                        <div className="stat-pill">
                          <ImageIcon size={13} />
                          <span>{project.image_count} ảnh</span>
                        </div>
                        <div className="stat-pill">
                          <CheckCircle2 size={13} color="#10B981" />
                          <span>{project.labeled_count} đã gán nhãn</span>
                        </div>
                        <div className="stat-pill">
                          <Tag size={13} color="#8B5CF6" />
                          <span>{project.class_count} classes</span>
                        </div>
                      </div>

                      <div className="project-progress-wrapper">
                        <div className="progress-labels">
                          <span>Tiến độ hoàn thành</span>
                          <span className="progress-pct">{percent}%</span>
                        </div>
                        <div className="progress-bar-track">
                          <div
                            className="progress-bar-fill"
                            style={{ width: `${percent}%` }}
                          />
                        </div>
                      </div>

                      <div className="project-card-footer">
                        <Link to={`/projects/${project.id}`} className="btn btn-sm btn-secondary">
                          Chi tiết & Analytics
                        </Link>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Right Section: Recent Activity List */}
            <div className="dashboard-activity-section">
              <div className="section-header">
                <h2>
                  <Activity size={18} className="icon-activity" />
                  Hoạt động Gần đây
                </h2>
              </div>

              <div className="activity-card">
                {!overview?.recentActivity || overview.recentActivity.length === 0 ? (
                  <div className="activity-empty">Chưa có nhật ký hoạt động gần đây.</div>
                ) : (
                  <div className="activity-feed">
                    {overview.recentActivity.map((act) => (
                      <div key={act.id} className="activity-item">
                        <div className="activity-avatar">
                          {(act.actor_name || 'System').charAt(0).toUpperCase()}
                        </div>
                        <div className="activity-details">
                          <div className="activity-meta">
                            <span className="actor-name">{act.actor_name || 'Hệ thống'}</span>
                            <span className="activity-time">
                              <Clock size={12} />
                              {formatTimeAgo(act.created_at)}
                            </span>
                          </div>
                          <div className="activity-action-text">{formatActionText(act)}</div>
                          {act.project_id && (
                            <div className="activity-project-tag">Project: {act.project_id}</div>
                          )}
                        </div>
                      </div>
                    ))}
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
