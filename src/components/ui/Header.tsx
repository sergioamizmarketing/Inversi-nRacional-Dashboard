import React from 'react';
import { Sun, Moon, Clock, RefreshCw, Filter, Plus, PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { useStore } from '../../store/useStore';
import { format } from 'date-fns';

export const Header = ({ onNewReport }: { onNewReport: () => void }) => {
    const {
        isDark,
        toggleTheme,
        sidebarOpen,
        toggleSidebar,
        connection,
        opportunities,
        totalOpps,
        fetchMetrics,
        fetchMetadata,
        fetchOpportunities,
        filters,
        setFilters,
        handlePeriodChange,
        pipelines,
        ghlUsers,
        customClosers
    } = useStore();

    const [syncing, setSyncing] = React.useState(false);

    const getActiveTabName = () => {
        const path = window.location.pathname;
        if (path.includes('performance')) return 'Rendimiento de Closers';
        if (path.includes('pipeline')) return 'Gestión de Pipeline';
        if (path.includes('funnel')) return 'Análisis de Funnel';
        if (path.includes('targets')) return 'Objetivos de Ventas';
        if (path.includes('copilot')) return 'Asistente IA Copilot';
        if (path.includes('settings')) return 'Ajustes';
        return 'Resumen Ejecutivo';
    };

    const handleSync = async (isFull = false) => {
        if (!connection) return;
        setSyncing(true);
        try {
            const url = `/api/crm/sync?locationId=${connection.location_id}${isFull ? '&full=true' : ''}`;
            const res = await fetch(url);
            const data = await res.json();
            if (res.ok) {
                console.log(`Synced ${data.count} opportunities`);
                await Promise.all([fetchMetrics(), fetchMetadata(), fetchOpportunities()]);
                if (isFull) alert('¡Reinicio completado! Los datos son ahora un espejo exacto de GHL.');
            } else {
                alert(data.error || 'Sync failed');
            }
        } catch (err) {
            console.error('Sync error:', err);
        } finally {
            setSyncing(false);
        }
    };

    return (
        <header className="flex flex-col gap-6 mb-8 mt-2 sticky top-0 z-30 pt-4 bg-slate-50/80 dark:bg-slate-900/80 backdrop-blur-xl pb-4 border-b border-white/20 dark:border-slate-800/20">
            <div className="flex justify-between items-center px-2">
                <div className="flex items-center gap-4">
                    <button
                        onClick={toggleSidebar}
                        className="p-2.5 bg-white/60 dark:bg-slate-800/60 backdrop-blur-md rounded-xl shadow-sm border border-slate-200/50 dark:border-slate-700/50 hover:bg-white dark:hover:bg-slate-700 transition-all group"
                    >
                        {sidebarOpen ? <PanelLeftClose className="w-5 h-5 text-slate-500 group-hover:text-indigo-600 transition-colors" /> : <PanelLeftOpen className="w-5 h-5 text-slate-500 group-hover:text-indigo-600 transition-colors" />}
                    </button>
                    <div>
                        <h1 className="text-2xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-slate-900 to-slate-700 dark:from-white dark:to-slate-300">
                            {getActiveTabName()}
                        </h1>
                        <p className="text-slate-500 dark:text-slate-400 text-sm font-medium">Visualiza y analiza tus métricas en tiempo real</p>
                    </div>
                </div>

                <div className="flex items-center gap-4">
                    <button
                        onClick={toggleTheme}
                        className="p-2.5 bg-white/60 dark:bg-slate-800/60 backdrop-blur-md border border-slate-200/50 dark:border-slate-700/50 rounded-xl shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all"
                    >
                        {isDark ? <Sun className="w-5 h-5 text-amber-500" /> : <Moon className="w-5 h-5 text-indigo-600" />}
                    </button>

                    <div className="bg-white/60 dark:bg-slate-800/60 backdrop-blur-md px-4 py-2.5 rounded-xl border border-slate-200/50 dark:border-slate-700/50 flex items-center gap-3 text-sm font-medium text-slate-600 dark:text-slate-300 shadow-sm">
                        <div className="flex items-center gap-2">
                            <Clock className="w-4 h-4 text-indigo-500" />
                            <span className="hidden sm:inline">Sincronizado:</span> {connection?.updated_at ? format(new Date(connection.updated_at), 'HH:mm') : 'Nunca'}
                        </div>
                        <div className="w-px h-4 bg-slate-200 dark:bg-slate-700" />
                        <div className="text-xs text-slate-400 font-mono hidden md:block">
                            {opportunities.length} / {totalOpps} opps
                        </div>
                        <div className="w-px h-4 bg-slate-200 dark:bg-slate-700 hidden md:block" />
                        <div className="flex items-center gap-3">
                            <button
                                onClick={() => handleSync(false)}
                                disabled={syncing}
                                className="text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 transition-all flex items-center gap-1.5 disabled:opacity-50 font-semibold"
                                title="Sincronizar nuevas actualizaciones"
                            >
                                <RefreshCw className={`w-3.5 h-3.5 ${syncing ? 'animate-spin' : ''}`} />
                                <span className="hidden sm:inline">{syncing ? 'Sincronizando...' : 'Sincronizar'}</span>
                            </button>
                        </div>
                    </div>

                    <button
                        onClick={onNewReport}
                        className="bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white px-5 py-2.5 rounded-xl font-bold shadow-lg shadow-indigo-200 dark:shadow-indigo-900/20 transition-all hover:-translate-y-0.5 flex items-center gap-2"
                    >
                        <Plus className="w-4 h-4" />
                        <span className="hidden sm:inline">Nuevo Informe</span>
                    </button>
                </div>
            </div>

            {/* Filters Bar */}
            <div className="bg-white/80 dark:bg-slate-800/80 backdrop-blur-xl p-3 px-5 rounded-2xl border border-white/50 dark:border-slate-700/50 shadow-sm flex flex-wrap items-center gap-4 mx-2">
                <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400 text-sm font-bold uppercase tracking-wider">
                    <Filter className="w-4 h-4" />
                    Filtros
                </div>

                <div className="h-6 w-px bg-slate-200 dark:bg-slate-700 mx-2"></div>

                <select
                    value={filters.period}
                    onChange={(e) => handlePeriodChange(e.target.value)}
                    className="bg-slate-50 dark:bg-slate-900 border-none rounded-lg px-4 py-2 text-sm font-medium focus:ring-2 focus:ring-indigo-500 transition-all shadow-inner text-slate-700 dark:text-slate-200 cursor-pointer"
                >
                    <option value="all">Todo el tiempo</option>
                    <option value="7days">Últimos 7 días</option>
                    <option value="30days">Últimos 30 días</option>
                    <option value="3months">Últimos 3 meses</option>
                    <option value="6months">Últimos 6 meses</option>
                    <option value="year">Último año</option>
                    <option value="custom">Personalizado...</option>
                </select>

                {filters.period === 'custom' && (
                    <div className="flex items-center gap-2 animate-in fade-in slide-in-from-left-4 duration-300">
                        <div className="relative">
                            <input
                                type="date"
                                value={filters.startDate}
                                onChange={(e) => setFilters({ startDate: e.target.value })}
                                className="bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-1.5 text-sm font-medium focus:ring-2 focus:ring-indigo-500 transition-all shadow-inner text-slate-700 dark:text-slate-200 cursor-pointer w-[140px] [&::-webkit-calendar-picker-indicator]:absolute [&::-webkit-calendar-picker-indicator]:w-full [&::-webkit-calendar-picker-indicator]:h-full [&::-webkit-calendar-picker-indicator]:opacity-0 [&::-webkit-calendar-picker-indicator]:cursor-pointer z-10"
                            />
                            <div className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400">
                                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>
                            </div>
                        </div>
                        <span className="text-slate-400 font-medium">a</span>
                        <div className="relative">
                            <input
                                type="date"
                                value={filters.endDate}
                                onChange={(e) => setFilters({ endDate: e.target.value })}
                                className="bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-1.5 text-sm font-medium focus:ring-2 focus:ring-indigo-500 transition-all shadow-inner text-slate-700 dark:text-slate-200 cursor-pointer w-[140px] [&::-webkit-calendar-picker-indicator]:absolute [&::-webkit-calendar-picker-indicator]:w-full [&::-webkit-calendar-picker-indicator]:h-full [&::-webkit-calendar-picker-indicator]:opacity-0 [&::-webkit-calendar-picker-indicator]:cursor-pointer z-10"
                            />
                            <div className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400">
                                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>
                            </div>
                        </div>
                    </div>
                )}

                <select
                    value={filters.pipelineId}
                    onChange={(e) => setFilters({ pipelineId: e.target.value })}
                    className="bg-slate-50 dark:bg-slate-900 border-none rounded-lg px-4 py-2 text-sm font-medium focus:ring-2 focus:ring-indigo-500 transition-all shadow-inner text-slate-700 dark:text-slate-200 cursor-pointer max-w-[200px] truncate"
                >
                    <option value="">Todos los Pipelines</option>
                    {Array.isArray(pipelines) && pipelines.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>

                <select
                    value={filters.userId}
                    onChange={(e) => setFilters({ userId: e.target.value })}
                    className="bg-slate-50 dark:bg-slate-900 border-none rounded-lg px-4 py-2 text-sm font-medium focus:ring-2 focus:ring-indigo-500 transition-all shadow-inner text-slate-700 dark:text-slate-200 cursor-pointer max-w-[200px] truncate"
                >
                    <option value="">Todos los Closers</option>
                    {Array.isArray(customClosers) && customClosers.map(c => <option key={c} value={c}>{c}</option>)}
                </select>



                {(filters.pipelineId || filters.userId || filters.period !== '30days') && (
                    <button
                        onClick={() => {
                            handlePeriodChange('30days');
                            setFilters({ pipelineId: '', userId: '' });
                        }}
                        className="text-xs text-rose-500 font-bold hover:underline ml-auto flex items-center gap-1 bg-rose-50 dark:bg-rose-900/20 px-3 py-1.5 rounded-lg"
                    >
                        <XCircle className="w-3.5 h-3.5" />
                        Limpiar Filtros
                    </button>
                )}
            </div>
        </header>
    );
};

// Simple XCircle implementation if not imported from lucide-react above
const XCircle = ({ className }: { className?: string }) => (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
        <circle cx="12" cy="12" r="10"></circle>
        <line x1="15" y1="9" x2="9" y2="15"></line>
        <line x1="9" y1="9" x2="15" y2="15"></line>
    </svg>
);
