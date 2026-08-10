import React from 'react';
import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Tooltip,
  Legend,
} from 'recharts';
import { useTheme } from '../../context/ThemeContext';

export interface DatasetSplitBreakdownProps {
  bySplit?: { train: number; valid: number; test: number } | null;
  title?: string;
}

const SPLIT_COLORS = {
  train: '#3B82F6', // Blue
  valid: '#F59E0B', // Amber
  test: '#10B981',  // Emerald
};

export const DatasetSplitBreakdown: React.FC<DatasetSplitBreakdownProps> = ({
  bySplit = { train: 0, valid: 0, test: 0 },
  title = 'Phân bổ Dataset Split (Train / Valid / Test)',
}) => {
  const { theme } = useTheme();
  const isDark = theme === 'dark';

  const axisColor = isDark ? '#9E97BF' : '#666666';
  const tooltipBg = isDark ? '#201C36' : '#FFFFFF';
  const tooltipBorder = isDark ? '#332D4D' : '#CBCBCB';
  const tooltipTextColor = isDark ? '#ECE9FA' : '#1C1A2E';

  const safeSplit = bySplit ? {
    train: bySplit.train || 0,
    valid: bySplit.valid || 0,
    test: bySplit.test || 0,
  } : { train: 0, valid: 0, test: 0 };
  const total = (safeSplit.train || 0) + (safeSplit.valid || 0) + (safeSplit.test || 0);

  const chartData = [
    { name: 'Train Set', key: 'train', value: safeSplit.train || 0, color: SPLIT_COLORS.train },
    { name: 'Valid Set', key: 'valid', value: safeSplit.valid || 0, color: SPLIT_COLORS.valid },
    { name: 'Test Set', key: 'test', value: safeSplit.test || 0, color: SPLIT_COLORS.test },
  ].filter((item) => item.value > 0 || total === 0);

  return (
    <div className="chart-card">
      <div className="chart-card-header">
        <h3 className="chart-card-title">{title}</h3>
      </div>

      {total === 0 ? (
        <div className="chart-empty">Chưa có ảnh trong dataset split.</div>
      ) : (
        <div className="chart-body" style={{ width: '100%', height: 280, minHeight: 280 }}>
          <ResponsiveContainer width="100%" height="100%">
            <PieChart margin={{ top: 10, right: 10, left: 10, bottom: 10 }}>
              <Pie
                data={chartData}
                cx="50%"
                cy="50%"
                innerRadius={60}
                outerRadius={90}
                paddingAngle={4}
                dataKey="value"
              >
                {chartData.map((entry) => (
                  <Cell key={`split-cell-${entry.key}`} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{
                  backgroundColor: tooltipBg,
                  borderColor: tooltipBorder,
                  borderRadius: '8px',
                  color: tooltipTextColor,
                  boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                }}
                itemStyle={{ color: tooltipTextColor }}
                formatter={(value: any, name: any) => [
                  `${value ?? 0} ảnh (${total > 0 ? Math.round(((value ?? 0) / total) * 100) : 0}%)`,
                  name,
                ]}
              />

              <Legend
                wrapperStyle={{ color: axisColor, fontSize: 12, paddingTop: 10 }}
                formatter={(value, entry: any) => {
                  const item = chartData.find((d) => d.name === value);
                  const count = item ? item.value : 0;
                  const pct = total > 0 ? Math.round((count / total) * 100) : 0;
                  return `${value}: ${count} ảnh (${pct}%)`;
                }}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
};

export default DatasetSplitBreakdown;
