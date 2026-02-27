import React, { useState, useEffect } from 'react';
import { 
  LayoutDashboard, 
  Users, 
  GitBranch, 
  Target, 
  MessageSquare, 
  Settings,
  TrendingUp,
  DollarSign,
  CheckCircle,
  CheckCircle2,
  XCircle,
  Clock,
  ArrowUpRight,
  ArrowDownRight,
  Loader2,
  ChevronRight,
  ExternalLink,
  Plus,
  RefreshCw,
  Moon,
  Sun,
  PanelLeftClose,
  PanelLeftOpen,
  Filter,
  BarChart2
} from 'lucide-react';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer, 
  LineChart, 
  Line,
  PieChart,
  Pie,
  Cell
} from 'recharts';
import { motion, AnimatePresence } from 'motion/react';
import { supabase } from './lib/supabase';
import { format, subDays, startOfMonth, endOfMonth } from 'date-fns';

// --- Components ---

const Card = ({ title, value, subValue, icon: Icon, trend, trendValue }: any) => (
  <div className="bg-white dark:bg-slate-800 p-6 rounded-2xl border border-slate-100 dark:border-slate-700 shadow-sm transition-all">
    <div className="flex justify-between items-start mb-4">
      <div className="p-2 bg-slate-50 dark:bg-slate-700 rounded-lg">
        <Icon className="w-5 h-5 text-slate-600 dark:text-slate-300" />
      </div>
      {trend && (
        <div className={`flex items-center text-xs font-medium ${trend === 'up' ? 'text-emerald-600' : 'text-rose-600'}`}>
          {trend === 'up' ? <ArrowUpRight className="w-3 h-3 mr-1" /> : <ArrowDownRight className="w-3 h-3 mr-1" />}
          {trendValue}
        </div>
      )}
    </div>
    <h3 className="text-slate-500 dark:text-slate-400 text-sm font-medium mb-1">{title}</h3>
    <div className="flex items-baseline gap-2">
      <span className="text-2xl font-bold text-slate-900 dark:text-white">{value}</span>
      {subValue && <span className="text-slate-400 dark:text-slate-500 text-xs">{subValue}</span>}
    </div>
  </div>
);

