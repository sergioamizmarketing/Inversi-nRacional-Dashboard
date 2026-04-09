import React, { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { supabase } from './lib/supabase';
import { useStore } from './store/useStore';
import {
  LayoutDashboard,
  Users,
  Target,
  MessageSquare,
  Settings,
  Loader2
} from 'lucide-react';

// Components
import { Sidebar } from './components/ui/Sidebar';
import { Header } from './components/ui/Header';
import { Toaster } from './components/ui/Toaster';

// Features
import { Overview } from './features/Overview';
import { Performance } from './features/Performance';
import { Targets } from './features/Targets';
import { Copilot } from './features/Copilot';
import { Settings as SettingsPage } from './features/Settings';
import { Auth } from './features/auth/Auth';
import { PendingApproval } from './features/auth/PendingApproval';
import { AdminUsers } from './features/AdminUsers';

const navigations = [
  { icon: LayoutDashboard, label: 'Resumen', to: '/overview' },
  { icon: Users, label: 'Rendimiento', to: '/performance' },
  { icon: Target, label: 'Objetivos', to: '/targets' },
  { icon: MessageSquare, label: 'Copilot', to: '/copilot' },
  { icon: Users, label: 'Gestión de Usuarios', to: '/admin/users' },
  { icon: Settings, label: 'Ajustes de Integración', to: '/settings' }
];

export default function App() {
  const {
    isDark,
    user,
    setUser,
    connection,
    setConnection,
    fetchMetadata,
    fetchMetrics,
    fetchOpportunities,
    filters,
    addToast
  } = useStore();

  const [loading, setLoading] = useState(true);

  // Sync isDark to the DOM — keep side effect out of the store
  useEffect(() => {
    if (isDark) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [isDark]);

  useEffect(() => {
    checkUser();
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      try {
        if (session?.user) {
          try {
            const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('Profile fetch timeout')), 8000));
            const profileRes = await Promise.race([
              fetch('/api/auth/profile', { headers: { Authorization: `Bearer ${session.access_token}` } }),
              timeoutPromise
            ]) as Response;

            if (profileRes.ok) {
              const profile = await profileRes.json();
              setUser({ ...session.user, role: profile?.role || 'pending', profile });
            } else {
              setUser({ ...session.user, role: 'pending', profile: null });
            }
          } catch (err) {
            console.error("Profile fetch error in auth listener:", err);
            setUser({ ...session.user, role: 'pending', profile: null });
          }
        } else {
          setUser(null);
        }
      } catch (err) {
        console.error("Auth state change error:", err);
        setUser(null);
      }
    });
    return () => subscription.unsubscribe();
  }, [setUser]);

  useEffect(() => {
    if (user) fetchConnection();
  }, [user]);

  useEffect(() => {
    if (connection) {
      fetchMetrics();
      fetchMetadata();
      fetchOpportunities();
    }
  }, [connection?.location_id, filters.startDate, filters.endDate, filters.pipelineId, filters.userId, fetchMetrics, fetchMetadata, fetchOpportunities]);

  // Real-time Database Listener
  useEffect(() => {
    if (!connection) return;

    const channel = supabase.channel(`dashboard_realtime_${connection.location_id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'opportunities', filter: `location_id=eq.${connection.location_id}` },
        () => {
          useStore.getState().fetchOpportunities();
          useStore.getState().fetchMetrics();
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'ghl_connection', filter: `location_id=eq.${connection.location_id}` },
        (payload) => {
          if (payload.new) {
            setConnection(payload.new as import('./store/useStore').GHLConnection);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [connection?.location_id, setConnection]);

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === 'GHL_AUTH_SUCCESS') {
        fetchConnection();
        addToast('Integración completada con éxito. Los datos se sincronizarán en breve.', 'success');
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  const checkUser = async () => {
    try {
      const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error("Supabase timeout")), 8000));

      const { data: { session }, error: sessionError } = await Promise.race([
        supabase.auth.getSession(),
        timeoutPromise
      ]) as any;
      if (sessionError) throw sessionError;

      if (session?.user) {
        try {
          const profileTimeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error("Profile timeout")), 8000));
          const profileRes = await Promise.race([
            fetch('/api/auth/profile', { headers: { Authorization: `Bearer ${session.access_token}` } }),
            profileTimeoutPromise
          ]) as Response;

          if (profileRes.ok) {
            const profile = await profileRes.json();
            setUser({ ...session.user, role: profile?.role || 'pending', profile });
          } else {
            console.warn("Backend profile fetch returned:", profileRes.status);
            setUser({ ...session.user, role: 'pending', profile: null });
          }
        } catch (profileErr) {
          console.error("Backend profile fetch error:", profileErr);
          setUser({ ...session.user, role: 'pending', profile: null });
        }
      } else {
        setUser(null);
      }
    } catch (err) {
      console.error("App boot auth check failed:", err);
      setUser(null);
    } finally {
      setLoading(false);
    }
  };

  const fetchConnection = async () => {
    try {
      const res = await fetch('/api/crm/status');
      const data = await res.json();
      if (data.connected && data.connection) {
        setConnection(data.connection);
      } else {
        setConnection(null);
      }
    } catch {
      setConnection(null);
    }
  };

  if (loading) return (
    <div className="h-screen w-full flex items-center justify-center bg-slate-50 dark:bg-slate-900">
      <Loader2 className="w-8 h-8 text-indigo-600 animate-spin" />
    </div>
  );

  if (!user) return <Auth />;

  if (user?.role === 'pending') return <PendingApproval />;

  return (
    <BrowserRouter>
      <div className={`flex h-screen overflow-hidden ${isDark ? 'dark' : ''} bg-slate-50 dark:bg-slate-900 font-sans text-slate-900 dark:text-slate-100 transition-colors duration-300 relative`}>

        {/* Animated Background Blobs for Glassmorphism effect */}
        <div className="absolute top-0 right-[-10%] w-[40vw] h-[40vw] rounded-full bg-indigo-500/10 dark:bg-indigo-500/5 blur-3xl mix-blend-multiply dark:mix-blend-screen pointer-events-none z-0"></div>
        <div className="absolute bottom-[-10%] left-[-10%] w-[50vw] h-[50vw] rounded-full bg-purple-500/10 dark:bg-purple-500/5 blur-3xl mix-blend-multiply dark:mix-blend-screen pointer-events-none z-0"></div>

        <Sidebar navigations={navigations} />

        <main className="flex-1 flex flex-col h-screen overflow-hidden relative z-10 w-full">
          <div className="flex-1 overflow-y-auto overflow-x-hidden p-4 lg:p-8 pt-0 scroll-smooth pb-24">
            <Header />

            <Routes>
              <Route path="/" element={<Navigate to="/overview" replace />} />
              <Route path="/overview" element={<Overview />} />
              <Route path="/performance" element={<Performance />} />
              <Route path="/targets" element={<Targets />} />
              <Route path="/copilot" element={<Copilot />} />
              {user?.role === 'admin' && (
                <>
                  <Route path="/admin/users" element={<AdminUsers />} />
                  <Route path="/settings" element={<SettingsPage />} />
                </>
              )}
              <Route path="*" element={<Navigate to="/overview" replace />} />
            </Routes>
          </div>
        </main>

        <Toaster />
      </div>
    </BrowserRouter>
  );
}
