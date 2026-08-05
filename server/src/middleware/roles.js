/**
 * Role-based access control (AD-A5).
 * requireRole(...roles): 403 nếu req.user.role không nằm trong danh sách cho phép.
 */

export function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'AUTH_REQUIRED' });
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'AUTH_FORBIDDEN', required: roles });
    }
    next();
  };
}
