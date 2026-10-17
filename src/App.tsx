import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'sonner';
import Layout from './components/dashboard/Layout';
import Overview from './pages/Overview';
import ScrapedVideos from './pages/ScrapedVideos';
import UploadedVideos from './pages/UploadedVideos';
import R2Videos from './pages/R2Videos';
import TelegramBot from './pages/TelegramBot';
import SiteScraper from './pages/SiteScraper';
import { ThemeProvider } from './components/ThemeProvider';
import { ErrorBoundary } from './components/ErrorBoundary';

export default function App() {
  return (
    <ThemeProvider defaultTheme="light" storageKey="video-admin-theme">
      <Router>
        <Layout>
          <ErrorBoundary>
            <Routes>
              <Route path="/" element={<Navigate to="/overview" replace />} />
              <Route path="/overview" element={<Overview />} />
              <Route path="/scraped" element={<ScrapedVideos />} />
              <Route path="/r2-videos" element={<R2Videos />} />
              <Route path="/uploaded" element={<UploadedVideos />} />
              <Route path="/scrapers" element={<SiteScraper />} />
              <Route path="/telegram-bot" element={<TelegramBot />} />
              <Route path="/logs" element={<Navigate to="/overview" replace />} />
              <Route path="/settings" element={<Navigate to="/r2-videos" replace />} />
              {/* Catch-All Fallback for client-side routing */}
              <Route path="*" element={<Navigate to="/overview" replace />} />
            </Routes>
          </ErrorBoundary>
        </Layout>
        <Toaster position="top-right" richColors closeButton />
      </Router>
    </ThemeProvider>
  );
}
