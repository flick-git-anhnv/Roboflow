import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { ThemeProvider } from '../../context/ThemeContext';
import { AnnotationTimelineChart } from './AnnotationTimelineChart';
import { ClassDistributionChart } from './ClassDistributionChart';
import { DatasetSplitBreakdown } from './DatasetSplitBreakdown';
import { AnnotatorProductivityChart } from './AnnotatorProductivityChart';
import { KPICard } from './KPICard';
import { ReportExportControls } from './ReportExportControls';

function wrap(ui: React.ReactNode) {
  return <ThemeProvider>{ui}</ThemeProvider>;
}

describe('Chart Components Stress Tests', () => {
  describe('AnnotationTimelineChart', () => {
    it('renders with valid data', () => {
      const { container } = render(
        wrap(
          <AnnotationTimelineChart
            data={[{ date: '2026-08-01', annotationsCount: 10, imagesAdded: 5, imagesCompleted: 3 }]}
          />
        )
      );
      expect(container.querySelector('.chart-card')).not.toBeNull();
    });

    it('handles empty data', () => {
      render(wrap(<AnnotationTimelineChart data={[]} />));
      expect(screen.getByText('Chưa có dữ liệu tiến độ trong khoảng thời gian này.')).toBeInTheDocument();
    });

    it('handles null data', () => {
      render(wrap(<AnnotationTimelineChart data={null as any} />));
      expect(screen.getByText('Chưa có dữ liệu tiến độ trong khoảng thời gian này.')).toBeInTheDocument();
    });

    it('handles undefined data', () => {
      render(wrap(<AnnotationTimelineChart data={undefined as any} />));
      expect(screen.getByText('Chưa có dữ liệu tiến độ trong khoảng thời gian này.')).toBeInTheDocument();
    });
  });

  describe('ClassDistributionChart', () => {
    it('renders with valid data', () => {
      const { container } = render(
        wrap(
          <ClassDistributionChart
            data={[{ class_id: '1', name: 'Car', count: 15, color: '#F05922' }]}
          />
        )
      );
      expect(container.querySelector('.chart-card')).not.toBeNull();
    });

    it('handles empty data', () => {
      render(wrap(<ClassDistributionChart data={[]} />));
      expect(screen.getByText('Chưa có dữ liệu class annotation.')).toBeInTheDocument();
    });
  });

  describe('DatasetSplitBreakdown', () => {
    it('renders with valid data', () => {
      const { container } = render(
        wrap(<DatasetSplitBreakdown bySplit={{ train: 70, valid: 20, test: 10 }} />)
      );
      expect(container.querySelector('.chart-card')).not.toBeNull();
    });

    it('handles zero split', () => {
      render(wrap(<DatasetSplitBreakdown bySplit={{ train: 0, valid: 0, test: 0 }} />));
      expect(screen.getByText('Chưa có ảnh trong dataset split.')).toBeInTheDocument();
    });
  });

  describe('AnnotatorProductivityChart', () => {
    it('renders with valid data', () => {
      const { container } = render(
        wrap(
          <AnnotatorProductivityChart
            data={[
              {
                userId: 1,
                username: 'annotator1',
                displayName: 'Annotator One',
                imagesUploaded: 10,
                imagesCompleted: 8,
                annotationsCount: 45,
              },
            ]}
          />
        )
      );
      expect(container.querySelector('.dashboard-productivity-container')).not.toBeNull();
    });

    it('handles empty data', () => {
      render(wrap(<AnnotatorProductivityChart data={[]} />));
      expect(screen.getByText('Không tìm thấy thành viên nào khớp bộ lọc.')).toBeInTheDocument();
    });
  });

  describe('KPICard', () => {
    it('renders correctly', () => {
      const { container } = render(
        <KPICard title="Total Images" value={100} icon={<span>icon</span>} />
      );
      expect(container.querySelector('.kpi-card')).not.toBeNull();
      expect(screen.getByText('Total Images')).toBeInTheDocument();
    });
  });

  describe('ReportExportControls', () => {
    it('renders export buttons', () => {
      render(<ReportExportControls projectId="proj_1" />);
      expect(screen.getByText('Xuất Báo Cáo & Thống Kê')).toBeInTheDocument();
    });
  });
});
