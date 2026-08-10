import React, { createRef } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import ProjectDetailHeader from '../pages/project-detail/components/ProjectDetailHeader';
import ClassManagerPanel from '../pages/project-detail/components/ClassManagerPanel';
import UploadDropzone from '../pages/project-detail/components/UploadDropzone';
import BatchActionsBar from '../pages/project-detail/components/BatchActionsBar';
import type { ClassLabel, ImageItem, Project } from '../types';

describe('Project Detail Components', () => {
  const sampleProject: Project = {
    id: 'p1',
    name: 'Autonomous Vehicle Dataset',
    description: 'Street cameras and lidar dataset',
    created_at: '2026-01-01T00:00:00Z',
    image_count: 100,
    labeled_count: 50,
    class_count: 2,
  };

  const sampleClasses: ClassLabel[] = [
    { id: 'c1', project_id: 'p1', name: 'Car', color: '#F05922', sort_order: 1, hotkey: 'c' },
    { id: 'c2', project_id: 'p1', name: 'Pedestrian', color: '#251C53', sort_order: 2, hotkey: 'p' },
  ];

  it('renders ProjectDetailHeader with project title and action buttons', () => {
    const fileRef = createRef<HTMLInputElement>();
    const folderRef = createRef<HTMLInputElement>();
    const zipRef = createRef<HTMLInputElement>();

    render(
      <ProjectDetailHeader
        project={sampleProject}
        fileInputRef={fileRef}
        folderInputRef={folderRef}
        zipInputRef={zipRef}
        onOpenStats={vi.fn()}
        onOpenAutoLabel={vi.fn()}
        onOpenModelManager={vi.fn()}
        onOpenValidate={vi.fn()}
        onOpenAssignment={vi.fn()}
        onOpenExport={vi.fn()}
        onHandleFiles={vi.fn()}
      />
    );

    expect(screen.getByText('Autonomous Vehicle Dataset')).toBeInTheDocument();
    expect(screen.getByText('📊 Thống kê')).toBeInTheDocument();
    expect(screen.getByText('🤖 Auto Label')).toBeInTheDocument();
    expect(screen.getByText('⬇ Export dataset')).toBeInTheDocument();
  });

  it('renders ClassManagerPanel and handles class addition', () => {
    const onAdd = vi.fn();
    const onUpdate = vi.fn();
    const onRemove = vi.fn();

    render(
      <ClassManagerPanel
        classes={sampleClasses}
        onAddClass={onAdd}
        onUpdateClass={onUpdate}
        onRemoveClass={onRemove}
        onImportClasses={vi.fn()}
        onRemoveAllClasses={vi.fn()}
      />
    );

    expect(screen.getByText('Nhãn (Classes)')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Car')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Pedestrian')).toBeInTheDocument();

    const addBtn = screen.getByText('+ Thêm nhãn');
    fireEvent.click(addBtn);
    expect(onAdd).toHaveBeenCalledTimes(1);
  });

  it('renders UploadDropzone with drag & drop instructions', () => {
    const fileRef = createRef<HTMLInputElement>();
    const setDragOver = vi.fn();
    const onHandle = vi.fn();

    render(
      <UploadDropzone
        dragOver={false}
        uploading={false}
        fileInputRef={fileRef}
        setDragOver={setDragOver}
        onHandleFiles={onHandle}
      />
    );

    expect(screen.getByText(/Kéo & thả ảnh, cả thư mục, hoặc file .zip/)).toBeInTheDocument();
  });

  it('renders BatchActionsBar when items are selected', () => {
    const selectedIds = new Set(['i1', 'i2']);
    const pagedImages: ImageItem[] = [];
    const onSelectPage = vi.fn();
    const onBatchChangeSplit = vi.fn();
    const onBatchDelete = vi.fn();
    const onClearSelection = vi.fn();

    render(
      <BatchActionsBar
        selectedIds={selectedIds}
        pagedImages={pagedImages}
        onSelectPage={onSelectPage}
        onBatchChangeSplit={onBatchChangeSplit}
        onBatchDelete={onBatchDelete}
        onClearSelection={onClearSelection}
      />
    );

    expect(screen.getByText('Đã chọn 2 ảnh')).toBeInTheDocument();
    expect(screen.getByText('🗑 Xoá 2 ảnh')).toBeInTheDocument();
  });
});
