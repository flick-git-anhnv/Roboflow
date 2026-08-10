# Technical Specification & Analysis Report: Project Reports & Export UI Structure
**Milestone 3 — Task 3: Dashboard Overview & Reports UI**
**Agent**: Explorer (`explorer_m3_3`)
**Date**: 2026-08-06

---

## 1. Executive Summary

This report establishes the comprehensive UI specification, component architecture, data flow, export handler code snippets, CSS styling system, and test strategy for the **Project Reports & Export Functionality** in Roboflow (Milestone 3, Task 3).

The implementation leverages existing backend endpoints (`server/src/routes/dashboard.js`), extends client API services (`client/src/api.ts`), and builds upon existing React components (`ReportExportControls.tsx`, `AnnotatorProductivityChart.tsx`, `StatsPanel.tsx`) and CSS variables (`styles.css`).

---

## 2. Backend API Endpoint Architecture

### 2.1 Endpoint Contract
* **URL**: `GET /api/projects/:projectId/reports/export`
* **Query Parameter**: `format` (`csv` | `json`), default is `csv`.
* **Authentication**: Requires valid JWT token (passed via httpOnly cookie or `Authorization: Bearer <token>` header).

### 2.2 Response Headers & Formats

#### A. CSV Format (`format=csv`)
* **Header**: `Content-Type: text/csv; charset=utf-8`
* **Header**: `Content-Disposition: attachment; filename="report_${projectId}_${timestamp}.csv"`
* **Payload Structure**:
  ```csv
  # Project Report: Project Alpha (proj_123)
  # Exported At: 2026-08-06T02:04:13.000Z

  [User Productivity Report]
  User ID,Username,Display Name,Role,Images Uploaded,Images Completed,Annotations Count
  "1","admin","System Admin","admin",15,25,180
  "2","annotator1","Nguyen Van A","annotator",0,12,95

  [Timeline Summary Report]
  Date,Images Added,Images Completed
  "2026-08-01",10,5
  "2026-08-02",15,12
  ```

#### B. JSON Format (`format=json`)
* **Header**: `Content-Type: application/json`
* **Header**: `Content-Disposition: attachment; filename="report_${projectId}_${timestamp}.json"`
* **Payload Structure**:
  ```json
  {
    "project": {
      "id": "proj_123",
      "name": "Project Alpha"
    },
    "exportedAt": "2026-08-06T02:04:13.000Z",
    "userProductivity": [
      {
        "userId": 1,
        "username": "admin",
        "displayName": "System Admin",
        "role": "admin",
        "imagesUploaded": 15,
        "imagesCompleted": 25,
        "annotationsCount": 180
      }
    ],
    "timeline": [
      {
        "date": "2026-08-01",
        "imagesAdded": 10,
        "imagesCompleted": 5
      }
    ]
  }
  ```

### 2.3 Status & Error Codes
| Code | Condition | Response Body |
|---|---|---|
| `200 OK` | Report generated successfully | File blob stream (CSV or JSON) |
| `401 Unauthorized` | Missing or invalid auth token | `{ "error": "AUTH_REQUIRED" }` |
| `404 Not Found` | Project ID does not exist | `{ "error": "Không tìm thấy project" }` |
| `500 Server Error` | Database query or serialization failure | `{ "error": "<error_message>" }` |

---

## 3. Client File Download Handler Specification

### 3.1 Download Mechanism
The client fetches the export blob asynchronously, creates an ephemeral object URL via `URL.createObjectURL(blob)`, injects a temporary `<a>` element into the DOM, programmatically triggers `.click()`, and cleans up the URL object with `URL.revokeObjectURL(url)`.

