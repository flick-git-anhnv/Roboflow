import { db } from '../db.js';

/**
 * Middleware để kiểm tra phân quyền truy cập dự án cho tài khoản label (annotator).
 * Admin và Reviewer được phép truy cập tất cả.
 * Annotator (label) chỉ được phép truy cập nếu được phân công trong project_assignments.
 */
export function checkProjectAssignment(req, res, next) {
  const user = req.user;
  if (!user) return res.status(401).json({ error: 'AUTH_REQUIRED' });

  // Admin và Reviewer có quyền xem tất cả các dự án
  if (user.role === 'admin' || user.role === 'reviewer') {
    return next();
  }

  // Annotator/label chỉ được xem dự án được phân công
  if (user.role === 'annotator' || user.role === 'label') {
    const projectId = req.params.projectId || req.params.id;
    if (!projectId) {
      return next();
    }

    const assigned = db.prepare(
      'SELECT 1 FROM project_assignments WHERE project_id = ? AND user_id = ?'
    ).get(projectId, user.id);

    if (!assigned) {
      return res.status(403).json({ error: 'ACCESS_DENIED_PROJECT_NOT_ASSIGNED' });
    }
  }

  next();
}
