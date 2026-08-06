import { useEffect, useState } from 'react';
import { api, getCurrentUser } from '../api';
import type { User, UserRole } from '../types';
import { Users, UserPlus, Trash2, CheckCircle2, XCircle, ShieldCheck, User as UserIcon } from 'lucide-react';

const ROLE_LABEL: Record<UserRole, string> = {
  annotator: 'Annotator',
  reviewer: 'Reviewer',
  admin: 'Admin',
};

const DEFAULT_COLORS = ['#F05922', '#251C53', '#4A3F8C', '#2E9E6C', '#C0392B', '#1B9CFC', '#9B59B6'];

export default function UsersPage() {
  const currentUser = getCurrentUser();
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);

  const [newUsername, setNewUsername] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newDisplayName, setNewDisplayName] = useState('');
  const [newRole, setNewRole] = useState<UserRole>('annotator');

  const refresh = () => {
    setLoading(true);
    api.listUsers()
      .then(setUsers)
      .catch((e) => setError(e instanceof Error ? e.message : 'Không tải được danh sách user'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { refresh(); }, []);

  if (currentUser?.role !== 'admin') {
    return (
      <div className="empty-state card">
        <ShieldCheck size={48} style={{ opacity: 0.5, marginBottom: 12 }} />
        <p>Chỉ admin mới quản lý được tài khoản. Liên hệ admin nếu bạn cần tạo tài khoản mới.</p>
      </div>
    );
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setCreating(true);
    try {
      const color = DEFAULT_COLORS[users.length % DEFAULT_COLORS.length];
      await api.createUser({
        username: newUsername.trim(),
        password: newPassword,
        display_name: newDisplayName.trim() || newUsername.trim(),
        role: newRole,
        color,
      });
      setNewUsername('');
      setNewPassword('');
      setNewDisplayName('');
      setNewRole('annotator');
      setShowCreate(false);
      refresh();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Tạo tài khoản thất bại';
      if (msg.includes('USERNAME_TAKEN')) setError('Tên đăng nhập đã tồn tại');
      else if (msg.includes('INVALID_USERNAME')) setError('Username phải 3-32 ký tự, chỉ gồm chữ/số/._-');
      else if (msg.includes('INVALID_PASSWORD')) setError('Mật khẩu tối thiểu 6 ký tự');
      else setError(msg);
    } finally {
      setCreating(false);
    }
  }

  async function handleRoleChange(u: User, role: string) {
    try {
      const updated = await api.updateUser(u.id, { role });
      setUsers((prev) => prev.map((x) => (x.id === u.id ? updated : x)));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Đổi role thất bại');
    }
  }

  async function handleToggleActive(u: User) {
    try {
      const updated = await api.updateUser(u.id, { is_active: !u.is_active });
      setUsers((prev) => prev.map((x) => (x.id === u.id ? updated : x)));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Đổi trạng thái thất bại');
    }
  }

  async function handleDelete(u: User) {
    if (u.id === currentUser?.id) {
      alert('Không thể tự xoá tài khoản của chính mình.');
      return;
    }
    if (!confirm(`Xoá tài khoản "${u.username}"? Nếu tài khoản đã có lịch sử thao tác, sẽ chỉ bị vô hiệu hoá (không xoá thật).`)) return;
    try {
      await api.deleteUser(u.id);
      refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Xoá tài khoản thất bại');
    }
  }

  return (
    <div>
      <div className="page-header">
        <h1 style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Users size={26} color="var(--accent-color)" />
          <span>Quản lý tài khoản</span>
        </h1>
        <button className="btn btn-primary" onClick={() => setShowCreate((v) => !v)}>
          <UserPlus size={18} />
          <span>{showCreate ? 'Đóng' : 'Thêm tài khoản'}</span>
        </button>
      </div>

      {error && (
        <div style={{
          background: 'rgba(240, 89, 34, 0.1)', border: '1px solid var(--danger)', color: 'var(--danger)',
          borderRadius: 8, padding: '10px 14px', fontSize: 13, marginBottom: 16,
        }}>
          {error}
        </div>
      )}

      {showCreate && (
        <form onSubmit={handleCreate} className="card" style={{ marginBottom: 20, maxWidth: 480 }}>
          <h3 style={{ marginTop: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
            <UserPlus size={20} color="var(--accent-color)" />
            <span>Tạo tài khoản mới</span>
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <label style={{ fontSize: 13, color: 'var(--text-primary)' }}>
              Tên đăng nhập
              <input type="text" value={newUsername} onChange={(e) => setNewUsername(e.target.value)}
                required autoComplete="off" placeholder="VD: nguyenvana"
                style={{ display: 'block', width: '100%', marginTop: 4, padding: '8px 10px', borderRadius: 6, border: '1px solid var(--border-color)', background: 'var(--bg-card)', color: 'var(--text-primary)', boxSizing: 'border-box' }} />
            </label>
            <label style={{ fontSize: 13, color: 'var(--text-primary)' }}>
              Mật khẩu (tối thiểu 6 ký tự)
              <input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)}
                required minLength={6} autoComplete="new-password"
                style={{ display: 'block', width: '100%', marginTop: 4, padding: '8px 10px', borderRadius: 6, border: '1px solid var(--border-color)', background: 'var(--bg-card)', color: 'var(--text-primary)', boxSizing: 'border-box' }} />
            </label>
            <label style={{ fontSize: 13, color: 'var(--text-primary)' }}>
              Tên hiển thị (tuỳ chọn)
              <input type="text" value={newDisplayName} onChange={(e) => setNewDisplayName(e.target.value)}
                placeholder="Nếu để trống sẽ dùng tên đăng nhập"
                style={{ display: 'block', width: '100%', marginTop: 4, padding: '8px 10px', borderRadius: 6, border: '1px solid var(--border-color)', background: 'var(--bg-card)', color: 'var(--text-primary)', boxSizing: 'border-box' }} />
            </label>
            <label style={{ fontSize: 13, color: 'var(--text-primary)' }}>
              Vai trò
              <select value={newRole} onChange={(e) => setNewRole(e.target.value as UserRole)}
                style={{ display: 'block', width: '100%', marginTop: 4, padding: '8px 10px', borderRadius: 6, border: '1px solid var(--border-color)', background: 'var(--bg-card)', color: 'var(--text-primary)' }}>
                <option value="annotator">Annotator — label ảnh</option>
                <option value="reviewer">Reviewer — duyệt/từ chối nhãn</option>
                <option value="admin">Admin — toàn quyền</option>
              </select>
            </label>
            <button type="submit" className="btn btn-primary" disabled={creating} style={{ marginTop: 4 }}>
              {creating ? 'Đang tạo...' : 'Tạo tài khoản'}
            </button>
          </div>
        </form>
      )}

      {loading ? (
        <div className="card" style={{ textAlign: 'center', padding: 40 }}>
          <p>Đang tải danh sách tài khoản...</p>
        </div>
      ) : (
        <div className="card" style={{ padding: 0, overflow: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, color: 'var(--text-primary)' }}>
            <thead>
              <tr style={{ background: 'var(--navy)', color: '#FFFFFF', textAlign: 'left' }}>
                <th style={{ padding: '10px 12px' }}>Tài khoản</th>
                <th style={{ padding: '10px 12px' }}>Tên hiển thị</th>
                <th style={{ padding: '10px 12px' }}>Vai trò</th>
                <th style={{ padding: '10px 12px' }}>Trạng thái</th>
                <th style={{ padding: '10px 12px' }}>Lần đăng nhập cuối</th>
                <th style={{ padding: '10px 12px' }}></th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} style={{ borderBottom: '1px solid var(--border-color)' }}>
                  <td style={{ padding: '10px 12px', display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ width: 10, height: 10, borderRadius: '50%', background: u.color || 'var(--navy-light)', display: 'inline-block' }} />
                    <span style={{ fontWeight: 600 }}>{u.username}</span>
                    {u.id === currentUser.id && <span style={{ color: 'var(--text-secondary)', fontSize: 11 }}>(bạn)</span>}
                  </td>
                  <td style={{ padding: '10px 12px' }}>{u.display_name}</td>
                  <td style={{ padding: '10px 12px' }}>
                    <select value={u.role} onChange={(e) => handleRoleChange(u, e.target.value)}
                      disabled={u.id === currentUser.id}
                      style={{ padding: '4px 6px', borderRadius: 5, border: '1px solid var(--border-color)', background: 'var(--bg-card)', color: 'var(--text-primary)' }}>
                      <option value="annotator">{ROLE_LABEL.annotator}</option>
                      <option value="reviewer">{ROLE_LABEL.reviewer}</option>
                      <option value="admin">{ROLE_LABEL.admin}</option>
                    </select>
                  </td>
                  <td style={{ padding: '10px 12px' }}>
                    <button className="btn btn-outline" style={{ padding: '3px 10px', fontSize: 12, gap: 4 }}
                      disabled={u.id === currentUser.id}
                      onClick={() => handleToggleActive(u)}>
                      {u.is_active ? <CheckCircle2 size={13} color="var(--success)" /> : <XCircle size={13} color="var(--danger)" />}
                      <span>{u.is_active ? 'Hoạt động' : 'Đã khoá'}</span>
                    </button>
                  </td>
                  <td style={{ padding: '10px 12px', color: 'var(--text-secondary)' }}>
                    {u.last_login_at ? new Date(u.last_login_at).toLocaleString('vi-VN') : 'Chưa đăng nhập'}
                  </td>
                  <td style={{ padding: '10px 12px', textAlign: 'right' }}>
                    <button className="btn btn-danger" style={{ padding: '3px 10px', fontSize: 12, gap: 4 }}
                      disabled={u.id === currentUser.id}
                      onClick={() => handleDelete(u)}>
                      <Trash2 size={13} />
                      <span>Xoá</span>
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

