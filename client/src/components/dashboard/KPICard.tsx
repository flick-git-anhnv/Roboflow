import React from 'react';
import { TrendingUp, TrendingDown } from 'lucide-react';

export interface KPICardProps {
  title: string;
  value: number | string;
  subtext?: string;
  icon: React.ReactNode;
  trend?: {
    value: string;
    isPositive?: boolean;
  };
  colorScheme?: 'primary' | 'success' | 'info' | 'warning' | 'purple';
}

export const KPICard: React.FC<KPICardProps> = ({
  title,
  value,
  subtext,
  icon,
  trend,
  colorScheme = 'primary',
}) => {
  return (
    <div className={`kpi-card kpi-scheme-${colorScheme}`}>
      <div className="kpi-accent-bar" />
      <div className="kpi-inner">
        <div className="kpi-top-row">
          <div className="kpi-icon-wrapper">{icon}</div>
          {trend && (
            <div className={`kpi-trend-badge ${trend.isPositive ? 'positive' : 'negative'}`}>
              {trend.isPositive ? <TrendingUp size={11} /> : <TrendingDown size={11} />}
              {trend.value}
            </div>
          )}
        </div>
        <div className="kpi-value">{value}</div>
        <div className="kpi-label">{title}</div>
        {subtext && <div className="kpi-subtext">{subtext}</div>}
      </div>
    </div>
  );
};

export default KPICard;
