import React, { useEffect, useState, useCallback } from 'react';
import { X, RefreshCw, AlertCircle, BarChart2, Users, Calendar, Download } from 'lucide-react';
import { api } from '../api';
import type { ProjectDashboardData, UserReportItem, TimelineReportItem } from '../types';
import ClassDistributionChart from './dashboard/ClassDistributionChart';
import DatasetSplitBreakdown from './dashboard/DatasetSplitBreakdown';
import AnnotationTimelineChart from './dashboard/AnnotationTimelineChart';
import AnnotatorProductivityChart from './dashboard/AnnotatorProductivityChart';
import ReportExportControls from './dashboard/ReportExportControls';

export default function StatsPanel({ projectId, labelType, onClose }: { projectId: string; labelType?: string; onClose: () => void }) {
  const [dashboard, setDashboard] = useState<ProjectDashboardData | null>(null);
  const [userReports, setUserReports] = useState<UserReportItem[]>([]);
  const [timeline, setTimeline] = useState<TimelineReportItem[]>([]);
  const [days, setDays] = useState<number>(30);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'overview' | 'timeline' | 'team'>('overview');

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [dashData, usersData, timelineData] = await Promise.all([
        api.getProjectDashboard(projectId),
        api.getProjectUserReports(projectId),
        api.getProjectTimelineReports(projectId, days),
      ]);
      setDashboard(dashData);
      setUserReports(usersData);
      setTimeline(timelineData);
    } catch (err: any) {
      setError(err.message || 'Không thể tải thống kê dự án');
    } finally {
      setLoading(false);
    }
  }, [projectId, days]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal stats-modal stats-modal-large"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: '1000px', width: '92vw', maxHeight: '90vh', overflowY: 'auto' }}
      >
        <div className="stats-modal-header">
          <div className="stats-modal-title">
            <h2>📊 Thống kê & Báo cáo Analytics</h2>
            <span className="stats-project-id">ID: {projectId}</span>
          </div>

          <div className="stats-modal-actions">
            <button
              type="button"
              className="btn btn-secondary btn-icon"
              onClick={loadData}
              title="Làm mới dữ liệu"
              disabled={loading}
            >
              <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
            </button>
            <button
              type="button"
              className="btn btn-secondary btn-icon"
              onClick={onClose}
              title="Đóng"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {error && (
          <div className="alert alert-error my-3">
            <AlertCircle size={16} />
            <span>{error}</span>
          </div>
        )}

        {loading && !dashboard ? (
          <div className="modal-loading-state p-6 text-center">
            <RefreshCw size={28} className="animate-spin mb-2" />
            <p>Đang tổng hợp dữ liệu thống kê...</p>
          </div>
        ) : dashboard ? (
          <div className="stats-modal-body">
            {/* Top KPI Summary Tiles */}
            <div className="stat-tiles my-4">
              <StatTile label="Tổng số ảnh" value={dashboard.totalImages} />
              <StatTile label="Đã gán nhãn" value={dashboard.labeledImages} accent="success" />
              <StatTile label="Chưa gán nhãn" value={dashboard.unlabeledImages} accent="warn" />
              <StatTile label="Tổng Annotation" value={dashboard.totalAnnotations} />
              <StatTile label="Đã hoàn thành" value={dashboard.completedImages} accent="success" />
            </div>

            {/* Export Controls Widget */}
            <div className="my-4">
              <ReportExportControls projectId={projectId} />
            </div>

            {/* Modal Tabs Navigation */}
            <div className="stats-modal-tabs my-4">
              <button
                type="button"
                className={`tab-btn ${activeTab === 'overview' ? 'active' : ''}`}
                onClick={() => setActiveTab('overview')}
              >
                <BarChart2 size={16} />
                <span>{labelType === 'text_rec' ? 'Tần suất Ký tự & Split' : 'Phân bố Class & Split'}</span>
              </button>
              <button
                type="button"
                className={`tab-btn ${activeTab === 'timeline' ? 'active' : ''}`}
                onClick={() => setActiveTab('timeline')}
              >
                <Calendar size={16} />
                <span>Tiến độ Theo Thời gian</span>
              </button>
              <button
                type="button"
                className={`tab-btn ${activeTab === 'team' ? 'active' : ''}`}
                onClick={() => setActiveTab('team')}
              >
                <Users size={16} />
                <span>Năng suất Thành viên</span>
              </button>
            </div>

            {/* Tab Contents */}
            <div className="stats-tab-content">
              {activeTab === 'overview' && (
                <div className="stats-overview-grid">
                  <div className="grid-col-left" style={{ minWidth: 0 }}>
                    <ClassDistributionChart data={dashboard.datasetBalance.perClass} labelType={labelType} />
                  </div>
                  <div className="grid-col-right" style={{ minWidth: 0 }}>
                    <DatasetSplitBreakdown bySplit={dashboard.datasetBalance.bySplit} />
                  </div>
                </div>
              )}

              {activeTab === 'timeline' && (
                <div className="stats-timeline-view">
                  <AnnotationTimelineChart
                    data={timeline}
                    days={days}
                    onDaysChange={(d) => setDays(d)}
                  />
                </div>
              )}

              {activeTab === 'team' && (
                <div className="stats-team-view">
                  <AnnotatorProductivityChart data={userReports.length > 0 ? userReports : dashboard.userProductivity} />
                </div>
              )}
            </div>
          </div>
        ) : null}

        <div className="modal-actions mt-4">
          <button className="btn btn-outline" onClick={onClose}>
            Đóng
          </button>
        </div>
      </div>
    </div>
  );
}

function StatTile({
  label,
  value,
  accent,
  small,
}: {
  label: string;
  value: number;
  accent?: 'success' | 'warn';
  small?: boolean;
}) {
  return (
    <div className={`stat-tile ${small ? 'small' : ''}`}>
      <span className={`stat-tile-value ${accent || ''}`}>{value.toLocaleString()}</span>
      <span className="stat-tile-label">{label}</span>
    </div>
  );
}