const SidebarItem = ({ icon: Icon, label, active, onClick, collapsed }: any) => (
  <button
    onClick={onClick}
    className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${
      active 
        ? 'bg-indigo-600 text-white shadow-indigo-200 dark:shadow-indigo-900/20 shadow-lg' 
        : 'text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700 hover:text-slate-900 dark:hover:text-white'
    } ${collapsed ? 'justify-center px-0' : ''}`}
    title={collapsed ? label : ''}
  >
    <Icon className="w-5 h-5 flex-shrink-0" />
    {!collapsed && <span className="font-medium whitespace-nowrap">{label}</span>}
  </button>
);

// --- Main App ---

export default function App() {
  const [activeTab, setActiveTab] = useState('overview');
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [connection, setConnection] = useState<any>(null);
  const [metrics, setMetrics] = useState<any>(null);
  const [showWizard, setShowWizard] = useState(false);
  const [wizardStep, setWizardStep] = useState(1);
  const [showReportModal, setShowReportModal] = useState(false);
  const [reportEmail, setReportEmail] = useState('');
  const [sendingReport, setSendingReport] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [initializingInternal, setInitializingInternal] = useState(false);
  
  // New States
  const [isDark, setIsDark] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [pipelines, setPipelines] = useState<any[]>([]);
  const [ghlUsers, setGhlUsers] = useState<any[]>([]);
  const [opportunities, setOpportunities] = useState<any[]>([]);
  const [totalOpps, setTotalOpps] = useState(0);
  const [filters, setFilters] = useState({
    startDate: format(subDays(new Date(), 30), 'yyyy-MM-dd'),
    endDate: format(new Date(), 'yyyy-MM-dd'),
    pipelineId: '',
    userId: '',
    period: '30days'
  });

  useEffect(() => {
    if (isDark) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [isDark]);

  useEffect(() => {
    checkUser();
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });
    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (user) {
      fetchConnection();
    }
  }, [user]);

  useEffect(() => {
    if (connection) {
      fetchMetrics();
      fetchMetadata();
      fetchOpportunities();
    }
  }, [connection, filters]);

  const handlePeriodChange = (period: string) => {
    let start = new Date();
    let end = new Date();

    switch (period) {
      case 'all':
        start = new Date(2000, 0, 1);
        break;
      case '7days':
        start = subDays(end, 7);
        break;
      case '30days':
        start = subDays(end, 30);
        break;
      case '3months':
        start = subDays(end, 90);
        break;
      case '6months':
        start = subDays(end, 180);
        break;
      case 'year':
        start = subDays(end, 365);
        break;
      case 'custom':
        return setFilters(prev => ({ ...prev, period }));
    }

    setFilters(prev => ({
      ...prev,
      period,
      startDate: format(start, 'yyyy-MM-dd'),
      endDate: format(end, 'yyyy-MM-dd')
    }));
  };

  const fetchOpportunities = async () => {
    if (!connection) return;
    try {
      const query = new URLSearchParams({
        locationId: connection.location_id,
        startDate: filters.startDate,
        endDate: filters.endDate,
        pipelineId: filters.pipelineId,
        userId: filters.userId
      });
      const res = await fetch(`/api/crm/opportunities?${query.toString()}`);
      const data = await res.json();
      setOpportunities(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('Error fetching opportunities:', err);
      setOpportunities([]);
    }
  };

  const checkUser = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    setUser(session?.user ?? null);
    setLoading(false);
  };

  const fetchConnection = async () => {
    try {
      const { data } = await supabase.from('ghl_connections').select('*').maybeSingle();
      if (data) {
        setConnection(data);
        if (!showWizard) {
          setShowWizard(false);
        }
      } else {
        setShowWizard(true);
        setWizardStep(1);
      }
    } catch (err) {
      setShowWizard(true);
      setWizardStep(1);
    }
  };

  const fetchMetadata = async () => {
    if (!connection) return;
    try {
      const [pipeRes, userRes] = await Promise.all([
        fetch(`/api/crm/pipelines?locationId=${connection.location_id}`),
        fetch(`/api/crm/users?locationId=${connection.location_id}`)
      ]);
      
      if (pipeRes.ok) {
        const pipes = await pipeRes.json();
        setPipelines(Array.isArray(pipes) ? pipes : []);
      }
      
      if (userRes.ok) {
        const users = await userRes.json();
        setGhlUsers(Array.isArray(users) ? users : []);
      }
    } catch (err) {
      console.error('Error fetching metadata:', err);
    }
  };

  const fetchMetrics = async () => {
    if (!connection) return;
    try {
      const query = new URLSearchParams({
        locationId: connection.location_id,
        startDate: filters.startDate,
        endDate: filters.endDate,
        pipelineId: filters.pipelineId,
        userId: filters.userId
      });
      const res = await fetch(`/api/metrics/overview?${query.toString()}`);
      const data = await res.json();
      setMetrics(data);
      if (data.totalInDb !== undefined) setTotalOpps(data.totalInDb);
    } catch (err) {
      console.error(err);
    }
  };

  const handleConnectGHL = () => {
    const width = 600;
    const height = 700;
    const left = window.screenX + (window.outerWidth - width) / 2;
    const top = window.screenY + (window.outerHeight - height) / 2;
    
    const popup = window.open(
      '/api/crm/oauth/start',
      'crm_oauth',
      `width=${width},height=${height},left=${left},top=${top}`
    );

    window.addEventListener('message', (event) => {
      if (event.data?.type === 'GHL_AUTH_SUCCESS') {
        fetchConnection();
      }
    });
  };

  const handleInitInternal = async () => {
    setInitializingInternal(true);
    console.log("Initializing internal integration...");
    try {
      const res = await fetch('/api/crm/init-internal', { 
        method: 'POST',
        headers: { 'Accept': 'application/json' }
      });
      
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({ error: 'Unknown server error' }));
        console.error("Server error during initialization:", errorData);
        alert(`Error: ${errorData.error || 'The server returned an error.'}`);
        return;
      }

      const data = await res.json();
      console.log("Initialization success:", data);
      
      if (data.connection) {
        setConnection(data.connection);
        setWizardStep(2);
      } else {
        // Fallback to manual fetch if for some reason it's not in the response
        const { data: conn } = await supabase.from('ghl_connections').select('*').maybeSingle();
        if (conn) {
          setConnection(conn);
          setWizardStep(2);
        } else {
          alert("Integration successful, but we couldn't load the data. Please refresh the page.");
        }
      }
    } catch (err: any) {
      console.error("Network or unexpected error during initialization:", err);
      alert(`Connection failed: ${err.message || 'Check your internet connection and try again.'}`);
    } finally {
      setInitializingInternal(false);
    }
  };

  const handleSync = async () => {
    if (!connection) return;
    setSyncing(true);
    try {
      const res = await fetch('/api/crm/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ locationId: connection.location_id })
      });
      const data = await res.json();
      if (res.ok) {
        console.log(`Synced ${data.count} opportunities`);
        alert(`Sincronización completada: ${data.count} oportunidades actualizadas.`);
        await fetchMetrics();
        await fetchConnection(); // To update last sync time
      } else {
        alert(data.error || 'Sync failed');
      }
    } catch (err) {
      console.error('Sync error:', err);
      alert('Sync failed');
    } finally {
      setSyncing(false);
    }
  };

  const handleSendReport = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!metrics || !connection) return;
    
    setSendingReport(true);
    try {
      const res = await fetch('/api/reports/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: reportEmail,
          locationId: connection.location_id,
          metrics
        })
      });
      
      if (res.ok) {
        alert('Report sent successfully!');
        setShowReportModal(false);
        setReportEmail('');
      } else {
        throw new Error('Failed to send report');
      }
    } catch (err) {
      alert('Error sending report. Please try again.');
    } finally {
      setSendingReport(false);
    }
  };

  if (loading) return (
    <div className="h-screen w-full flex items-center justify-center bg-slate-50">
      <Loader2 className="w-8 h-8 text-indigo-600 animate-spin" />
    </div>
  );

  if (!user) return <LoginScreen onBypass={() => setUser({ id: 'admin-bypass', email: 'sergioamizmarketing@gmail.com', role: 'admin' })} />;

  if (showWizard) return (
    <WizardScreen 
      step={wizardStep}
      onConnect={handleConnectGHL} 
      onInitInternal={handleInitInternal} 
      onFinish={() => setShowWizard(false)}
      onSetStep={setWizardStep}
      onSync={handleSync}
      loading={initializingInternal || syncing} 
    />
  );

  return (
    <div className={`flex h-screen ${isDark ? 'dark' : ''} bg-slate-50 dark:bg-slate-900 font-sans text-slate-900 dark:text-slate-100 transition-colors`}>
      {/* Sidebar */}
      <aside className={`${sidebarOpen ? 'w-64' : 'w-20'} bg-white dark:bg-slate-800 border-r border-slate-200 dark:border-slate-700 p-6 flex flex-col gap-8 transition-all duration-300`}>
        <div className="flex items-center gap-2 px-2 overflow-hidden">
          <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center flex-shrink-0">
            <TrendingUp className="w-5 h-5 text-white" />
          </div>
          {sidebarOpen && <span className="font-bold text-xl tracking-tight dark:text-white">SalesOps</span>}
        </div>

        <nav className="flex-1 flex flex-col gap-2">
          <SidebarItem icon={LayoutDashboard} label="Resumen" active={activeTab === 'overview'} onClick={() => setActiveTab('overview')} collapsed={!sidebarOpen} />
          <SidebarItem icon={Users} label="Rendimiento" active={activeTab === 'performance'} onClick={() => setActiveTab('performance')} collapsed={!sidebarOpen} />
          <SidebarItem icon={GitBranch} label="Pipeline" active={activeTab === 'pipeline'} onClick={() => setActiveTab('pipeline')} collapsed={!sidebarOpen} />
          <SidebarItem icon={BarChart2} label="Funnel" active={activeTab === 'funnel'} onClick={() => setActiveTab('funnel')} collapsed={!sidebarOpen} />
          <SidebarItem icon={Target} label="Objetivos" active={activeTab === 'targets'} onClick={() => setActiveTab('targets')} collapsed={!sidebarOpen} />
          <SidebarItem icon={MessageSquare} label="Copilot" active={activeTab === 'copilot'} onClick={() => setActiveTab('copilot')} collapsed={!sidebarOpen} />
        </nav>

        <div className="pt-6 border-t border-slate-100 dark:border-slate-700">
          <SidebarItem icon={Settings} label="Ajustes" active={activeTab === 'settings'} onClick={() => setActiveTab('settings')} collapsed={!sidebarOpen} />
          <button 
            onClick={() => supabase.auth.signOut()}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-900/20 transition-all mt-2 ${!sidebarOpen ? 'justify-center px-0' : ''}`}
          >
            <XCircle className="w-5 h-5 flex-shrink-0" />
            {sidebarOpen && <span className="font-medium">Cerrar Sesión</span>}
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto p-8">
        <header className="flex flex-col gap-6 mb-8">
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-4">
              <button 
                onClick={() => setSidebarOpen(!sidebarOpen)}
                className="p-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-all"
              >
                {sidebarOpen ? <PanelLeftClose className="w-5 h-5" /> : <PanelLeftOpen className="w-5 h-5" />}
              </button>
              <div>
                <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
                  {activeTab === 'overview' ? 'Resumen Ejecutivo' : 
                   activeTab === 'performance' ? 'Rendimiento de Closers' :
                   activeTab === 'pipeline' ? 'Gestión de Pipeline' :
                   activeTab === 'funnel' ? 'Análisis de Funnel' :
                   activeTab === 'targets' ? 'Objetivos de Ventas' :
                   activeTab === 'copilot' ? 'Asistente IA Copilot' : 'Ajustes'}
                </h1>
                <p className="text-slate-500 dark:text-slate-400 text-sm">Bienvenido de nuevo, Admin. Esto es lo que está pasando hoy.</p>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <button 
                onClick={() => setIsDark(!isDark)}
                className="p-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-sm hover:bg-slate-50 dark:hover:bg-slate-700 transition-all"
              >
                {isDark ? <Sun className="w-5 h-5 text-amber-500" /> : <Moon className="w-5 h-5 text-slate-600" />}
              </button>
              <div className="bg-white dark:bg-slate-800 px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 flex items-center gap-3 text-sm font-medium text-slate-600 dark:text-slate-300 shadow-sm">
                <div className="flex items-center gap-2">
                  <Clock className="w-4 h-4" />
                  Sinc: {connection?.updated_at ? format(new Date(connection.updated_at), 'HH:mm') : 'Nunca'}
                </div>
                <div className="w-px h-4 bg-slate-200 dark:bg-slate-700" />
                <div className="text-[10px] text-slate-400 font-mono">
                  DB: {opportunities.length} / {totalOpps} opps
                </div>
                <div className="w-px h-4 bg-slate-200 dark:bg-slate-700" />
                <button 
                  onClick={handleSync}
                  disabled={syncing}
                  className="text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 transition-all flex items-center gap-1.5 disabled:opacity-50"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${syncing ? 'animate-spin' : ''}`} />
                  {syncing ? 'Sincronizando...' : 'Sincronizar'}
                </button>
              </div>
              <button 
                onClick={() => setShowReportModal(true)}
                className="bg-indigo-600 text-white px-4 py-2 rounded-xl font-semibold shadow-lg shadow-indigo-200 dark:shadow-indigo-900/20 hover:bg-indigo-700 transition-all flex items-center gap-2"
              >
                <Plus className="w-4 h-4" />
                Nuevo Informe
              </button>
            </div>
          </div>

          {/* Filters Bar */}
          <div className="bg-white dark:bg-slate-800 p-4 rounded-2xl border border-slate-100 dark:border-slate-700 shadow-sm flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400 text-sm font-medium">
              <Filter className="w-4 h-4" />
              Filtros:
            </div>
            
            <div className="flex items-center gap-2">
              <select 
                value={filters.period}
                onChange={(e) => handlePeriodChange(e.target.value)}
                className="bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg px-3 py-1.5 text-xs focus:ring-2 focus:ring-indigo-500 outline-none transition-all dark:text-white"
              >
                <option value="all">Todo el tiempo</option>
                <option value="7days">Últimos 7 días</option>
                <option value="30days">Últimos 30 días</option>
                <option value="3months">Últimos 3 meses</option>
                <option value="6months">Últimos 6 meses</option>
                <option value="year">Último año</option>
                <option value="custom">Periodo personalizado</option>
              </select>
            </div>

            {filters.period === 'custom' && (
              <div className="flex items-center gap-2">
                <input 
                  type="date" 
                  value={filters.startDate}
                  onChange={(e) => setFilters(prev => ({ ...prev, startDate: e.target.value }))}
                  className="bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg px-3 py-1.5 text-xs focus:ring-2 focus:ring-indigo-500 outline-none transition-all dark:text-white"
                />
                <span className="text-slate-400">a</span>
                <input 
                  type="date" 
                  value={filters.endDate}
                  onChange={(e) => setFilters(prev => ({ ...prev, endDate: e.target.value }))}
                  className="bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg px-3 py-1.5 text-xs focus:ring-2 focus:ring-indigo-500 outline-none transition-all dark:text-white"
                />
              </div>
            )}

            <select 
              value={filters.pipelineId}
              onChange={(e) => setFilters(prev => ({ ...prev, pipelineId: e.target.value }))}
              className="bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg px-3 py-1.5 text-xs focus:ring-2 focus:ring-indigo-500 outline-none transition-all dark:text-white min-w-[150px]"
            >
              <option value="">Todos los Pipelines</option>
              {Array.isArray(pipelines) && pipelines.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            <select 
              value={filters.userId}
              onChange={(e) => setFilters(prev => ({ ...prev, userId: e.target.value }))}
              className="bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg px-3 py-1.5 text-xs focus:ring-2 focus:ring-indigo-500 outline-none transition-all dark:text-white min-w-[150px]"
            >
              <option value="">Todos los Closers</option>
              {Array.isArray(ghlUsers) && ghlUsers.map(u => <option key={u.id} value={u.id}>{u.firstName} {u.lastName}</option>)}
            </select>
            {(filters.pipelineId || filters.userId || filters.period !== '30days') && (
              <button 
                onClick={() => {
                  handlePeriodChange('30days');
                  setFilters(prev => ({ ...prev, pipelineId: '', userId: '' }));
                }}
                className="text-xs text-rose-500 font-medium hover:underline"
              >
                Limpiar Filtros
              </button>
            )}
          </div>
        </header>

        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2 }}
          >
            {activeTab === 'overview' && <Overview metrics={metrics} opportunities={opportunities} />}
            {activeTab === 'performance' && <Performance ghlUsers={ghlUsers} opportunities={opportunities} />}
            {activeTab === 'pipeline' && <Pipeline pipelines={pipelines} opportunities={opportunities} filters={filters} />}
            {activeTab === 'funnel' && <Funnel pipelines={pipelines} locationId={connection?.location_id} filters={filters} />}
            {activeTab === 'targets' && <Targets locationId={connection?.location_id} metrics={metrics} />}
            {activeTab === 'copilot' && <Copilot />}
          </motion.div>
        </AnimatePresence>
      </main>

      {/* Report Modal */}
      {showReportModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-6">
          <motion.div 
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="bg-white w-full max-w-md p-8 rounded-3xl shadow-2xl"
          >
            <h2 className="text-2xl font-bold text-slate-900 mb-2">Send Executive Report</h2>
            <p className="text-slate-500 text-sm mb-6">Enter the email address where you'd like to receive the HTML report.</p>
            
            <form onSubmit={handleSendReport} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Recipient Email</label>
                <input 
                  type="email" 
                  required 
                  value={reportEmail}
                  onChange={(e) => setReportEmail(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
                  placeholder="manager@example.com"
                />
              </div>
              <div className="flex gap-3 pt-2">
                <button 
                  type="button"
                  onClick={() => setShowReportModal(false)}
                  className="flex-1 px-4 py-3 rounded-xl font-bold text-slate-600 hover:bg-slate-50 transition-all"
                >
                  Cancel
                </button>
                <button 
                  type="submit"
                  disabled={sendingReport}
                  className="flex-1 bg-indigo-600 text-white py-3 rounded-xl font-bold shadow-lg shadow-indigo-200 hover:bg-indigo-700 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {sendingReport ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Send Report'}
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}
    </div>
  );
}

// --- Screens ---

function Overview({ metrics, opportunities }: any) {
  if (!metrics) return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 animate-pulse">
      {[1,2,3,4].map(i => <div key={i} className="h-32 bg-slate-200 dark:bg-slate-700 rounded-2xl" />)}
    </div>
  );

  // Calculate trend data
  const safeOpps = Array.isArray(opportunities) ? opportunities : [];
  const sortedOpps = [...safeOpps]
    .filter(o => o.created_at)
    .sort((a: any, b: any) => 
      new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    );

  const trendData = sortedOpps.reduce((acc: any[], opp: any) => {
    try {
      const date = format(new Date(opp.created_at), 'dd/MM');
      const existing = acc.find(d => d.name === date);
      if (existing) {
        if (opp.status === 'won') existing.value += Number(opp.value || 0);
      } else {
        acc.push({ name: date, value: opp.status === 'won' ? Number(opp.value || 0) : 0 });
      }
    } catch (e) {
      // Skip invalid dates
    }
    return acc;
  }, []).slice(-10);

  // Calculate distribution data (by status)
  const distributionData = [
    { name: 'Abiertas', value: safeOpps.filter((o: any) => o.status === 'open').length },
    { name: 'Ganadas', value: safeOpps.filter((o: any) => o.status === 'won').length },
    { name: 'Perdidas', value: safeOpps.filter((o: any) => o.status === 'lost').length },
    { name: 'Abandonadas', value: safeOpps.filter((o: any) => o.status === 'abandoned').length },
  ];

  if (safeOpps.length === 0 && metrics?.totalOpps === 0) {
    return (
      <div className="bg-white dark:bg-slate-800 p-12 rounded-3xl border border-slate-100 dark:border-slate-700 shadow-sm text-center">
        <div className="w-16 h-16 bg-slate-100 dark:bg-slate-700 rounded-full flex items-center justify-center mx-auto mb-4">
          <Users className="w-8 h-8 text-slate-400" />
        </div>
        <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-2">No hay datos para este periodo</h3>
        <p className="text-slate-500 dark:text-slate-400 max-w-sm mx-auto">
          No se han encontrado oportunidades con los filtros actuales. Prueba a cambiar el rango de fechas o sincroniza los datos de GoHighLevel.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <Card title="Ingresos Totales" value={`${(metrics.revenue || 0).toLocaleString()}€`} subValue="Periodo seleccionado" icon={DollarSign} trend={metrics.revenue > 0 ? "up" : "down"} trendValue="" />
        <Card title="Oportunidades" value={metrics.totalOpps || 0} subValue="Total leads" icon={Users} trend="up" trendValue="" />
        <Card title="Tasa de Cierre" value={`${(metrics.winRate || 0).toFixed(1)}%`} subValue="Conversión" icon={CheckCircle} trend="up" trendValue="" />
        <Card title="Valor del Pipeline" value={`${(metrics.pipelineValue || 0).toLocaleString()}€`} subValue="Tratos abiertos" icon={GitBranch} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white dark:bg-slate-800 p-6 rounded-2xl border border-slate-100 dark:border-slate-700 shadow-sm transition-all">
          <h3 className="font-bold text-slate-900 dark:text-white mb-6">Tendencia de Ingresos</h3>
          <div className="h-80 min-h-[320px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={trendData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" className="dark:stroke-slate-700" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 12 }} dy={10} />
                <YAxis axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 12 }} />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#fff', borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                />
                <Line type="monotone" dataKey="value" stroke="#4f46e5" strokeWidth={3} dot={{ r: 4, fill: '#4f46e5', strokeWidth: 2, stroke: '#fff' }} activeDot={{ r: 6 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <p className="text-[10px] text-slate-400 mt-4 text-center italic">* Evolución de ingresos ganados en el periodo</p>
        </div>

        <div className="bg-white dark:bg-slate-800 p-6 rounded-2xl border border-slate-100 dark:border-slate-700 shadow-sm transition-all">
          <h3 className="font-bold text-slate-900 dark:text-white mb-6">Distribución de Oportunidades</h3>
          <div className="h-80 min-h-[320px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={distributionData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" className="dark:stroke-slate-700" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 12 }} dy={10} />
                <YAxis axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 12 }} />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#fff', borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                />
                <Bar dataKey="value" fill="#4f46e5" radius={[4, 4, 0, 0]} barSize={40} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <p className="text-[10px] text-slate-400 mt-4 text-center italic">* Distribución por estado en el periodo seleccionado</p>
        </div>
      </div>
    </div>
  );
}

function Performance({ ghlUsers, opportunities }: any) {
  const safeOpps = Array.isArray(opportunities) ? opportunities : [];
  const performanceData = (Array.isArray(ghlUsers) ? ghlUsers : []).map((user: any) => {
    const userOpps = safeOpps.filter((o: any) => o.owner_user_id === user.id);
    const wonOpps = userOpps.filter((o: any) => o.status === 'won');
    const revenue = wonOpps.reduce((sum: number, o: any) => sum + Number(o.value || 0), 0);
    const winRate = userOpps.length > 0 ? (wonOpps.length / userOpps.length) * 100 : 0;
    const avgDeal = wonOpps.length > 0 ? revenue / wonOpps.length : 0;

    return {
      ...user,
      revenue,
      oppCount: userOpps.length,
      winRate,
      avgDeal
    };
  }).sort((a: any, b: any) => b.revenue - a.revenue);

  return (
    <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-100 dark:border-slate-700 shadow-sm overflow-hidden transition-all">
      <table className="w-full text-left">
        <thead className="bg-slate-50 dark:bg-slate-700/50 border-b border-slate-100 dark:border-slate-700">
          <tr>
            <th className="px-6 py-4 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Closer</th>
            <th className="px-6 py-4 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Ingresos</th>
            <th className="px-6 py-4 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Oportunidades</th>
            <th className="px-6 py-4 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Tasa de Cierre</th>
            <th className="px-6 py-4 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Trato Medio</th>
            <th className="px-6 py-4 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Tendencia</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
          {performanceData.length > 0 ? performanceData.map((closer: any) => (
            <tr key={closer.id} className="hover:bg-slate-50 dark:hover:bg-slate-700/30 transition-colors cursor-pointer">
              <td className="px-6 py-4">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-indigo-100 dark:bg-indigo-900/30 flex items-center justify-center text-indigo-700 dark:text-indigo-300 font-bold text-xs">
                    {closer.firstName?.[0] || 'U'}{closer.lastName?.[0] || ''}
                  </div>
                  <span className="font-medium text-slate-900 dark:text-white">{closer.firstName} {closer.lastName}</span>
                </div>
              </td>
              <td className="px-6 py-4 font-semibold text-slate-900 dark:text-white">{closer.revenue.toLocaleString()}€</td>
              <td className="px-6 py-4 text-slate-600 dark:text-slate-400">{closer.oppCount}</td>
              <td className="px-6 py-4">
                <div className="flex items-center gap-2">
                  <div className="flex-1 h-1.5 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden w-24">
                    <div className="h-full bg-indigo-600" style={{ width: `${closer.winRate}%` }} />
                  </div>
                  <span className="text-sm text-slate-600 dark:text-slate-400">{closer.winRate.toFixed(1)}%</span>
                </div>
              </td>
              <td className="px-6 py-4 text-slate-600 dark:text-slate-400">{closer.avgDeal.toLocaleString()}€</td>
              <td className="px-6 py-4">
                <TrendingUp className={`w-4 h-4 ${closer.revenue > 0 ? 'text-emerald-500' : 'text-slate-300'}`} />
              </td>
            </tr>
          )) : (
            <tr>
              <td colSpan={6} className="px-6 py-12 text-center text-slate-500">No se han encontrado closers activos.</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function Pipeline({ pipelines, opportunities, filters }: any) {
  const filteredPipelines = Array.isArray(pipelines) 
    ? (filters.pipelineId 
        ? pipelines.filter((p: any) => p.id === filters.pipelineId) 
        : pipelines)
    : [];

  return (
    <div className="flex gap-6 overflow-x-auto pb-4">
      {filteredPipelines.length > 0 ? filteredPipelines.map((pipe: any) => (
        <div key={pipe.id} className="flex-shrink-0 w-80">
          <div className="flex justify-between items-center mb-4 px-2">
            <div className="flex items-center gap-2">
              <h3 className="font-bold text-slate-900 dark:text-white">{pipe.name}</h3>
              <span className="bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400 text-xs px-2 py-0.5 rounded-full font-medium">
                {pipe.stages?.length || 0} etapas
              </span>
            </div>
          </div>
          <div className="space-y-3">
            {pipe.stages?.map((stage: any) => {
              const safeOpps = Array.isArray(opportunities) ? opportunities : [];
              const stageOpps = safeOpps.filter((o: any) => o.stage_id === stage.id);
              const stageValue = stageOpps.reduce((sum: number, o: any) => sum + Number(o.value || 0), 0);

              return (
                <div key={stage.id} className="bg-white dark:bg-slate-800 p-4 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm hover:border-indigo-300 transition-all cursor-pointer group">
                  <div className="flex justify-between items-start mb-2">
                    <span className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-900/20 px-2 py-0.5 rounded uppercase tracking-wider">
                      {stageOpps.length} Oportunidades
                    </span>
                    <span className="text-slate-400 group-hover:text-indigo-600 transition-colors">
                      <ChevronRight className="w-4 h-4" />
                    </span>
                  </div>
                  <h4 className="font-bold text-slate-900 dark:text-white mb-1">{stage.name}</h4>
                  <div className="flex justify-between items-center mt-2">
                    <p className="text-slate-500 dark:text-slate-400 text-xs font-medium">{stageValue.toLocaleString()}€</p>
                    <div className="flex -space-x-2">
                      {stageOpps.slice(0, 3).map((o: any) => (
                        <div key={o.id} className="w-6 h-6 rounded-full border-2 border-white dark:border-slate-800 bg-slate-200 dark:bg-slate-700 flex items-center justify-center text-[8px] font-bold">
                          {o.name[0]}
                        </div>
                      ))}
                      {stageOpps.length > 3 && (
                        <div className="w-6 h-6 rounded-full border-2 border-white dark:border-slate-800 bg-slate-100 dark:bg-slate-700 flex items-center justify-center text-[8px] font-bold">
                          +{stageOpps.length - 3}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )) : (
        <div className="w-full py-12 text-center text-slate-500">No hay pipelines configurados o seleccionados.</div>
      )}
    </div>
  );
}

function Funnel({ pipelines, locationId, filters }: any) {
  const [selectedPipe, setSelectedPipe] = useState<string>('');
  const [funnelData, setFunnelData] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (filters.pipelineId) {
      setSelectedPipe(filters.pipelineId);
    } else if (pipelines.length > 0 && !selectedPipe) {
      setSelectedPipe(pipelines[0].id);
    }
  }, [pipelines, filters.pipelineId]);

  useEffect(() => {
    if (selectedPipe && locationId) {
      fetchFunnel();
    }
  }, [selectedPipe, locationId, filters]);

  const fetchFunnel = async () => {
    setLoading(true);
    try {
      const query = new URLSearchParams({
        locationId,
        pipelineId: selectedPipe,
        startDate: filters.startDate,
        endDate: filters.endDate,
        userId: filters.userId
      });
      const res = await fetch(`/api/crm/funnel?${query.toString()}`);
      const data = await res.json();
      setFunnelData(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const currentPipe = pipelines.find((p: any) => p.id === selectedPipe);

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h3 className="font-bold text-slate-900 dark:text-white">Análisis de Embudo por Etapa</h3>
        <select 
          value={selectedPipe}
          onChange={(e) => setSelectedPipe(e.target.value)}
          className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none transition-all dark:text-white shadow-sm"
        >
          {Array.isArray(pipelines) && pipelines.map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </div>

      <div className="bg-white dark:bg-slate-800 p-8 rounded-3xl border border-slate-100 dark:border-slate-700 shadow-sm transition-all">
        {loading ? (
          <div className="h-64 flex items-center justify-center">
            <Loader2 className="w-8 h-8 text-indigo-600 animate-spin" />
          </div>
        ) : currentPipe ? (
          <div className="space-y-4 max-w-2xl mx-auto">
            {currentPipe.stages.map((stage: any, index: number) => {
              const count = funnelData?.[stage.id] || 0;
              const total = Object.values(funnelData || {}).reduce((a: any, b: any) => a + b, 0) as number;
              const percentage = total > 0 ? (count / total) * 100 : 0;
              const width = 100 - (index * 10); // Visual funnel effect

              return (
                <div key={stage.id} className="relative group">
                  <div 
                    className="h-16 bg-indigo-600 rounded-xl flex items-center justify-between px-6 transition-all group-hover:bg-indigo-700 shadow-lg shadow-indigo-500/10"
                    style={{ width: `${width}%`, margin: '0 auto' }}
                  >
                    <span className="text-white font-bold text-sm truncate pr-4">{stage.name}</span>
                    <div className="flex items-center gap-3">
                      <span className="text-indigo-100 text-xs font-medium">{percentage.toFixed(0)}%</span>
                      <span className="bg-white/20 text-white px-3 py-1 rounded-lg text-sm font-bold">{count}</span>
                    </div>
                  </div>
                  {index < currentPipe.stages.length - 1 && (
                    <div className="h-4 w-px bg-slate-200 dark:bg-slate-700 mx-auto" />
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <div className="text-center py-12 text-slate-500">Selecciona un pipeline para ver el funnel.</div>
        )}
      </div>
    </div>
  );
}

function Targets({ locationId, metrics }: { locationId: string, metrics: any }) {
  const [targets, setTargets] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editTargets, setEditTargets] = useState<any[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (locationId) {
      fetchTargets();
    }
  }, [locationId]);

  const fetchTargets = async () => {
    try {
      setLoading(true);
      const res = await fetch(`/api/targets?locationId=${locationId}`);
      const data = await res.json();
      
      // Default targets if none exist
      const defaultTargets = [
        { name: 'Ingresos Mensuales', target_value: 50000, unit: '€', period: 'month' },
        { name: 'Nuevas Oportunidades', target_value: 100, unit: '', period: 'month' },
        { name: 'Tasa de Cierre', target_value: 25, unit: '%', period: 'month' },
        { name: 'Valor de Pipeline', target_value: 200000, unit: '€', period: 'month' }
      ];

      if (data && data.length > 0) {
        setTargets(data);
      } else {
        setTargets(defaultTargets);
      }
    } catch (err) {
      console.error('Error fetching targets:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      const res = await fetch('/api/targets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ locationId, targets: editTargets })
      });
      if (res.ok) {
        setTargets(editTargets);
        setShowEditModal(false);
      }
    } catch (err) {
      console.error('Error saving targets:', err);
    } finally {
      setSaving(false);
    }
  };

  const getMetricValue = (name: string) => {
    if (!metrics) return 0;
    switch (name) {
      case 'Ingresos Mensuales': return metrics.revenue || 0;
      case 'Nuevas Oportunidades': return metrics.totalOpps || 0;
      case 'Tasa de Cierre': return metrics.winRate || 0;
      case 'Valor de Pipeline': return metrics.pipelineValue || 0;
      default: return 0;
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 text-indigo-600 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        <button 
          onClick={() => {
            setEditTargets(targets);
            setShowEditModal(true);
          }}
          className="bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm hover:bg-slate-50 dark:hover:bg-slate-700 transition-all flex items-center gap-2 text-sm font-medium"
        >
          <Settings className="w-4 h-4" />
          Configurar Objetivos
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {targets.map((t, idx) => {
          const current = getMetricValue(t.name);
          const target = t.target_value || 1;
          const progress = Math.min((current / target) * 100, 100);
          return (
            <div key={idx} className="bg-white dark:bg-slate-800 p-8 rounded-3xl border border-slate-100 dark:border-slate-700 shadow-sm transition-all">
              <div className="flex justify-between items-start mb-6">
                <div>
                  <h4 className="text-slate-500 dark:text-slate-400 text-sm font-medium mb-1">{t.name}</h4>
                  <div className="flex items-baseline gap-2">
                    <span className="text-3xl font-bold text-slate-900 dark:text-white">{current.toLocaleString()}{t.unit}</span>
                    <span className="text-slate-400 text-sm">de {target.toLocaleString()}{t.unit}</span>
                  </div>
                </div>
                <div className="bg-indigo-50 dark:bg-indigo-900/20 p-3 rounded-2xl">
                  <Target className="w-6 h-6 text-indigo-600 dark:text-indigo-400" />
                </div>
              </div>
              
              <div className="space-y-2">
                <div className="flex justify-between text-xs font-bold">
                  <span className="text-indigo-600 dark:text-indigo-400">{progress.toFixed(1)}% Completado</span>
                  <span className="text-slate-400">{Math.max(0, target - current).toLocaleString()}{t.unit} restantes</span>
                </div>
                <div className="h-3 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
                  <motion.div 
                    initial={{ width: 0 }}
                    animate={{ width: `${progress}%` }}
                    transition={{ duration: 1, ease: "easeOut" }}
                    className="h-full bg-indigo-600 rounded-full shadow-lg shadow-indigo-500/20"
                  />
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {showEditModal && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-6">
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white dark:bg-slate-800 w-full max-w-lg rounded-3xl shadow-2xl border border-slate-100 dark:border-slate-700 overflow-hidden"
          >
            <div className="p-8">
              <h3 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">Configurar Objetivos</h3>
              <p className="text-slate-500 dark:text-slate-400 mb-8">Establece las metas para tu equipo de ventas.</p>
              
              <div className="space-y-6">
                {editTargets.map((t, idx) => (
                  <div key={idx} className="space-y-2">
                    <label className="text-sm font-bold text-slate-700 dark:text-slate-300">{t.name}</label>
                    <div className="flex gap-2">
                      <input 
                        type="number"
                        value={t.target_value}
                        onChange={(e) => {
                          const newTargets = [...editTargets];
                          newTargets[idx].target_value = e.target.value;
                          setEditTargets(newTargets);
                        }}
                        className="flex-1 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-xl px-4 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none dark:text-white"
                      />
                      <span className="bg-slate-100 dark:bg-slate-600 px-4 py-2 rounded-xl text-sm font-bold text-slate-500 dark:text-slate-300">
                        {t.unit || 'uds'}
                      </span>
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex gap-3 mt-10">
                <button 
                  onClick={() => setShowEditModal(false)}
                  className="flex-1 px-6 py-3 rounded-xl font-bold text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-700 transition-all"
                >
                  Cancelar
                </button>
                <button 
                  onClick={handleSave}
                  disabled={saving}
                  className="flex-1 bg-indigo-600 text-white px-6 py-3 rounded-xl font-bold shadow-lg shadow-indigo-200 dark:shadow-indigo-900/20 hover:bg-indigo-700 transition-all flex items-center justify-center gap-2"
                >
                  {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                  Guardar Cambios
                </button>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
}

function Copilot() {
  const [messages, setMessages] = useState([
    { role: 'assistant', content: '¡Hola! Soy tu Copilot de SalesOps. ¿En qué puedo ayudarte a analizar tus datos hoy?' }
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSend = async () => {
    if (!input.trim() || loading) return;
    
    const userMessage = { role: 'user', content: input };
    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setLoading(true);

    try {
      const res = await fetch('/api/copilot/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          query: input,
          context: { /* Add relevant metrics context here */ }
        })
      });
      
      const data = await res.json();
      setMessages(prev => [...prev, { 
        role: 'assistant', 
        content: data.answer || "No he podido procesar eso. Por favor, inténtalo de nuevo." 
      }]);
    } catch (err) {
      setMessages(prev => [...prev, { role: 'assistant', content: "Error conectando con el servicio de IA." }]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-white dark:bg-slate-800 rounded-3xl border border-slate-100 dark:border-slate-700 shadow-sm h-[600px] flex flex-col transition-all">
      <div className="flex-1 overflow-y-auto p-6 space-y-4">
        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[80%] p-4 rounded-2xl ${
              m.role === 'user' 
                ? 'bg-indigo-600 text-white rounded-tr-none shadow-lg shadow-indigo-500/10' 
                : 'bg-slate-50 dark:bg-slate-700 text-slate-800 dark:text-slate-100 rounded-tl-none border border-slate-100 dark:border-slate-600'
            }`}>
              <p className="text-sm leading-relaxed whitespace-pre-wrap">{m.content}</p>
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex justify-start">
            <div className="bg-slate-50 dark:bg-slate-700 p-4 rounded-2xl rounded-tl-none border border-slate-100 dark:border-slate-600">
              <Loader2 className="w-4 h-4 text-indigo-600 animate-spin" />
            </div>
          </div>
        )}
      </div>
      <div className="p-4 border-t border-slate-100 dark:border-slate-700">
        <div className="flex gap-2">
          <input 
            type="text" 
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && handleSend()}
            placeholder="Pregunta sobre tu tasa de cierre, cuellos de botella o rendimiento..."
            className="flex-1 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-xl px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all dark:text-white"
          />
          <button 
            onClick={handleSend}
            disabled={loading}
            className="bg-indigo-600 text-white p-2 rounded-xl hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-100 disabled:opacity-50"
          >
            <ArrowUpRight className="w-5 h-5" />
          </button>
        </div>
      </div>
    </div>
  );
}

