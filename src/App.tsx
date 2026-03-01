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
  const [showWizard, setShowWizard] = useState(false);
  const [showReportModal, setShowReportModal] = useState(false);

  useEffect(() => {
    checkUser();
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
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

  const checkUser = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    setUser(session?.user ?? null);
    setLoading(false);
  };

  const fetchConnection = async () => {
    try {
      const res = await fetch('/api/crm/status');
      const data = await res.json();
      if (data.connected && data.connection) {
        setConnection(data.connection);
        setShowWizard(false);
      } else {
        setShowWizard(true);
      }
    } catch (err) {
      setShowWizard(true);
    }
  };

  // Simplified views for unauthenticated states
  if (loading) return (
    <div className="h-screen w-full flex items-center justify-center bg-slate-50 dark:bg-slate-900">
      <Loader2 className="w-8 h-8 text-indigo-600 animate-spin" />
    </div>
  );

  if (!user) return (
    <div className="h-screen flex items-center justify-center">
      <button onClick={() => setUser({ id: 'admin-bypass', email: 'admin@local.com', role: 'admin' })} className="px-6 py-3 bg-indigo-600 text-white rounded-xl font-bold">
        By-pass Login (Modo Demo)
      </button>
    </div>
  );

  if (showWizard) return (
    <div className="h-screen flex items-center justify-center text-center p-6">
      <div className="bg-white dark:bg-slate-800 p-8 rounded-3xl shadow-2xl max-w-md w-full border border-slate-100 dark:border-slate-700">
        <div className="w-16 h-16 bg-gradient-to-br from-indigo-100 to-purple-100 dark:from-indigo-900/50 dark:to-purple-900/50 rounded-2xl flex items-center justify-center mx-auto mb-6 shadow-inner">
          <GitBranch className="w-8 h-8 text-indigo-600 dark:text-indigo-400" />
        </div>
        <h2 className="text-2xl font-bold mb-4">Conectar CRM</h2>
        <p className="mb-6 text-slate-500 dark:text-slate-400">Vincular tu cuenta de GoHighLevel para comenzar a sincronizar métricas en tiempo real.</p>

        <div className="space-y-3">
          <a href="/api/crm/oauth/start" className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white rounded-xl font-bold shadow-lg shadow-blue-200 dark:shadow-blue-900/20 transition-all">
            <Target className="w-5 h-5" />
            Conectar con GoHighLevel
          </a>

          <div className="relative flex items-center py-2">
            <div className="flex-grow border-t border-slate-200 dark:border-slate-700"></div>
            <span className="flex-shrink-0 mx-4 text-slate-400 text-sm">o usar versión demo</span>
            <div className="flex-grow border-t border-slate-200 dark:border-slate-700"></div>
          </div>

          <button onClick={() => {
            setConnection({ id: 'test-conn', location_id: 'test-loc' });
            setShowWizard(false);
          }} className="w-full px-6 py-3 bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-300 rounded-xl font-bold transition-all">
            Continuar sin conectar (Modo Prueba)
          </button>
        </div>
      </div>
    </div>
  );

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
              <Route path="/settings" element={
                <div className="bg-white/80 dark:bg-slate-800/80 backdrop-blur-xl p-8 rounded-3xl border border-white/50 dark:border-slate-700 text-center max-w-md mx-auto mt-12 shadow-xl">
                  <div className="w-16 h-16 bg-gradient-to-br from-indigo-100 to-purple-100 dark:from-indigo-900/50 dark:to-purple-900/50 rounded-2xl flex items-center justify-center mx-auto mb-6 shadow-inner">
                    <Settings className="w-8 h-8 text-indigo-600 dark:text-indigo-400" />
                  </div>
                  <h2 className="text-2xl font-bold mb-4">Ajustes de Integración</h2>
                  <p className="text-slate-500 dark:text-slate-400 mb-8">Administra tus conexiones a fuentes de datos y CRM.</p>
                  <a href="/api/crm/oauth/start" className="inline-flex items-center justify-center gap-2 w-full px-8 py-4 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white rounded-xl font-bold shadow-lg shadow-blue-200 dark:shadow-blue-900/20 transition-all">
                    <Target className="w-5 h-5" />
                    Vincular / Actualizar GoHighLevel
                  </a>
                </div>
              } />
              <Route path="*" element={<Navigate to="/overview" replace />} />
            </Routes>
          </div>
        </main>

        {/* Report Modal */}
        {showReportModal && (
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
        )}
      </div>
    </BrowserRouter>
  );
}
