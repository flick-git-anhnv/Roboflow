import React, { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { getCurrentUser } from '../../api';

import StatsPanel from '../../components/StatsPanel';
import ExportModal from '../../components/ExportModal';
import AutoLabelModal from '../../components/AutoLabelModal';
import ValidateModal from '../../components/ValidateModal';
import AssignmentModal from '../../components/AssignmentModal';

import ProjectDetailHeader from './components/ProjectDetailHeader';
import ClassManagerPanel from './components/ClassManagerPanel';
import ClassImportModal from './components/ClassImportModal';
import ModelManagerModal from '../../components/ModelManagerModal';
import UploadDropzone from './components/UploadDropzone';
import ImageFilterBar from './components/ImageFilterBar';
import BatchActionsBar from './components/BatchActionsBar';
import ImageGrid from './components/ImageGrid';
import PaginationControls from './components/PaginationControls';

import { useProjectDetailData } from './hooks/useProjectDetailData';
import { useDatasetFilters } from './hooks/useDatasetFilters';
import { useBatchSelection } from './hooks/useBatchSelection';
import { useFileUpload } from './hooks/useFileUpload';

export default function ProjectDetailPage() {
  const { projectId } = useParams<{ projectId: string }>();

  const [toast, setToast] = useState<{ text: string; error?: boolean } | null>(null);
  const showToast = (text: string, error = false) => {
    setToast({ text, error });
    setTimeout(() => setToast(null), 3000);
  };

  const [exportOpen, setExportOpen] = useState(false);
  const [statsOpen, setStatsOpen] = useState(false);
  const [autoLabelOpen, setAutoLabelOpen] = useState(false);
  const [modelManagerOpen, setModelManagerOpen] = useState(false);
  const [validateOpen, setValidateOpen] = useState(false);
  const [assignmentOpen, setAssignmentOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [gridSize, setGridSize] = useState<'small' | 'medium' | 'large'>(() => {
    try {
      const saved = localStorage.getItem('project_grid_size');
      if (saved === 'small' || saved === 'medium' || saved === 'large') return saved;
    } catch {}
    return 'medium';
  });

  const handleGridSizeChange = (size: 'small' | 'medium' | 'large') => {
    setGridSize(size);
    try {
      localStorage.setItem('project_grid_size', size);
    } catch {}
  };

  const currentUser = getCurrentUser();
  const canReview = currentUser?.role === 'reviewer' || currentUser?.role === 'admin';

  const classFilterRef = useRef<HTMLDivElement>(null);

  const {
    project,
    classes,
    setClasses,
    images,
    setImages,
    models,
    load,
    addClass,
    updateClass,
    removeClass,
    removeAllClasses,
    removeImage,
    changeSplit,
  } = useProjectDetailData(projectId);

  const {
    search,
    setSearch,
    statusFilter,
    setStatusFilter,
    classFilter,
    setClassFilter,
    classFilterOpen,
    setClassFilterOpen,
    splitFilter,
    setSplitFilter,
    reviewFilter,
    setReviewFilter,
    doneFilter,
    setDoneFilter,
    page,
    setPage,
    pageSize,
    setPageSize,
    classById,
    filteredImages,
    pagedImages,
    pageCount,
    currentPage,
    resetFilters,
    hasActiveFilters,
    toggleClassFilter,
  } = useDatasetFilters(images, classes);

  const {
    selectedIds,
    toggleSelect,
    clearSelection,
    selectPage,
    batchChangeSplit,
    batchDelete,
  } = useBatchSelection(projectId, setImages, load, showToast);

  const [checkDuplicates, setCheckDuplicates] = useState(false);

  const {
    dragOver,
    setDragOver,
    uploading,
    uploadProgress,
    fileInputRef,
    folderInputRef,
    zipInputRef,
    handleFiles,
  } = useFileUpload(projectId, load, showToast, checkDuplicates);

  // Close multiselect dropdown on click outside
  useEffect(() => {
    if (!classFilterOpen) return;
    const onClickOutside = (e: MouseEvent) => {
      if (classFilterRef.current && !classFilterRef.current.contains(e.target as Node)) {
        setClassFilterOpen(false);
      }
    };
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, [classFilterOpen, setClassFilterOpen]);

  if (!project) return <p>Đang tải...</p>;

  const labeledCount = images.filter((i) => i.status === 'labeled' || i.completed_at).length;

  return (
    <div>
      <ProjectDetailHeader
        project={project}
        fileInputRef={fileInputRef}
        folderInputRef={folderInputRef}
        zipInputRef={zipInputRef}
        onOpenStats={() => setStatsOpen(true)}
        onOpenAutoLabel={() => setAutoLabelOpen(true)}
        onOpenModelManager={() => setModelManagerOpen(true)}
        onOpenValidate={() => setValidateOpen(true)}
        onOpenAssignment={() => setAssignmentOpen(true)}
        onOpenExport={() => setExportOpen(true)}
        onHandleFiles={handleFiles}
      />

      <div className="detail-layout">
        <div className="side-panel">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, padding: '0 4px' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer', fontWeight: 500, userSelect: 'none' }}>
              <input
                type="checkbox"
                checked={checkDuplicates}
                onChange={(e) => setCheckDuplicates(e.target.checked)}
                style={{ width: 16, height: 16, cursor: 'pointer' }}
              />
              <span>Kiểm tra trùng lặp ảnh (MD5)</span>
            </label>
          </div>

          <UploadDropzone
            dragOver={dragOver}
            uploading={uploading}
            uploadProgress={uploadProgress}
            fileInputRef={fileInputRef}
            setDragOver={setDragOver}
            onHandleFiles={handleFiles}
          />

          <ClassManagerPanel
            classes={classes}
            onAddClass={addClass}
            onUpdateClass={updateClass}
            onRemoveClass={(cls) => removeClass(cls, (id) => setClassFilter((prev) => prev.filter((cId) => cId !== id)))}
            onImportClasses={() => setImportOpen(true)}
            onRemoveAllClasses={removeAllClasses}
          />

          <div>
            <h4>Thống kê</h4>
            <div className="project-stats" style={{ flexDirection: 'column', gap: 6 }}>
              <span>Tổng ảnh: <b>{images.length}</b></span>
              <span>Đã gán nhãn: <b>{labeledCount}</b></span>
              <span>Chưa gán: <b>{images.length - labeledCount}</b></span>
            </div>
          </div>
        </div>

        <div>
          <ImageFilterBar
            search={search}
            statusFilter={statusFilter}
            classFilter={classFilter}
            classFilterOpen={classFilterOpen}
            classFilterRef={classFilterRef}
            splitFilter={splitFilter}
            reviewFilter={reviewFilter}
            doneFilter={doneFilter}
            pageSize={pageSize}
            gridSize={gridSize}
            classes={classes}
            canReview={canReview}
            hasActiveFilters={hasActiveFilters}
            filteredCount={filteredImages.length}
            totalCount={images.length}
            onSearchChange={setSearch}
            onStatusFilterChange={setStatusFilter}
            onClassFilterOpenToggle={() => setClassFilterOpen((v) => !v)}
            onToggleClassFilter={toggleClassFilter}
            onClearClassFilter={() => setClassFilter([])}
            onSplitFilterChange={setSplitFilter}
            onReviewFilterChange={setReviewFilter}
            onDoneFilterChange={setDoneFilter}
            onPageSizeChange={setPageSize}
            onGridSizeChange={handleGridSizeChange}
            onResetFilters={resetFilters}
          />

          <BatchActionsBar
            selectedIds={selectedIds}
            pagedImages={pagedImages}
            onSelectPage={selectPage}
            onBatchChangeSplit={batchChangeSplit}
            onBatchDelete={batchDelete}
            onClearSelection={clearSelection}
          />

          <ImageGrid
            images={images}
            filteredImages={filteredImages}
            pagedImages={pagedImages}
            projectId={project.id}
            selectedIds={selectedIds}
            classById={classById}
            onToggleSelect={toggleSelect}
            onChangeSplit={changeSplit}
            onRemoveImage={removeImage}
            gridSize={gridSize}
          />

          {filteredImages.length > 0 && (
            <PaginationControls page={currentPage} pageCount={pageCount} onChange={setPage} />
          )}
        </div>
      </div>

      {statsOpen && project && <StatsPanel projectId={project.id} onClose={() => setStatsOpen(false)} />}
      {exportOpen && project && <ExportModal projectId={project.id} onClose={() => setExportOpen(false)} />}
      {validateOpen && project && <ValidateModal projectId={project.id} onClose={() => setValidateOpen(false)} />}
      {assignmentOpen && project && <AssignmentModal projectId={project.id} onClose={() => { setAssignmentOpen(false); load(); }} />}
      {autoLabelOpen && project && (
        <AutoLabelModal
          projectId={project.id}
          selectedImageIds={selectedIds}
          onClose={() => setAutoLabelOpen(false)}
          onFinished={() => { load(); showToast('Đã gán nhãn tự động xong, hãy kiểm tra lại từng ảnh'); }}
        />
      )}
      {importOpen && project && (
        <ClassImportModal
          projectId={project.id}
          onClose={() => setImportOpen(false)}
          onSuccess={(updatedClasses) => {
            setClasses(updatedClasses);
            showToast('Nhập danh sách nhãn thành công!');
          }}
        />
      )}

      {modelManagerOpen && project && (
        <ModelManagerModal
          projectId={project.id}
          project={project}
          models={models}
          canReview={canReview}
          onRefreshData={load}
          onShowToast={showToast}
          onClose={() => setModelManagerOpen(false)}
        />
      )}

      {toast && <div className={`toast ${toast.error ? 'error' : ''}`}>{toast.text}</div>}
    </div>
  );
}
