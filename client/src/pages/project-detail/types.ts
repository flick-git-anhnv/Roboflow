import type { Split } from '../../types';

export type StatusFilter = 'all' | 'labeled' | 'unlabeled';
export type SplitFilter = 'all' | Split;
export type ReviewFilter = 'all' | 'draft' | 'in_review' | 'approved' | 'rejected';
export type DoneFilter = 'all' | 'done' | 'not_done';

export const REVIEW_LABEL: Record<string, string> = {
  draft: 'Nháp',
  in_review: 'Chờ duyệt',
  approved: 'Đã duyệt',
  rejected: 'Bị từ chối',
};
