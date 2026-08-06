import React from 'react';

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
      <div className="kpi-icon-wrapper">{icon}</div>
      <div className="kpi-content">
        <div className="kpi-label">{title}</div>
        <div className="kpi-value">{value}</div>
        {subtext && <div className="kpi-subtext">{subtext}</div>}
        {trend && (
          <div className={`kpi-trend ${trend.isPositive ? 'positive' : 'negative'}`}>
            {trend.value}
          </div>
        )}
      </div>
    </div>
  );
};

export default KPICard;