### 3.2 Code Snippet: `downloadReport` Handler (`client/src/api.ts`)
```typescript
/**
 * Triggers browser blob download for CSV/JSON project reports.
 * Includes authentication headers and handles error responses gracefully.
 */
downloadReport: async (
  projectId: string,
  format: 'csv' | 'json' = 'csv',
  projectName = 'project'
): Promise<void> => {
  const token = getToken();
  const headers: Record<string, string> = {};
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetch(
    `/api/projects/${projectId}/reports/export?format=${format}`,
    {
      credentials: 'include',
      headers,
    }
  );

  if (!res.ok) {
    let errorMsg = 'Không thể tải file báo cáo';
    try {
      const errData = await res.json();
      if (errData.error) errorMsg = errData.error;
    } catch (_) {
      /* ignore JSON parse failure on non-200 responses */
    }
    throw new Error(errorMsg);
  }

  const blob = await res.blob();
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  const safeProjectName = projectName.replace(/[^a-z0-9_-]/gi, '_');
  a.download = `report_${safeProjectName}_${Date.now()}.${format}`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.URL.revokeObjectURL(url);
}
```

### 3.3 UI Integration: `ReportExportControls.tsx`
```tsx
import React, { useState } from 'react';
import { Download, FileSpreadsheet, FileCode, Loader2 } from 'lucide-react';
import { api } from '../../api';

export interface ReportExportControlsProps {
  projectId: string;
  projectName?: string;
  onExport?: (format: 'csv' | 'json') => Promise<void> | void;
}

export const ReportExportControls: React.FC<ReportExportControlsProps> = ({
  projectId,
  projectName = 'project',
  onExport,
}) => {
  const [downloadingFormat, setDownloadingFormat] = useState<'csv' | 'json' | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleDownload = async (format: 'csv' | 'json') => {
    setDownloadingFormat(format);
    setErrorMsg(null);
    try {
      if (onExport) {
        await onExport(format);
      } else {
        await api.downloadReport(projectId, format, projectName);
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Lỗi khi tải báo cáo');
    } finally {
      setDownloadingFormat(null);
    }
  };

  return (
    <div className="report-export-controls-card">
      <div className="report-export-header">
        <div className="report-export-title">
          <Download size={18} className="export-icon" />
          <span>Xuất Báo Cáo & Thống Kê</span>
        </div>
        <p className="report-export-sub">
          Tải về danh sách năng suất gán nhãn của từng thành viên và lịch sử tiến độ dự án.
        </p>
      </div>

      {errorMsg && <div className="export-error-msg">{errorMsg}</div>}

      <div className="report-export-buttons">
        <button
          type="button"
          className="btn btn-secondary btn-export"
          disabled={downloadingFormat !== null}
          onClick={() => handleDownload('csv')}
        >
          {downloadingFormat === 'csv' ? (
            <Loader2 size={16} className="animate-spin" />
          ) : (
            <FileSpreadsheet size={16} color="#10B981" />
          )}
          <span>Xuất CSV</span>
        </button>

        <button
          type="button"
          className="btn btn-secondary btn-export"
          disabled={downloadingFormat !== null}
          onClick={() => handleDownload('json')}
        >
          {downloadingFormat === 'json' ? (
            <Loader2 size={16} className="animate-spin" />
          ) : (
            <FileCode size={16} color="#3B82F6" />
          )}
          <span>Xuất JSON</span>
        </button>
      </div>
    </div>
  );
};
```

---

## 4. User Productivity Summary Table Specification (Sorting & Filtering)

### 4.1 Enhanced Component Architecture
The member productivity component (`AnnotatorProductivityChart.tsx` & productivity table view) displays both a graphical comparison bar chart and an interactive, sortable, filterable data table.

### 4.2 State Specification
* `searchQuery: string`: Search by username or display name.
* `roleFilter: 'all' | 'annotator' | 'reviewer' | 'admin'`: Filter by user role.
* `sortColumn: SortKey`: Standardized sort key (`'displayName'`, `'role'`, `'imagesUploaded'`, `'imagesCompleted'`, `'annotationsCount'`, `'speedAvg'`).
* `sortDirection: 'asc' | 'desc'`: Toggles sort direction.

