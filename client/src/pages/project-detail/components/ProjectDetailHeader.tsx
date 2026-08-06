import React, { RefObject } from 'react';
import type { Project } from '../../../types';

interface ProjectDetailHeaderProps {
  project: Project;
  fileInputRef: RefObject<HTMLInputElement>;
  folderInputRef: RefObject<HTMLInputElement>;
  zipInputRef: RefObject<HTMLInputElement>;
  onOpenStats: () => void;
  onOpenAutoLabel: () => void;
  onOpenModelManager: () => void;
  onOpenValidate: () => void;
  onOpenAssignment: () => void;
  onOpenExport: () => void;
  onHandleFiles: (files: FileList | File[]) => void;
}

export const ProjectDetailHeader: React.FC<ProjectDetailHeaderProps> = ({
  project,
  fileInputRef,
  folderInputRef,
  zipInputRef,
  onOpenStats,
  onOpenAutoLabel,
  onOpenModelManager,
  onOpenValidate,
  onOpenAssignment,
  onOpenExport,
  onHandleFiles,
}) => {
  return (
    <div className="page-header">
      <div>
        <h1>{project.name}</h1>
        <p style={{ margin: '4px 0 0', color: '#666', fontSize: 13 }}>{project.description}</p>
      </div>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <button className="btn btn-outline" onClick={onOpenStats}>📊 Thống kê</button>
        <button className="btn btn-outline" onClick={onOpenAutoLabel}>🤖 Auto Label</button>
        <button className="btn btn-outline" onClick={onOpenModelManager}>⚙ Quản lý Model</button>
        <button className="btn btn-outline" onClick={onOpenValidate}>Kiểm tra dataset</button>
        <button className="btn btn-outline" onClick={onOpenAssignment}>👥 Phân công</button>
        <button className="btn btn-secondary" onClick={onOpenExport}>⬇ Export dataset</button>
        <button className="btn btn-outline" onClick={() => zipInputRef.current?.click()}>🗜 Tải file ZIP</button>
        <button className="btn btn-outline" onClick={() => folderInputRef.current?.click()}>📁 Tải thư mục</button>
        <button className="btn btn-primary" onClick={() => fileInputRef.current?.click()}>+ Tải ảnh lên</button>
        <input
          ref={fileInputRef} type="file" multiple accept="image/*" hidden
          onChange={(e) => { if (e.target.files) onHandleFiles(e.target.files); e.target.value = ''; }}
        />
        <input
          ref={folderInputRef} type="file" multiple hidden
          // @ts-ignore - non-standard attributes for folder selection
          webkitdirectory="" directory="" mozdirectory=""
          onChange={(e) => { if (e.target.files) onHandleFiles(e.target.files); e.target.value = ''; }}
        />
        <input
          ref={zipInputRef} type="file" accept=".zip,application/zip" hidden
          onChange={(e) => { if (e.target.files) onHandleFiles(e.target.files); e.target.value = ''; }}
        />
      </div>
    </div>
  );
};

export default ProjectDetailHeader;
