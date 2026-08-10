import React from 'react';
import {
  ResponsiveContainer,
  ComposedChart,
  Area,
  Bar,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  CartesianGrid,
} from 'recharts';
import { useTheme } from '../../context/ThemeContext';
import type { TimelineReportItem } from '../../types';

export interface AnnotationTimelineChartProps {
  data: TimelineReportItem[];
  days?: number;
  onDaysChange?: (days: number) => void;
  title?: string;
}

export const AnnotationTimelineChart: React.FC<AnnotationTimelineChartProps> = ({
  data,
  days = 30,
  onDaysChange,
  title = 'Tiến độ Thêm ảnh & Gán nhãn Theo thời gian',
}) => {
  const { theme } = useTheme();
  const isDark = theme === 'dark';

  const axisColor = isDark ? '#9E97BF' : '#666666';
  const gridColor = isDark ? '#332D4D' : '#EBEAFA';
  const tooltipBg = isDark ? '#201C36' : '#FFFFFF';
  const tooltipBorder = isDark ? '#332D4D' : '#CBCBCB';
  const tooltipTextColor = isDark ? '#ECE9FA' : '#1C1A2E';

  const rangeOptions = [7, 14, 30, 90];

  return (
    <div className="chart-card">
      <div className="chart-card-header">
        <h3 className="chart-card-title">{title}</h3>
        {onDaysChange && (
          <div className="timeline-range-buttons">
            {rangeOptions.map((opt) => (
              <button
                key={opt}
                type="button"
                className={`btn-pill ${days === opt ? 'active' : ''}`}
                onClick={() => onDaysChange(opt)}
              >
                {opt} ngày
              </button>
            ))}
          </div>
        )}
      </div>

      {!data || data.length === 0 ? (
        <div className="chart-empty">Chưa có dữ liệu tiến độ trong khoảng thời gian này.</div>
      ) : (
        <div className="chart-body" style={{ width: '100%', height: 320, minHeight: 320 }}>
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={data} margin={{ top: 10, right: 20, left: 0, bottom: 20 }}>
              <defs>
                <linearGradient id="colorAnn" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#F05922" stopOpacity={0.4} />
                  <stop offset="95%" stopColor="#F05922" stopOpacity={0.0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke={gridColor} />
              <XAxis
                dataKey="date"
                stroke={axisColor}
                tick={{ fill: axisColor, fontSize: 11 }}
                tickFormatter={(val) => {
                  if (typeof val === 'string' && val.length >= 10) {
                    return val.slice(5); // MM-DD
                  }
                  return val;
                }}
              />
              <YAxis yAxisId="left" stroke={axisColor} tick={{ fill: axisColor, fontSize: 11 }} allowDecimals={false} />
              <YAxis yAxisId="right" orientation="right" stroke={axisColor} tick={{ fill: axisColor, fontSize: 11 }} allowDecimals={false} />
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
                  if (value === 'annotationsCount') return 'Số Annotation';
                  if (value === 'imagesAdded') return 'Ảnh Thêm Mới';
                  if (value === 'imagesCompleted') return 'Ảnh Hoàn Thành';
                  return value;
                }}
              />
              <Area
                yAxisId="left"
                type="monotone"
                dataKey="annotationsCount"
                fill="url(#colorAnn)"
                stroke="#F05922"
                strokeWidth={2}
                name="annotationsCount"
              />
              <Bar
                yAxisId="right"
                dataKey="imagesAdded"
                fill="#3B82F6"
                radius={[4, 4, 0, 0]}
                barSize={12}
                name="imagesAdded"
              />
              <Line
                yAxisId="right"
                type="monotone"
                dataKey="imagesCompleted"
                stroke="#10B981"
                strokeWidth={2}
                dot={{ r: 3 }}
                name="imagesCompleted"
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
};

export default AnnotationTimelineChart;