function LoginScreen({ onBypass }: { onBypass: () => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [isSignUp, setIsSignUp] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setAuthError(null);

    // Special handling for the designated admin email
    if (email === "sergioamizmarketing@gmail.com" && isSignUp) {
      try {
        const res = await fetch('/api/auth/setup-admin', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password })
        });
        const data = await res.json();
        if (res.ok) {
          alert(data.message + " You can now sign in.");
          setIsSignUp(false);
          setLoading(false);
          return;
        } else {
          setAuthError(data.error);
          setLoading(false);
          return;
        }
      } catch (err: any) {
        setAuthError("Connection error. Please try again.");
        setLoading(false);
        return;
      }
    }
    
    if (isSignUp) {
      const { error } = await supabase.auth.signUp({ 
        email, 
        password,
        options: {
          data: {
            full_name: 'Admin User',
          }
        }
      });
      if (error) {
        setAuthError(error.message);
      } else {
        alert('Registration successful! Please check your email for confirmation or try signing in.');
        setIsSignUp(false);
      }
    } else {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        if (error.message.includes("Invalid login credentials")) {
          setAuthError("Invalid credentials. If you haven't registered, use Sign Up. Note: Passwords must be at least 6 characters.");
        } else if (error.message.includes("Email not confirmed")) {
          setAuthError("Email not confirmed. If you are the admin, use the Sign Up option once to auto-confirm your account.");
        } else if (error.message.includes("Email logins are disabled")) {
          setAuthError("Email logins are disabled in Supabase. Use the 'Bypass Login' button below to continue as Admin.");
        } else {
          setAuthError(error.message);
        }
      }
    }
    setLoading(false);
  };

  return (
    <div className="h-screen w-full flex items-center justify-center bg-slate-50 p-6">
      <div className="w-full max-w-md bg-white p-8 rounded-3xl shadow-xl shadow-slate-200 border border-slate-100">
        <div className="flex flex-col items-center mb-8">
          <div className="w-12 h-12 bg-indigo-600 rounded-2xl flex items-center justify-center mb-4 shadow-lg shadow-indigo-100">
            <TrendingUp className="w-6 h-6 text-white" />
          </div>
          <h2 className="text-2xl font-bold text-slate-900">{isSignUp ? 'Create Account' : 'Welcome Back'}</h2>
          <p className="text-slate-500 text-sm">{isSignUp ? 'Register as an administrator' : 'Sign in to your SalesOps dashboard'}</p>
        </div>
        <form onSubmit={handleAuth} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Email Address</label>
            <input 
              type="email" 
              required 
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
              placeholder="admin@example.com"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Password</label>
            <input 
              type="password" 
              required 
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
              placeholder="••••••••"
            />
          </div>
          <button 
            type="submit"
            disabled={loading}
            className="w-full bg-indigo-600 text-white py-3 rounded-xl font-bold shadow-lg shadow-indigo-200 hover:bg-indigo-700 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : (isSignUp ? 'Registrarse' : 'Iniciar Sesión')}
          </button>
          
          {authError && (
            <div className="space-y-3">
              <motion.div 
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className="p-3 rounded-xl bg-rose-50 border border-rose-100 text-rose-600 text-xs font-medium text-center"
              >
                {authError}
              </motion.div>
              {authError.includes("disabled") && (
                <button 
                  type="button"
                  onClick={onBypass}
                  className="w-full py-2 rounded-xl bg-slate-900 text-white text-xs font-bold hover:bg-slate-800 transition-all"
                >
                  Bypass Login (Admin Only)
                </button>
              )}
            </div>
          )}
        </form>
        <div className="mt-6 text-center">
          <button 
            onClick={() => {
              setIsSignUp(!isSignUp);
              setAuthError(null);
            }}
            className="text-indigo-600 text-sm font-medium hover:underline"
          >
            {isSignUp ? '¿Ya tienes cuenta? Inicia Sesión' : "¿No tienes cuenta? Regístrate"}
          </button>
        </div>
      </div>
    </div>
  );
}

