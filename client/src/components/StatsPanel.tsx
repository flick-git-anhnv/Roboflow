import { useEffect, useState } from 'react';
import { api } from '../api';
import type { ProjectStats } from '../api';

export default function StatsPanel({ projectId, onClose }: { projectId: string; onClose: () => void }) {
  const [stats, setStats] = useState<ProjectStats | null>(null);
  const [hoverId, setHoverId] = useState<string | null>(null);

  useEffect(() => {
    api.getStats(projectId).then(setStats);
  }, [projectId]);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal stats-modal" onClick={(e) => e.stopPropagation()}>
        <h2>📊 Thống kê dữ liệu</h2>

        {!stats ? (
          <p>Đang tải...</p>
        ) : (
          <>
            <div className="stat-tiles">
              <StatTile label="Tổng ảnh" value={stats.totalImages} />
              <StatTile label="Đã gán nhãn" value={stats.labeledImages} accent="success" />
              <StatTile label="Chưa gán" value={stats.unlabeledImages} accent="warn" />
              <StatTile label="Tổng box" value={stats.totalAnnotations} />
            </div>

            <div className="stat-tiles" style={{ marginTop: 8 }}>
              <StatTile label="Train" value={stats.bySplit.train} small />
              <StatTile label="Valid" value={stats.bySplit.valid} small />
              <StatTile label="Test" value={stats.bySplit.test} small />
            </div>

            <h4 style={{ marginTop: 18 }}>Số lượng box theo nhãn</h4>
            {stats.perClass.length === 0 ? (
              <p style={{ fontSize: 13, color: '#888' }}>Project chưa có nhãn nào.</p>
            ) : (
              <BarChart perClass={stats.perClass} hoverId={hoverId} onHover={setHoverId} />
            )}
          </>
        )}

        <div className="modal-actions">
          <button className="btn btn-outline" onClick={onClose}>Đóng</button>
        </div>
      </div>
    </div>
  );
}

function StatTile({ label, value, accent, small }: { label: string; value: number; accent?: 'success' | 'warn'; small?: boolean }) {
  return (
    <div className={`stat-tile ${small ? 'small' : ''}`}>
      <span className={`stat-tile-value ${accent || ''}`}>{value}</span>
      <span className="stat-tile-label">{label}</span>
    </div>
  );
}

function BarChart({
  perClass,
  hoverId,
  onHover,
}: {
  perClass: ProjectStats['perClass'];
  hoverId: string | null;
  onHover: (id: string | null) => void;
}) {
  const sorted = [...perClass].sort((a, b) => b.count - a.count);
  const max = Math.max(1, ...sorted.map((c) => c.count));
  const total = sorted.reduce((s, c) => s + c.count, 0) || 1;

  return (
    <div className="bar-chart class-list-scroll">
      {sorted.map((c) => {
        const pct = (c.count / max) * 100;
        const share = ((c.count / total) * 100).toFixed(1);
        const hovered = hoverId === c.class_id;
        return (
          <div
            key={c.class_id}
            className={`bar-chart-row ${hovered ? 'hovered' : ''}`}
            onMouseEnter={() => onHover(c.class_id)}
            onMouseLeave={() => onHover(null)}
          >
            <span className="bar-chart-label" title={c.name}>{c.name}</span>
            <span className="bar-chart-track">
              <span className="bar-chart-fill" style={{ width: `${pct}%` }} />
            </span>
            <span className="bar-chart-value">{c.count}</span>
            {hovered && (
              <span className="bar-chart-tooltip">{c.name}: {c.count} box ({share}%)</span>
            )}
          </div>
        );
      })}
    </div>
  );
}
