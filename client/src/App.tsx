import { Routes, Route, Link } from 'react-router-dom';
import ProjectsPage from './pages/ProjectsPage';
import ProjectDetailPage from './pages/ProjectDetailPage';
import AnnotatorPage from './pages/AnnotatorPage';
import Logo from './components/Logo';

export default function App() {
  return (
    <div className="app-shell">
      <header className="topbar">
        <Link to="/" className="brand">
          <Logo size={28} />
          <span>KZTEK Labeling Studio</span>
        </Link>
        <span className="topbar-subtitle">Công cụ gán nhãn ảnh nội bộ</span>
      </header>
      <main className="app-main">
        <Routes>
          <Route path="/" element={<ProjectsPage />} />
          <Route path="/projects/:projectId" element={<ProjectDetailPage />} />
          <Route path="/projects/:projectId/annotate/:imageId" element={<AnnotatorPage />} />
        </Routes>
      </main>
    </div>
  );
}
