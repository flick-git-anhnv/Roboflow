import React, { createRef } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import ProjectDetailHeader from '../pages/project-detail/components/ProjectDetailHeader';
import ClassManagerPanel from '../pages/project-detail/components/ClassManagerPanel';
import UploadDropzone from '../pages/project-detail/components/UploadDropzone';
import BatchActionsBar from '../pages/project-detail/components/BatchActionsBar';
import ExportModal from '../components/ExportModal';
import { api } from '../api';
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

  it('renders ExportModal with completedOnly checkbox and handles export with completedOnly', async () => {
    const onClose = vi.fn();
    const statsSpy = vi.spyOn(api, 'getStats').mockResolvedValue({
      totalImages: 100,
      completedImages: 45,
      labeledImages: 50,
      unlabeledImages: 50,
      totalAnnotations: 120,
      bySplit: { train: 80, valid: 15, test: 5 },
      perClass: [],
    });
    const exportSpy = vi.spyOn(api, 'exportUrl').mockReturnValue('/api/projects/p1/export?format=yolo&completedOnly=true');
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

    render(<ExportModal projectId="p1" onClose={onClose} />);

    expect(screen.getByText('⬇ Export dataset')).toBeInTheDocument();
    const checkbox = screen.getByLabelText('Chỉ lấy những ảnh đã đánh dấu xong') as HTMLInputElement;
    expect(checkbox).toBeInTheDocument();
    expect(await screen.findByText('50 / 100 ảnh đã gán nhãn')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Xuất dataset \(50 ảnh\)/ })).toBeInTheDocument();

    fireEvent.click(checkbox);
    expect(checkbox.checked).toBe(true);
    expect(screen.getByText('45 / 100 ảnh đã xong')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Xuất dataset \(45 ảnh\)/ })).toBeInTheDocument();

    const exportBtn = screen.getByRole('button', { name: /Xuất dataset \(45 ảnh\)/ });
    fireEvent.click(exportBtn);

    expect(exportSpy).toHaveBeenCalledWith('p1', 'yolo', {
      mode: 'manual',
      trainRatio: 0.8,
      completedOnly: true,
    });
    expect(clickSpy).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
    exportSpy.mockRestore();
    clickSpy.mockRestore();
    statsSpy.mockRestore();
  });
});