function WizardScreen({ step, onConnect, onInitInternal, onFinish, onSetStep, onSync, loading }: { step: number, onConnect: () => void, onInitInternal: () => void, onFinish: () => void, onSetStep: (step: number) => void, onSync: () => void, loading: boolean }) {
  return (
    <div className="h-screen w-full flex items-center justify-center bg-slate-50 p-6">
      <div className="w-full max-w-2xl bg-white p-10 rounded-3xl shadow-xl shadow-slate-200 border border-slate-100">
        <div className="mb-10 flex justify-between items-end">
          <div>
            <h2 className="text-3xl font-bold text-slate-900 mb-2">Asistente de Configuración</h2>
            <p className="text-slate-500">Completa estos pasos para activar tu dashboard.</p>
          </div>
          <div className="text-sm font-bold text-indigo-600 bg-indigo-50 px-3 py-1 rounded-full">
            Paso {step} de 2
          </div>
        </div>

        <div className="space-y-6">
          {step === 1 ? (
            <div className="flex gap-4 p-6 bg-indigo-50 rounded-2xl border border-indigo-100">
              <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center flex-shrink-0">
                <ExternalLink className="w-5 h-5 text-white" />
              </div>
              <div className="flex-1">
                <h3 className="font-bold text-slate-900 mb-1">1. Conectar GoHighLevel</h3>
                <p className="text-slate-600 text-sm mb-4">Tienes una integración interna configurada. Haz clic abajo para inicializar usando tus Secretos.</p>
                <div className="flex flex-wrap gap-3">
                  <button 
                    onClick={onInitInternal}
                    disabled={loading}
                    className="bg-slate-900 text-white px-6 py-2 rounded-xl font-bold shadow-lg shadow-slate-100 hover:bg-slate-800 transition-all disabled:opacity-50 flex items-center gap-2"
                  >
                    {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                    {loading ? 'Inicializando...' : 'Inicializar App Interna'}
                  </button>
                  <button 
                    onClick={onConnect}
                    disabled={loading}
                    className="text-slate-500 px-4 py-2 rounded-xl font-medium hover:bg-slate-50 transition-all text-sm disabled:opacity-50"
                  >
                    O usar OAuth
                  </button>
                  <button 
                    onClick={() => onSetStep(2)}
                    className="text-slate-400 px-4 py-2 rounded-xl font-medium hover:text-slate-600 transition-all text-xs border border-slate-200 hover:border-slate-300"
                  >
                    Saltar a Webhooks (Manual)
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              <div className="flex gap-4 p-6 bg-emerald-50 rounded-2xl border border-emerald-100">
                <div className="w-10 h-10 bg-emerald-600 rounded-xl flex items-center justify-center flex-shrink-0">
                  <CheckCircle2 className="w-5 h-5 text-white" />
                </div>
                <div className="flex-1">
                  <h3 className="font-bold text-slate-900 mb-1">¡Conexión Exitosa!</h3>
                  <p className="text-slate-600 text-sm">Tu cuenta de GoHighLevel ya está vinculada.</p>
                </div>
              </div>

              <div className="flex gap-4 p-6 bg-slate-50 rounded-2xl border border-slate-200">
                <div className="w-10 h-10 bg-slate-900 rounded-xl flex items-center justify-center flex-shrink-0">
                  <GitBranch className="w-5 h-5 text-white" />
                </div>
                <div className="flex-1">
                  <h3 className="font-bold text-slate-900 mb-1">2. Configurar Webhooks</h3>
                  <p className="text-slate-600 text-sm mb-4">Para recibir actualizaciones en tiempo real, configura un webhook en tu Workflow de GHL:</p>
                  <div className="bg-white p-4 rounded-xl border border-slate-200 font-mono text-xs break-all mb-4">
                    {window.location.origin}/api/webhooks/ghl
                  </div>
                  <ul className="text-xs text-slate-500 space-y-2 list-disc pl-4 mb-6">
                    <li>Trigger: <strong>Opportunity Changed</strong></li>
                    <li>Action: <strong>Outbound Webhook</strong></li>
                    <li>Method: <strong>POST</strong></li>
                  </ul>
                  <button 
                    onClick={onSync}
                    disabled={loading}
                    className="w-full bg-slate-100 text-slate-700 py-3 rounded-xl font-bold hover:bg-slate-200 transition-all flex items-center justify-center gap-2 mb-3 disabled:opacity-50"
                  >
                    <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                    {loading ? 'Sincronizando...' : 'Importar Datos Existentes'}
                  </button>
                  <button 
                    onClick={onFinish}
                    className="w-full bg-indigo-600 text-white py-3 rounded-xl font-bold shadow-lg shadow-indigo-100 hover:bg-indigo-700 transition-all"
                  >
                    Finalizar y Entrar al Dashboard
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// --- Mock Data ---

const mockChartData = [
  { name: 'Lun', value: 4000 },
  { name: 'Mar', value: 3000 },
  { name: 'Mié', value: 2000 },
  { name: 'Jue', value: 2780 },
  { name: 'Vie', value: 1890 },
  { name: 'Sáb', value: 2390 },
  { name: 'Dom', value: 3490 },
];

const mockBarData = [
  { name: 'Nuevos', value: 400 },
  { name: 'Descubrimiento', value: 300 },
  { name: 'Propuesta', value: 200 },
  { name: 'Negociación', value: 278 },
  { name: 'Cerrados', value: 189 },
];

const mockClosers = [
  { name: 'Alex Rivera', revenue: '45,000', opps: 12, winRate: 65, avgDeal: '3,750' },
  { name: 'Sarah Chen', revenue: '38,200', opps: 15, winRate: 58, avgDeal: '2,546' },
  { name: 'Marcus Thorne', revenue: '29,500', opps: 8, winRate: 72, avgDeal: '3,687' },
];

const mockStages = [
  { 
    name: 'Discovery', 
    count: 5, 
    value: '12,500',
    items: [
      { id: 1, name: 'Enterprise SaaS', contact: 'John Doe • Acme Corp', value: '5,000', tag: 'High Value' },
      { id: 2, name: 'Custom CRM', contact: 'Jane Smith • Globex', value: '2,500', tag: 'Urgent' },
    ]
  },
  { 
    name: 'Proposal', 
    count: 3, 
    value: '8,200',
    items: [
      { id: 3, name: 'Marketing Audit', contact: 'Bob Brown • Stark Ind', value: '3,200', tag: 'Warm' },
    ]
  },
  { 
    name: 'Negotiation', 
    count: 2, 
    value: '15,000',
    items: [
      { id: 4, name: 'Global Rollout', contact: 'Alice Green • Wayne Ent', value: '10,000', tag: 'Critical' },
    ]
  }
];
