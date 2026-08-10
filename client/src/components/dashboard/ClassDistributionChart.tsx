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
  labelType?: string;
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
  title,
  labelType,
}) => {
  const { theme } = useTheme();
  const isDark = theme === 'dark';

  const axisColor = isDark ? '#9E97BF' : '#666666';
  const gridColor = isDark ? '#332D4D' : '#EBEAFA';
  const tooltipBg = isDark ? '#201C36' : '#FFFFFF';
  const tooltipBorder = isDark ? '#332D4D' : '#CBCBCB';
  const tooltipTextColor = isDark ? '#ECE9FA' : '#1C1A2E';

  const [sortMode, setSortMode] = React.useState<'count' | 'label'>('count');

  // Process data for chart
  let processedData = [...data];
  if (labelType === 'text_rec') {
    // Only keep characters with at least 1 count to avoid empty bars
    processedData = processedData.filter((item) => item.count > 0);
  }

  const totalClassesCount = processedData.length;
  let isTruncated = false;

  if (sortMode === 'count') {
    processedData.sort((a, b) => b.count - a.count);
  } else {
    processedData.sort((a, b) => a.name.localeCompare(b.name));
  }

  const defaultTitle = labelType === 'text_rec' 
    ? 'Tần suất xuất hiện ký tự'
    : 'Phân bố Annotation theo Class';

  const displayTitle = title || defaultTitle;
  
  // Dynamic width to allow scrolling if there are too many classes
  const minChartWidth = Math.max(100, processedData.length * 35); // 35px per bar

  if (!data || data.length === 0 || processedData.length === 0) {
    return (
      <div className="chart-card">
        <div className="chart-card-header">
          <h3 className="chart-card-title" style={{ fontFamily: 'Inter, system-ui, sans-serif' }}>{displayTitle}</h3>
        </div>
        <div className="chart-empty" style={{ fontFamily: 'Inter, system-ui, sans-serif' }}>Chưa có dữ liệu class annotation.</div>
      </div>
    );
  }

  return (
    <div className="chart-card" style={{ display: 'flex', flexDirection: 'column', width: '100%', minWidth: 0, overflow: 'hidden' }}>
      <div className="chart-card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <h3 className="chart-card-title" style={{ margin: 0, fontFamily: 'Inter, system-ui, sans-serif', fontSize: '1.1rem', fontWeight: 600 }}>{displayTitle}</h3>
          <span style={{ fontSize: 12, color: '#64748b', fontFamily: 'Inter, system-ui, sans-serif' }}>
            Tổng số: {totalClassesCount} {labelType === 'text_rec' ? 'ký tự' : 'nhãn'}
          </span>
        </div>
        <select 
          value={sortMode}
          onChange={(e) => setSortMode(e.target.value as 'count' | 'label')}
          style={{ 
            fontFamily: 'Inter, system-ui, sans-serif',
            fontSize: 13, padding: '6px 12px', borderRadius: 6, 
            background: isDark ? '#332D4D' : '#f8fafc', 
            color: isDark ? '#ECE9FA' : '#334155', 
            border: `1px solid ${isDark ? '#4B4376' : '#cbd5e1'}`,
            outline: 'none',
            cursor: 'pointer',
            fontWeight: 500,
            boxShadow: '0 1px 2px rgba(0,0,0,0.05)'
          }}
        >
          <option value="count">Sắp xếp theo số lượng</option>
          <option value="label">Sắp xếp theo tên nhãn (A-Z)</option>
        </select>
      </div>
      <div 
        className="chart-body" 
        style={{ 
          width: '100%', 
          height: 320, 
          overflowX: 'auto', 
          overflowY: 'hidden',
          fontFamily: 'Inter, system-ui, sans-serif'
        }}
      >
        <div style={{ width: '100%', minWidth: minChartWidth, height: '100%' }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={processedData} margin={{ top: 20, right: 20, left: 0, bottom: 40 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={gridColor} vertical={false} />
              <XAxis
                dataKey="name"
                stroke={axisColor}
                tick={{ fill: axisColor, fontSize: 12, fontWeight: 500 }}
                angle={-45}
                textAnchor="end"
                interval={0}
                tickMargin={10}
                axisLine={{ stroke: gridColor }}
                tickLine={false}
              />
              <YAxis 
                stroke={axisColor} 
                tick={{ fill: axisColor, fontSize: 12, fontWeight: 500 }} 
                allowDecimals={false} 
                axisLine={false}
                tickLine={false}
                tickMargin={10}
              />
              <Tooltip
                cursor={{ fill: isDark ? '#ffffff10' : '#00000005' }}
                contentStyle={{
                  backgroundColor: tooltipBg,
                  borderColor: tooltipBorder,
                  borderRadius: '8px',
                  color: tooltipTextColor,
                  boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1), 0 4px 6px -4px rgba(0,0,0,0.1)',
                  padding: '8px 12px',
                  fontFamily: 'Inter, system-ui, sans-serif'
                }}
                itemStyle={{ color: tooltipTextColor, fontWeight: 600, fontSize: 14 }}
                labelStyle={{ color: '#64748b', fontSize: 12, marginBottom: 4 }}
                formatter={(val: any) => [`${val ?? 0} bounding box`, 'Số lượng']}
              />
              <Bar 
                dataKey="count" 
                radius={[4, 4, 0, 0]} 
                maxBarSize={50}
                animationDuration={1000}
              >
                {processedData.map((entry, index) => (
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
    </div>
  );
};

export default ClassDistributionChart;