### 4.3 Speed Metric Definition
$$\text{speedAvg} = \begin{cases} \text{Math.round}\left(\frac{\text{annotationsCount}}{\text{imagesCompleted}} \times 10\right) / 10 & \text{if } \text{imagesCompleted} > 0 \\ 0 & \text{otherwise} \end{cases}$$
* **Unit**: `box/ảnh`

### 4.4 Proposed Table Component Implementation (`ProductivitySummaryTable.tsx`)
```tsx
import React, { useState, useMemo } from 'react';
import { UserCheck, Image as ImageIcon, Tag, Zap, ArrowUpDown, ArrowUp, ArrowDown, Search, Filter } from 'lucide-react';
import type { UserReportItem } from '../../types';

export type SortKey = 'name' | 'role' | 'uploaded' | 'completed' | 'annotations' | 'speed';

export interface ProductivitySummaryTableProps {
  data: UserReportItem[];
}

export const ProductivitySummaryTable: React.FC<ProductivitySummaryTableProps> = ({ data }) => {
  const [search, setSearch] = useState('');
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

  const processedData = useMemo(() => {
    let result = [...data];

    // 1. Search Filter
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(
        (u) =>
          u.displayName.toLowerCase().includes(q) ||
          u.username.toLowerCase().includes(q)
      );
    }

    // 2. Role Filter
    if (roleFilter !== 'all') {
      result = result.filter((u) => u.role === roleFilter);
    }

    // 3. Sorting
    result.sort((a, b) => {
      let valA: any;
      let valB: any;

      switch (sortKey) {
        case 'name':
          valA = (a.displayName || a.username).toLowerCase();
          valB = (b.displayName || b.username).toLowerCase();
          break;
        case 'role':
          valA = a.role || '';
          valB = b.role || '';
          break;
        case 'uploaded':
          valA = a.imagesUploaded || 0;
          valB = b.imagesUploaded || 0;
          break;
        case 'completed':
          valA = a.imagesCompleted || 0;
          valB = b.imagesCompleted || 0;
          break;
        case 'annotations':
          valA = a.annotationsCount || 0;
          valB = b.annotationsCount || 0;
          break;
        case 'speed':
          valA = a.speedAvg || 0;
          valB = b.speedAvg || 0;
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

  // Totals calculation
  const totals = useMemo(() => {
    const totalUploaded = processedData.reduce((acc, u) => acc + (u.imagesUploaded || 0), 0);
    const totalCompleted = processedData.reduce((acc, u) => acc + (u.imagesCompleted || 0), 0);
    const totalAnnotations = processedData.reduce((acc, u) => acc + (u.annotationsCount || 0), 0);
    const avgSpeed = totalCompleted > 0 ? Math.round((totalAnnotations / totalCompleted) * 10) / 10 : 0;
    return { totalUploaded, totalCompleted, totalAnnotations, avgSpeed };
  }, [processedData]);

  const renderSortIcon = (key: SortKey) => {
    if (sortKey !== key) return <ArrowUpDown size={12} className="sort-icon-idle" />;
    return sortDir === 'asc' ? <ArrowUp size={12} /> : <ArrowDown size={12} />;
  };

  return (
    <div className="dashboard-table-card">
      <div className="table-toolbar">
        <div className="table-header-title">
          <h4>Bảng Chi tiết Năng suất Thành viên ({processedData.length})</h4>
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
                Tốc độ {renderSortIcon('speed')}
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
              processedData.map((user) => (
                <tr key={user.userId}>
                  <td>
                    <div className="user-table-cell">
                      <span className="user-avatar-badge">
                        {(user.displayName || user.username).charAt(0).toUpperCase()}
                      </span>
                      <div className="user-details">
                        <span className="user-name">{user.displayName || user.username}</span>
                        <span className="user-sub">@{user.username}</span>
                      </div>
                    </div>
                  </td>
                  <td>
                    <span className={`role-badge role-${user.role || 'annotator'}`}>
                      {user.role || 'annotator'}
                    </span>
                  </td>
                  <td className="text-center">{user.imagesUploaded}</td>
                  <td className="text-center">{user.imagesCompleted}</td>
                  <td className="text-center font-semibold">{user.annotationsCount}</td>
                  <td className="text-center">
                    <span className="speed-badge">{user.speedAvg} box/ảnh</span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
          {processedData.length > 0 && (
            <tfoot>
              <tr className="table-footer-row">
                <td colSpan={2}><b>Tổng cộng / Trung bình:</b></td>
                <td className="text-center"><b>{totals.totalUploaded}</b></td>
                <td className="text-center"><b>{totals.totalCompleted}</b></td>
                <td className="text-center font-semibold"><b>{totals.totalAnnotations}</b></td>
                <td className="text-center">
                  <span className="speed-badge-total">{totals.avgSpeed} box/ảnh</span>
                </td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
};
```

