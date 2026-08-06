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

export default ReportExportControls;
