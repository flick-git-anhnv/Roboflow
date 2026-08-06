import React from 'react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Cell,
  CartesianGrid,
} from 'recharts';
import { useTheme } from '../../context/ThemeContext';

export interface ClassCountItem {
  class_id: string;
  name: string;
  color?: string;
  count: number;
}

export interface ClassDistributionChartProps {
  data: ClassCountItem[];
  title?: string;
}

const DEFAULT_COLORS = [
  '#F05922',
  '#251C53',
  '#2E9E6C',
  '#3B82F6',
  '#8B5CF6',
  '#EC4899',
  '#F59E0B',
  '#10B981',
];

export const ClassDistributionChart: React.FC<ClassDistributionChartProps> = ({
  data,
  title = 'Phân bố Annotation theo Class',
}) => {
  const { theme } = useTheme();
  const isDark = theme === 'dark';

  const axisColor = isDark ? '#9E97BF' : '#666666';
  const gridColor = isDark ? '#332D4D' : '#EBEAFA';
  const tooltipBg = isDark ? '#201C36' : '#FFFFFF';
  const tooltipBorder = isDark ? '#332D4D' : '#CBCBCB';
  const tooltipTextColor = isDark ? '#ECE9FA' : '#1C1A2E';

  if (!data || data.length === 0) {
    return (
      <div className="chart-card">
        <div className="chart-card-header">
          <h3 className="chart-card-title">{title}</h3>
        </div>
        <div className="chart-empty">Chưa có dữ liệu class annotation.</div>
      </div>
    );
  }

  return (
    <div className="chart-card">
      <div className="chart-card-header">
        <h3 className="chart-card-title">{title}</h3>
      </div>
      <div className="chart-body" style={{ width: '100%', height: 300, minHeight: 300 }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 10, right: 20, left: 0, bottom: 25 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={gridColor} />
            <XAxis
              dataKey="name"
              stroke={axisColor}
              tick={{ fill: axisColor, fontSize: 12 }}
              angle={-20}
              textAnchor="end"
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
              formatter={(val: any) => [`${val ?? 0} bounding box`, 'Số lượng']}
            />

            <Bar dataKey="count" radius={[4, 4, 0, 0]}>
              {data.map((entry, index) => (
                <Cell
                  key={`cell-${index}`}
                  fill={entry.color || DEFAULT_COLORS[index % DEFAULT_COLORS.length]}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

export default ClassDistributionChart;