---

## 5. Responsive Layout & Dark Mode CSS Specifications

### 5.1 CSS Custom Properties (Tokens)
All report UI components adhere strict styling compliance to design system variables defined in `client/src/styles.css`:

```css
/* Theme Mapping */
:root {
  --bg-primary: #F6F5FB;
  --bg-secondary: #EBEAFA;
  --bg-card: #FFFFFF;
  --text-primary: #1C1A2E;
  --text-secondary: #666666;
  --border-color: #CBCBCB;
  --accent-color: #F05922;
  --shadow-sm: 0 1px 3px rgba(0, 0, 0, 0.08);
  --shadow-md: 0 4px 14px rgba(37, 28, 83, 0.12);
}

[data-theme="dark"], .dark {
  --bg-primary: #110F1D;
  --bg-secondary: #1A162B;
  --bg-card: #201C36;
  --text-primary: #ECE9FA;
  --text-secondary: #9E97BF;
  --border-color: #332D4D;
  --accent-color: #FF6B35;
  --shadow-sm: 0 1px 3px rgba(0, 0, 0, 0.4);
  --shadow-md: 0 4px 16px rgba(0, 0, 0, 0.5);
}
```

### 5.2 Responsive CSS Enhancements (`styles.css`)
```css
/* Table Controls Toolbar */
.table-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 14px;
  flex-wrap: wrap;
}

.table-controls {
  display: flex;
  align-items: center;
  gap: 10px;
}

.search-input-wrapper {
  position: relative;
  display: flex;
  align-items: center;
}

.search-input-wrapper .search-icon {
  position: absolute;
  left: 10px;
  color: var(--text-secondary);
}

.table-search-input {
  padding: 6px 10px 6px 30px;
  border-radius: 6px;
  border: 1px solid var(--border-color);
  background: var(--bg-primary);
  color: var(--text-primary);
  font-size: 12.5px;
  width: 180px;
  transition: border-color 0.2s ease;
}

.table-search-input:focus {
  outline: none;
  border-color: var(--accent-color);
}

.table-role-select {
  padding: 6px 10px;
  border-radius: 6px;
  border: 1px solid var(--border-color);
  background: var(--bg-primary);
  color: var(--text-primary);
  font-size: 12.5px;
}

/* Sortable Headers */
.sortable-th {
  cursor: pointer;
  user-select: none;
  transition: background-color 0.15s ease;
}

.sortable-th:hover {
  background: var(--border-color);
  color: var(--text-primary);
}

.sort-icon-idle {
  opacity: 0.4;
}

/* Table Footer Row */
.table-footer-row td {
  background: var(--bg-secondary);
  border-top: 2px solid var(--border-color);
  font-size: 13px;
  color: var(--text-primary);
}

/* Responsive Media Queries */
@media (max-width: 768px) {
  .report-export-controls-card {
    flex-direction: column;
    align-items: flex-start;
  }
  
  .report-export-buttons {
    width: 100%;
    justify-content: stretch;
  }
  
  .btn-export {
    flex: 1;
    justify-content: center;
  }

  .table-toolbar {
    flex-direction: column;
    align-items: stretch;
  }

  .table-controls {
    flex-direction: column;
    align-items: stretch;
  }

  .table-search-input {
    width: 100%;
  }

  .table-responsive {
    overflow-x: auto;
    -webkit-overflow-scrolling: touch;
  }
}
```

