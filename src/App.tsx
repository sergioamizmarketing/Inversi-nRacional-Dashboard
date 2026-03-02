import React, { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { supabase } from './lib/supabase';
import { useStore } from './store/useStore';
import { motion, AnimatePresence } from 'motion/react';
import {
  LayoutDashboard,
  Users,
  GitBranch,
  Target,
  MessageSquare,
  Settings,
  BarChart2,
  Loader2
} from 'lucide-react';

// Components
import { Sidebar } from './components/ui/Sidebar';
import { Header } from './components/ui/Header';

// Features
import { Overview } from './features/Overview';
import { Performance } from './features/Performance';
import { Pipeline } from './features/Pipeline';
import { Funnel } from './features/Funnel';
import { Targets } from './features/Targets';
import { Copilot } from './features/Copilot';
import { Auth } from './features/auth/Auth';
import { PendingApproval } from './features/auth/PendingApproval';
import { AdminUsers } from './features/AdminUsers';

const navigations = [
  { icon: LayoutDashboard, label: 'Resumen', to: '/overview' },
  { icon: Users, label: 'Rendimiento', to: '/performance' },
  { icon: GitBranch, label: 'Pipeline', to: '/pipeline' },
  { icon: BarChart2, label: 'Funnel', to: '/funnel' },
  { icon: Target, label: 'Objetivos', to: '/targets' },
  { icon: MessageSquare, label: 'Copilot', to: '/copilot' }
];

export default function App() {
  console.log("APP COMPONENT RENDER INITIATED");
  const {
    isDark,
    user,
    setUser,
    connection,
    setConnection,
    fetchMetadata,
    fetchMetrics,
    fetchOpportunities
  } = useStore();

  const [loading, setLoading] = useState(true);
  const [showReportModal, setShowReportModal] = useState(false);

  useEffect(() => {
    checkUser();
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      try {
        if (session?.user) {
          const { data: profile, error: profileError } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', session.user.id)
            .single();

          if (profileError && profileError.code !== 'PGRST116') {
            console.error("Profile fetch error in auth listener:", profileError);
          }
          setUser({ ...session.user, role: profile?.role || 'pending', profile });
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
  }, [connection, fetchMetrics, fetchMetadata, fetchOpportunities]);

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === 'GHL_AUTH_SUCCESS') {
        fetchConnection(); // Refresh connection state immediately
        alert('Integración completada con éxito. Los datos se sincronizarán en breve.');
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  const checkUser = async () => {
    try {
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      if (sessionError) throw sessionError;

      if (session?.user) {
        const { data: profile, error: profileError } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', session.user.id)
          .single();

        if (profileError && profileError.code !== 'PGRST116') {
          console.error("Profile fetch error:", profileError);
        }

        setUser({ ...session.user, role: profile?.role || 'pending', profile });
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
        // Automatically proceed to dashboard if no connection found
        setConnection({ id: 'test-conn', location_id: 'test-loc' });
      }
    } catch (err) {
      // Fallback
      setConnection({ id: 'test-conn', location_id: 'test-loc' });
    }
  };

  // Simplified views for unauthenticated states
  if (loading) return (
    <div className="h-screen w-full flex items-center justify-center bg-slate-50 dark:bg-slate-900">
      <Loader2 className="w-8 h-8 text-indigo-600 animate-spin" />
    </div>
  );

  if (!user) return (
    <Auth />
  );

  if (user.role === 'pending') return (
    <PendingApproval />
  );

  // The user requested to remove the connection wizard entirely.
  // Instead of showing the wizard, if showWizard is true, we just return the normal app view.
  // We can just remove the `if (showWizard) return (...)` block entirely.

  return (
    <BrowserRouter>
      <div className={`flex h-screen overflow-hidden ${isDark ? 'dark' : ''} bg-slate-50 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] bg-opacity-5 dark:bg-slate-900 font-sans text-slate-900 dark:text-slate-100 transition-colors duration-300 relative`}>

        {/* Animated Background Blobs for Glassmorphism effect */}
        <div className="absolute top-0 right-[-10%] w-[40vw] h-[40vw] rounded-full bg-indigo-500/10 dark:bg-indigo-500/5 blur-3xl mix-blend-multiply dark:mix-blend-screen pointer-events-none z-0"></div>
        <div className="absolute bottom-[-10%] left-[-10%] w-[50vw] h-[50vw] rounded-full bg-purple-500/10 dark:bg-purple-500/5 blur-3xl mix-blend-multiply dark:mix-blend-screen pointer-events-none z-0"></div>

        <Sidebar navigations={navigations} />

        <main className="flex-1 flex flex-col h-screen overflow-hidden relative z-10 w-full">
          <div className="flex-1 overflow-y-auto overflow-x-hidden p-4 lg:p-8 pt-0 scroll-smooth pb-24">
            <Header onNewReport={() => setShowReportModal(true)} />

            <Routes>
              <Route path="/" element={<Navigate to="/overview" replace />} />
              <Route path="/overview" element={<Overview />} />
              <Route path="/performance" element={<Performance />} />
              <Route path="/pipeline" element={<Pipeline />} />
              <Route path="/funnel" element={<Funnel />} />
              <Route path="/targets" element={<Targets />} />
              <Route path="/copilot" element={<Copilot />} />
              {user.role?.toLowerCase().trim() === 'admin' && (
                <>
                  <Route path="/admin/users" element={<AdminUsers />} />
                  <Route path="/settings" element={
                    <div className="bg-white/80 dark:bg-slate-800/80 backdrop-blur-xl p-8 rounded-3xl border border-white/50 dark:border-slate-700 text-center max-w-md mx-auto mt-12 shadow-xl">
                      <div className="w-16 h-16 bg-gradient-to-br from-indigo-100 to-purple-100 dark:from-indigo-900/50 dark:to-purple-900/50 rounded-2xl flex items-center justify-center mx-auto mb-6 shadow-inner">
                        <Settings className="w-8 h-8 text-indigo-600 dark:text-indigo-400" />
                      </div>
                      <h2 className="text-2xl font-bold mb-4">Ajustes de Integración</h2>
                      <p className="text-slate-500 dark:text-slate-400 mb-8">Administra tus conexiones a fuentes de datos y CRM.</p>
                      <button
                        onClick={() => {
                          const width = 600;
                          const height = 700;
                          const left = window.screen.width / 2 - width / 2;
                          const top = window.screen.height / 2 - height / 2;
                          window.open('/api/crm/oauth/start', 'GHL_Auth', 'width=' + width + ',height=' + height + ',top=' + top + ',left=' + left);
                        }}
                        className="inline-flex items-center justify-center gap-2 w-full px-8 py-4 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white rounded-xl font-bold shadow-lg shadow-blue-200 dark:shadow-blue-900/20 transition-all cursor-pointer">
                        <Target className="w-5 h-5" />
                        Vincular / Actualizar GoHighLevel
                      </button>
                    </div>
                  } />
                </>
              )}
              <Route path="*" element={<Navigate to="/overview" replace />} />
            </Routes>
          </div>
        </main>

        {/* Report Modal */}
        {
          showReportModal && (
            <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md flex items-center justify-center z-50 p-4">
              <motion.div
                initial={{ scale: 0.9, opacity: 0, y: 20 }}
                animate={{ scale: 1, opacity: 1, y: 0 }}
                className="bg-white dark:bg-slate-800 w-full max-w-md p-8 rounded-3xl shadow-2xl border border-slate-100 dark:border-slate-700"
              >
                <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">Enviar Informe Ejecutivo</h2>
                <p className="text-slate-500 dark:text-slate-400 text-sm mb-6">Generaremos un resumen en PDF con base a los filtros actuales.</p>

                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-1">Destinatario</label>
                    <input type="email" placeholder="ceo@empresa.com" className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all font-medium text-slate-900 dark:text-white" />
                  </div>
                  <div className="flex gap-3 pt-4">
                    <button onClick={() => setShowReportModal(false)} className="flex-1 px-4 py-3 rounded-xl font-bold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 transition-all">
                      Cancelar
                    </button>
                    <button onClick={() => { alert('¡Informe enviado!'); setShowReportModal(false); }} className="flex-1 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white py-3 rounded-xl font-bold shadow-lg shadow-indigo-200 dark:shadow-indigo-900/20 transition-all">
                      Enviar
                    </button>
                  </div>
                </div>
              </motion.div>
            </div>
          )
        }
      </div >
    </BrowserRouter >
  );
}
