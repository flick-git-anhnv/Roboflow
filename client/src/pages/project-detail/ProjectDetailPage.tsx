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
import ModelManagerPanel from './components/ModelManagerPanel';
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
  const [validateOpen, setValidateOpen] = useState(false);
  const [assignmentOpen, setAssignmentOpen] = useState(false);

  const currentUser = getCurrentUser();
  const canReview = currentUser?.role === 'reviewer' || currentUser?.role === 'admin';

  const classFilterRef = useRef<HTMLDivElement>(null);

  const {
    project,
    classes,
    images,
    setImages,
    models,
    load,
    addClass,
    updateClass,
    removeClass,
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

  const {
    dragOver,
    setDragOver,
    uploading,
    fileInputRef,
    folderInputRef,
    zipInputRef,
    handleFiles,
  } = useFileUpload(projectId, load, showToast);

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

  const labeledCount = images.filter((i) => i.status === 'labeled').length;

  return (
    <div>
      <ProjectDetailHeader
        project={project}
        fileInputRef={fileInputRef}
        folderInputRef={folderInputRef}
        zipInputRef={zipInputRef}
        onOpenStats={() => setStatsOpen(true)}
        onOpenAutoLabel={() => setAutoLabelOpen(true)}
        onOpenValidate={() => setValidateOpen(true)}
        onOpenAssignment={() => setAssignmentOpen(true)}
        onOpenExport={() => setExportOpen(true)}
        onHandleFiles={handleFiles}
      />

      <div className="detail-layout">
        <div className="side-panel">
          <ClassManagerPanel
            classes={classes}
            onAddClass={addClass}
            onUpdateClass={updateClass}
            onRemoveClass={(cls) => removeClass(cls, (id) => setClassFilter((prev) => prev.filter((cId) => cId !== id)))}
          />

          <div>
            <h4>Thống kê</h4>
            <div className="project-stats" style={{ flexDirection: 'column', gap: 6 }}>
              <span>Tổng ảnh: <b>{images.length}</b></span>
              <span>Đã gán nhãn: <b>{labeledCount}</b></span>
              <span>Chưa gán: <b>{images.length - labeledCount}</b></span>
            </div>
          </div>

          <ModelManagerPanel
            projectId={projectId}
            project={project}
            models={models}
            canReview={canReview}
            onRefreshData={load}
            onShowToast={showToast}
          />
        </div>

        <div>
          <UploadDropzone
            dragOver={dragOver}
            uploading={uploading}
            fileInputRef={fileInputRef}
            setDragOver={setDragOver}
            onHandleFiles={handleFiles}
          />

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
          />

          {filteredImages.length > 0 && (
            <PaginationControls page={currentPage} pageCount={pageCount} onChange={setPage} />
          )}
        </div>
      </div>

      {statsOpen && project && <StatsPanel projectId={project.id} onClose={() => setStatsOpen(false)} />}
      {exportOpen && project && <ExportModal projectId={project.id} onClose={() => setExportOpen(false)} />}
      {validateOpen && project && <ValidateModal projectId={project.id} onClose={() => setValidateOpen(false)} />}
      {assignmentOpen && project && <AssignmentModal projectId={project.id} onClose={() => setAssignmentOpen(false)} />}
      {autoLabelOpen && project && (
        <AutoLabelModal
          projectId={project.id}
          onClose={() => setAutoLabelOpen(false)}
          onFinished={() => { load(); showToast('Đã gán nhãn tự động xong, hãy kiểm tra lại từng ảnh'); }}
        />
      )}

      {toast && <div className={`toast ${toast.error ? 'error' : ''}`}>{toast.text}</div>}
    </div>
  );
}
