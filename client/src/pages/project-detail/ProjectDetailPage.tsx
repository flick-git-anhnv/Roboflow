import React, { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
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
import DatasetVersionsModal from '../../components/DatasetVersionsModal';
import ModelTrainingModal from '../../components/ModelTrainingModal';
import WorkflowsModal from '../../components/WorkflowsModal';
import { requestPromptAutoLabel } from '../../api';
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
  const [promptOpen, setPromptOpen] = useState(false);
  const [versionsOpen, setVersionsOpen] = useState(false);
  const [trainingOpen, setTrainingOpen] = useState(false);
  const [workflowsOpen, setWorkflowsOpen] = useState(false);

  const [promptText, setPromptText] = useState('car');
  const [promptBusy, setPromptBusy] = useState(false);

  const handleRunPrompt = async () => {
    if (!projectId || !promptText.trim()) return;
    setPromptBusy(true);
    try {
      const res = await requestPromptAutoLabel(projectId, promptText.trim());
      showToast(res.message);
      setPromptOpen(false);
      load();
    } catch (err: any) {
      showToast('Lỗi Auto-Label: ' + err.message, true);
    } finally {
      setPromptBusy(false);
    }
  };
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
    loading,
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

  if (loading || !project) {
    return (
      <div style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        minHeight: '60vh', gap: 12, color: 'var(--text-secondary)'
      }}>
        <Loader2 className="animate-spin" size={36} color="var(--accent-color)" />
        <p style={{ fontSize: 14, fontWeight: 500 }}>Đang tải dữ liệu dự án...</p>
      </div>
    );
  }

  const labeledCount = images.filter((i) => i.status === 'labeled' || i.completed_at).length;

  return (
    <div className="project-detail-container">
        <ProjectDetailHeader
          project={project}
          fileInputRef={fileInputRef}
          folderInputRef={folderInputRef}
          zipInputRef={zipInputRef}
          onOpenStats={() => setStatsOpen(true)}
          onOpenAutoLabel={() => setAutoLabelOpen(true)}
          onOpenPromptModal={() => setPromptOpen(true)}
          onOpenVersions={() => setVersionsOpen(true)}
          onOpenTraining={() => setTrainingOpen(true)}
          onOpenWorkflows={() => setWorkflowsOpen(true)}
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

        <div className="main-panel">
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

          <div className="grid-scroll-container">
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
          </div>

          {filteredImages.length > 0 && (
            <PaginationControls page={currentPage} pageCount={pageCount} onChange={setPage} />
          )}
        </div>
      </div>

      {statsOpen && project && <StatsPanel projectId={project.id} onClose={() => setStatsOpen(false)} />}
      {exportOpen && project && (
        <ExportModal
          projectId={project.id}
          labelType={project.label_type}
          onClose={() => setExportOpen(false)}
        />
      )}
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
          project={project}
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

      {versionsOpen && project && <DatasetVersionsModal projectId={project.id} onClose={() => setVersionsOpen(false)} />}
      {trainingOpen && project && <ModelTrainingModal projectId={project.id} onClose={() => setTrainingOpen(false)} />}
      {workflowsOpen && project && <WorkflowsModal projectId={project.id} onClose={() => setWorkflowsOpen(false)} />}
      {promptOpen && project && (
        <div className="modal-backdrop" onClick={() => setPromptOpen(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 450 }}>
            <h3 style={{ marginTop: 0 }}>💬 Grounding DINO Prompt Auto-Labeling</h3>
            <p style={{ fontSize: 13, color: '#888' }}>
              Nhập từ khóa mô tả đối tượng để AI tự động quét và gán nhãn cho toàn bộ ảnh chưa gán nhãn trong dự án.
            </p>
            <div style={{ margin: '15px 0' }}>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 5 }}>Text Prompt (VD: car, license plate, person):</label>
              <input
                type="text"
                className="form-control"
                value={promptText}
                onChange={(e) => setPromptText(e.target.value)}
                placeholder="Nhập tên đối tượng..."
                style={{ width: '100%', padding: '8px 12px', fontSize: 14 }}
              />
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button className="btn btn-outline" onClick={() => setPromptOpen(false)}>Hủy</button>
              <button className="btn btn-primary" onClick={handleRunPrompt} disabled={promptBusy}>
                {promptBusy ? 'Đang tự động gán nhãn...' : '⚡ Khởi Chạy Auto-Label'}
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && <div className={`toast ${toast.error ? 'error' : ''}`}>{toast.text}</div>}
    </div>
  );
}