---

## 6. Error Handling & Edge Cases

1. **Empty State Handling**:
   - If `userProductivity` array is empty, render `"Chưa có dữ liệu năng suất thành viên."` notification.
   - If search query yields zero matches, render `"Không tìm thấy thành viên nào khớp bộ lọc."`.
2. **Network / Server Export Error Handling**:
   - When backend returns non-200 (e.g. 404 or 500), `downloadReport` catches HTTP failure, parses JSON error message if available, and displays error toast inside `ReportExportControls`.
3. **Session Expiry (401)**:
   - Request wrapper in `api.ts` clears `sessionStorage` tokens and redirects user to `/login?reason=session_expired`.
4. **Special Character Filename Sanitization**:
   - Project name in download attribute sanitizes special characters via `.replace(/[^a-z0-9_-]/gi, '_')`.

---

## 7. Testing Strategy

### 7.1 Unit & Component Tests (Vitest + React Testing Library)
* **File**: `client/src/__tests__/ReportExportControls.test.tsx`
  - Test 1: Renders Export CSV and Export JSON buttons.
  - Test 2: Clicking "Xuất CSV" triggers `api.downloadReport(projectId, 'csv', projectName)`.
  - Test 3: Disables buttons and displays loading icon while download is pending.
  - Test 4: Renders error message banner when download promise rejects.

* **File**: `client/src/__tests__/ProductivitySummaryTable.test.tsx`
  - Test 1: Renders all user rows with correct initial data and role badges.
  - Test 2: Clicking column header (e.g., "Annotations") sorts rows descending, then ascending on second click.
  - Test 3: Typing in search input filters rows dynamically.
  - Test 4: Role filter dropdown filters rows by role (`annotator`, `reviewer`, `admin`).
  - Test 5: Totals footer row accurately calculates sums and average speed.

### 7.2 Integration Tests (Server REST API)
* **File**: `server/__tests__/dashboard-reports.test.js`
  - Test 1: `GET /api/projects/:projectId/reports/export?format=csv` returns status 200, `Content-Type: text/csv; charset=utf-8`, and header `Content-Disposition`.
  - Test 2: `GET /api/projects/:projectId/reports/export?format=json` returns status 200, `Content-Type: application/json`, and structured object containing `userProductivity` and `timeline`.
  - Test 3: Non-existent `projectId` returns 404 with JSON `{ error: "Không tìm thấy project" }`.

### 7.3 End-to-End Verification (Playwright)
* Scenario 1: Navigate to Project Detail -> Open `📊 Thống kê` modal -> Switch to `Năng suất Thành viên` tab -> Click column headers to verify sort order changes.
* Scenario 2: Click `Xuất CSV` and `Xuất JSON` buttons -> Verify browser download event is dispatched with valid CSV/JSON payload.
* Scenario 3: Toggle dark mode theme in topbar -> Verify dark background (`#201C36` / `#110F1D`) and contrasting text colors (`#ECE9FA`) apply across all report components without visual glitching.

---

## 8. File & Artifact Index
* `client/src/components/dashboard/ReportExportControls.tsx` (Export UI controls)
* `client/src/components/dashboard/AnnotatorProductivityChart.tsx` (Charts & Productivity table)
* `client/src/components/StatsPanel.tsx` (Stats & Reports modal wrapper)
* `client/src/api.ts` (API client download helper)
* `client/src/styles.css` (Design tokens, dark mode & responsive table styles)
* `server/src/routes/dashboard.js` (Backend aggregation & export REST APIs)
