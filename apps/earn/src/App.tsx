import { AnimatePresence, motion } from 'framer-motion';
import { useEffect } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { Shell } from './components/Shell';
import { ToastProvider } from './components/ui';
import { AuthProvider, useAuth } from './lib/auth';
import { api } from './lib/api';
import { Data } from './pages/Data';
import { Extension } from './pages/Extension';
import { Login } from './pages/Login';
import { Overview } from './pages/Overview';
import { Settings } from './pages/Settings';

function Gate() {
  const { ready, authenticated, email, wallet } = useAuth();

  // Sync profile bits (email / signed-in wallet) once after login so the server knows them.
  useEffect(() => {
    if (!authenticated) return;
    const key = `root.synced.${email ?? ''}.${wallet ?? ''}`;
    if (sessionStorage.getItem(key)) return;
    api
      .updateMe({ email: email ?? undefined, ...(wallet ? {} : {}) })
      .then(() => sessionStorage.setItem(key, '1'))
      .catch(() => {});
  }, [authenticated, email, wallet]);

  if (!ready) {
    return (
      <div style={{ minHeight: '100dvh', display: 'grid', placeItems: 'center' }}>
        <motion.img src="/icons/logo-black.png" alt="" style={{ height: 34 }} animate={{ opacity: [0.3, 1, 0.3] }} transition={{ duration: 1.6, repeat: Infinity }} />
      </div>
    );
  }
  return (
    <AnimatePresence mode="wait">
      {authenticated ? (
        <motion.div key="app" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.3 }}>
          <Routes>
            <Route element={<Shell />}>
              <Route index element={<Overview />} />
              <Route path="data" element={<Data />} />
              <Route path="extension" element={<Extension />} />
              <Route path="settings" element={<Settings />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Route>
          </Routes>
        </motion.div>
      ) : (
        <motion.div key="login" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.3 }}>
          <Routes>
            <Route path="*" element={<Login />} />
          </Routes>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <ToastProvider>
          <Gate />
        </ToastProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}
