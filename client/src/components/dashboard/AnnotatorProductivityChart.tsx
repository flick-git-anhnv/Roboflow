import React, { useState, useMemo } from 'react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  CartesianGrid,
} from 'recharts';
import { useTheme } from '../../context/ThemeContext';
import { UserCheck, Image as ImageIcon, Tag, Zap, Search, ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react';

export interface ProductivityUser {
  userId: number;
  username: string;
  displayName: string;
  role?: string;
  imagesUploaded?: number;
  imagesCompleted?: number;
  annotationsCreated?: number;
  annotationsCount?: number;
  speedAvg?: number;
}

export interface AnnotatorProductivityChartProps {
  data?: ProductivityUser[] | null;
  title?: string;
}

export type SortKey = 'name' | 'role' | 'uploaded' | 'completed' | 'annotations' | 'speed';

export const AnnotatorProductivityChart: React.FC<AnnotatorProductivityChartProps> = ({
  data = [],
  title = 'Năng suất Gán nhãn theo Thành viên',
}) => {
  const { theme } = useTheme();
  const isDark = theme === 'dark';

  const axisColor = isDark ? '#9E97BF' : '#666666';
  const gridColor = isDark ? '#332D4D' : '#EBEAFA';
  const tooltipBg = isDark ? '#201C36' : '#FFFFFF';
  const tooltipBorder = isDark ? '#332D4D' : '#CBCBCB';
  const tooltipTextColor = isDark ? '#ECE9FA' : '#1C1A2E';

  // Search, filter, and sorting states
  const [search, setSearch] = useState<string>('');
  const [roleFilter, setRoleFilter] = useState<string>('all');
  const [sortKey, setSortKey] = useState<SortKey>('completed');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('desc');
    }
  };

  // Processed (filtered + sorted) user data
  const processedData = useMemo(() => {
    const userList = Array.isArray(data) ? data : [];
    let result = [...userList];

    // 1. Search filter
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(
        (u) =>
          (u?.displayName && u.displayName.toLowerCase().includes(q)) ||
          (u?.username && u.username.toLowerCase().includes(q))
      );
    }

    // 2. Role filter
    if (roleFilter !== 'all') {
      result = result.filter((u) => (u?.role || 'annotator') === roleFilter);
    }

    // 3. Sorting
    result.sort((a, b) => {
      let valA: any;
      let valB: any;

      const annA = a?.annotationsCreated ?? a?.annotationsCount ?? 0;
      const annB = b?.annotationsCreated ?? b?.annotationsCount ?? 0;
      const compA = a?.imagesCompleted ?? 0;
      const compB = b?.imagesCompleted ?? 0;

      switch (sortKey) {
        case 'name':
          valA = (a?.displayName || a?.username || '').toLowerCase();
          valB = (b?.displayName || b?.username || '').toLowerCase();
          break;
        case 'role':
          valA = a?.role || 'annotator';
          valB = b?.role || 'annotator';
          break;
        case 'uploaded':
          valA = a?.imagesUploaded ?? 0;
          valB = b?.imagesUploaded ?? 0;
          break;
        case 'completed':
          valA = compA;
          valB = compB;
          break;
        case 'annotations':
          valA = annA;
          valB = annB;
          break;
        case 'speed':
          valA = a?.speedAvg ?? (compA > 0 ? Math.round((annA / compA) * 10) / 10 : 0);
          valB = b?.speedAvg ?? (compB > 0 ? Math.round((annB / compB) * 10) / 10 : 0);
          break;
        default:
          valA = 0;
          valB = 0;
      }

      if (valA < valB) return sortDir === 'asc' ? -1 : 1;
      if (valA > valB) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });

    return result;
  }, [data, search, roleFilter, sortKey, sortDir]);

  // Totals & Averages calculation
  const totals = useMemo(() => {
    const totalUploaded = processedData.reduce((acc, u) => acc + (u?.imagesUploaded ?? 0), 0);
    const totalCompleted = processedData.reduce((acc, u) => acc + (u?.imagesCompleted ?? 0), 0);
    const totalAnnotations = processedData.reduce(
      (acc, u) => acc + (u?.annotationsCreated ?? u?.annotationsCount ?? 0),
      0
    );
    const avgSpeed = totalCompleted > 0 ? Math.round((totalAnnotations / totalCompleted) * 10) / 10 : 0;

    return { totalUploaded, totalCompleted, totalAnnotations, avgSpeed };
  }, [processedData]);

  // Format data for Recharts
  const chartData = processedData.slice(0, 15).map((u) => ({
    name: u?.displayName || u?.username || 'User',
    annotations: u?.annotationsCreated ?? u?.annotationsCount ?? 0,
    completed: u?.imagesCompleted ?? 0,
    uploaded: u?.imagesUploaded ?? 0,
    speedAvg:
      u?.speedAvg ??
      (u?.imagesCompleted && u.imagesCompleted > 0
        ? Math.round(((u?.annotationsCreated ?? u?.annotationsCount ?? 0) / u.imagesCompleted) * 10) / 10
        : 0),
  }));

  const renderSortIcon = (key: SortKey) => {
    if (sortKey !== key) return <ArrowUpDown size={12} className="sort-icon-idle" />;
    return sortDir === 'asc' ? <ArrowUp size={12} /> : <ArrowDown size={12} />;
  };

  return (
    <div className="dashboard-productivity-container">
      {/* Chart Section */}
      <div className="chart-card mb-4">
        <div className="chart-card-header">
          <h3 className="chart-card-title">{title}</h3>
        </div>
        {!data || !Array.isArray(data) || data.length === 0 ? (
          <div className="chart-empty">Chưa có dữ liệu năng suất thành viên.</div>
        ) : (
          <div className="chart-body" style={{ width: '100%', height: 280, minHeight: 280 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 10, right: 20, left: 0, bottom: 25 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={gridColor} />
                <XAxis
                  dataKey="name"
                  stroke={axisColor}
                  tick={{ fill: axisColor, fontSize: 12 }}
                  interval={0}
                />
                <YAxis stroke={axisColor} tick={{ fill: axisColor, fontSize: 12 }} allowDecimals={false} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: tooltipBg,
                    borderColor: tooltipBorder,
                    borderRadius: '8px',
                    color: tooltipTextColor,
                    boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                  }}
                  itemStyle={{ color: tooltipTextColor }}
                  labelStyle={{ fontWeight: 600, color: tooltipTextColor }}
                />
                <Legend
                  wrapperStyle={{ color: axisColor, fontSize: 12, paddingTop: 8 }}
                  formatter={(value) => {
                    if (value === 'annotations') return 'Annotation đã tạo';
                    if (value === 'completed') return 'Ảnh đã hoàn thành';
                    if (value === 'uploaded') return 'Ảnh đã tải lên';
                    return value;
                  }}
                />
                <Bar dataKey="annotations" fill="#F05922" radius={[4, 4, 0, 0]} name="annotations" />
                <Bar dataKey="completed" fill="#10B981" radius={[4, 4, 0, 0]} name="completed" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* Table Section */}
      <div className="dashboard-table-card">
        <div className="table-toolbar">
          <div className="table-header-title">
            <h4 style={{ margin: 0 }}>Bảng Chi tiết Năng suất Thành viên ({processedData.length})</h4>
          </div>
          <div className="table-controls">
            <div className="search-input-wrapper">
              <Search size={14} className="search-icon" />
              <input
                type="text"
                placeholder="Tìm tên / username..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="table-search-input"
              />
            </div>
            <select
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value)}
              className="table-role-select"
            >
              <option value="all">Tất cả vai trò</option>
              <option value="annotator">Annotator</option>
              <option value="reviewer">Reviewer</option>
              <option value="admin">Admin</option>
            </select>
          </div>
        </div>

        <div className="table-responsive">
          <table className="dashboard-table">
            <thead>
              <tr>
                <th onClick={() => handleSort('name')} className="sortable-th">
                  Thành viên {renderSortIcon('name')}
                </th>
                <th onClick={() => handleSort('role')} className="sortable-th">
                  Vai trò {renderSortIcon('role')}
                </th>
                <th onClick={() => handleSort('uploaded')} className="sortable-th text-center">
                  <ImageIcon size={13} style={{ display: 'inline', marginRight: 4 }} />
                  Ảnh Upload {renderSortIcon('uploaded')}
                </th>
                <th onClick={() => handleSort('completed')} className="sortable-th text-center">
                  <UserCheck size={13} style={{ display: 'inline', marginRight: 4 }} />
                  Ảnh Xong {renderSortIcon('completed')}
                </th>
                <th onClick={() => handleSort('annotations')} className="sortable-th text-center">
                  <Tag size={13} style={{ display: 'inline', marginRight: 4 }} />
                  Annotations {renderSortIcon('annotations')}
                </th>
                <th onClick={() => handleSort('speed')} className="sortable-th text-center">
                  <Zap size={13} style={{ display: 'inline', marginRight: 4 }} />
                  Tốc độ trung bình {renderSortIcon('speed')}
                </th>
              </tr>
            </thead>
            <tbody>
              {processedData.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center py-4 text-muted">
                    Không tìm thấy thành viên nào khớp bộ lọc.
                  </td>
                </tr>
              ) : (
                processedData.map((user, index) => {
                  const annCount = user?.annotationsCreated ?? user?.annotationsCount ?? 0;
                  const completed = user?.imagesCompleted ?? 0;
                  const speed =
                    user?.speedAvg ?? (completed > 0 ? Math.round((annCount / completed) * 10) / 10 : 0);

                  const displayName = user?.displayName || user?.username || 'User';
                  const avatarChar = (user?.displayName || user?.username || 'User').charAt(0).toUpperCase();

                  return (
                    <tr key={user?.userId ?? index}>
                      <td>
                        <div className="user-table-cell">
                          <span className="user-avatar-badge">
                            {avatarChar}
                          </span>
                          <div className="user-details">
                            <span className="user-name">{displayName}</span>
                            <span className="user-sub">@{user?.username || 'unknown'}</span>
                          </div>
                        </div>
                      </td>
                      <td>
                        <span className={`role-badge role-${user?.role || 'annotator'}`}>
                          {user?.role || 'annotator'}
                        </span>
                      </td>
                      <td className="text-center">{user?.imagesUploaded ?? 0}</td>
                      <td className="text-center">{completed}</td>
                      <td className="text-center font-semibold">{annCount}</td>
                      <td className="text-center">
                        <span className="speed-badge">{speed} box/ảnh</span>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
            {processedData.length > 0 && (
              <tfoot>
                <tr className="table-footer-row">
                  <td colSpan={2}>
                    <b>Tổng cộng / Trung bình:</b>
                  </td>
                  <td className="text-center">
                    <b>{totals.totalUploaded}</b>
                  </td>
                  <td className="text-center">
                    <b>{totals.totalCompleted}</b>
                  </td>
                  <td className="text-center font-semibold">
                    <b>{totals.totalAnnotations}</b>
                  </td>
                  <td className="text-center">
                    <span className="speed-badge-total">{totals.avgSpeed} box/ảnh</span>
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
    </div>
  );
};

export default AnnotatorProductivityChart;

