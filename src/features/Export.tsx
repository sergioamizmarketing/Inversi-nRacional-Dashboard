import React, { useState, useEffect, useRef } from 'react';
import { Download, FileText, Users, Filter, CheckCircle } from 'lucide-react';
import { useStore } from '../store/useStore';
import { supabase } from '../lib/supabase';
import { format, subDays } from 'date-fns';

type ExportType = 'opportunities' | 'contacts';
type OppStatus = 'all' | 'open' | 'won' | 'lost' | 'abandoned';

interface OppFilters {
  startDate: string;
  endDate: string;
  pipelineId: string;
  status: OppStatus;
  closer: string;
  origin: string;
}

interface ContactFilters {
  startDate: string;
  endDate: string;
  pipelineId: string;
  hasEmail: boolean;
  hasPhone: boolean;
}

const today = format(new Date(), 'yyyy-MM-dd');
const thirtyDaysAgo = format(subDays(new Date(), 30), 'yyyy-MM-dd');

const inputClass = 'w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2.5 text-sm font-medium text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all';
const labelClass = 'block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5';

export const Export = () => {
    const { pipelines, customClosers, connection } = useStore();

    const [type, setType] = useState<ExportType | null>(null);
    const [downloading, setDownloading] = useState(false);
    const [count, setCount] = useState<number | null>(null);
    const [countLoading, setCountLoading] = useState(false);

    const [oppFilters, setOppFilters] = useState<OppFilters>({
        startDate: thirtyDaysAgo,
        endDate: today,
        pipelineId: '',
        status: 'all',
        closer: 'all',
        origin: 'all',
    });

    const [contactFilters, setContactFilters] = useState<ContactFilters>({
        startDate: thirtyDaysAgo,
        endDate: today,
        pipelineId: '',
        hasEmail: false,
        hasPhone: false,
    });

    const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    // Fetch preview count whenever filters change
    useEffect(() => {
        if (!type || !connection) { setCount(null); return; }

        if (debounceRef.current) clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(async () => {
            setCountLoading(true);
            try {
                const { data: { session } } = await supabase.auth.getSession();
                if (!session) return;

                const filters = type === 'opportunities' ? oppFilters : contactFilters;
                const params = new URLSearchParams({
                    locationId: connection.location_id,
                    type,
                    ...Object.fromEntries(
                        Object.entries(filters).map(([k, v]) => [k, String(v)])
                    )
                });

                const res = await fetch(`/api/export/count?${params}`, {
                    headers: { Authorization: `Bearer ${session.access_token}` }
                });
                if (res.ok) {
                    const data = await res.json();
                    setCount(data.count);
                }
            } catch { /* silent */ }
            finally { setCountLoading(false); }
        }, 500);
    }, [type, oppFilters, contactFilters, connection]);

    const handleDownload = async () => {
        if (!connection) return;
        setDownloading(true);
        try {
            const { data: { session } } = await supabase.auth.getSession();
            if (!session) return;

            const filters = type === 'opportunities' ? oppFilters : contactFilters;
            const params = new URLSearchParams({
                locationId: connection.location_id,
                ...Object.fromEntries(
                    Object.entries(filters).map(([k, v]) => [k, String(v)])
                )
            });

            const res = await fetch(`/api/export/${type}?${params}`, {
                headers: { Authorization: `Bearer ${session.access_token}` }
            });

            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                alert(err.error || 'Error al exportar');
                return;
            }

            const blob = await res.blob();
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `${type}-${today}.csv`;
            a.click();
            URL.revokeObjectURL(url);
        } catch (err: any) {
            alert('Error: ' + err.message);
        } finally {
            setDownloading(false);
        }
    };

    return (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-10">

            {/* Header */}
            <div>
                <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Exportar Datos</h1>
                <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Descarga oportunidades o contactos con los filtros que necesites.</p>
            </div>

            {/* Entity selector */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <button
                    onClick={() => setType('opportunities')}
                    className={`p-6 rounded-2xl border-2 text-left transition-all ${type === 'opportunities'
                        ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-900/20'
                        : 'border-slate-200 dark:border-slate-700 bg-white/80 dark:bg-slate-800/80 hover:border-indigo-300 dark:hover:border-indigo-700'}`}
                >
                    <div className="flex items-center gap-3 mb-2">
                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${type === 'opportunities' ? 'bg-indigo-500' : 'bg-slate-100 dark:bg-slate-700'}`}>
                            <FileText className={`w-5 h-5 ${type === 'opportunities' ? 'text-white' : 'text-slate-500 dark:text-slate-400'}`} />
                        </div>
                        {type === 'opportunities' && <CheckCircle className="w-5 h-5 text-indigo-500 ml-auto" />}
                    </div>
                    <p className="font-bold text-slate-900 dark:text-white">Oportunidades</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">ID, contacto, pipeline, closer, origen, valor…</p>
                </button>

                <button
                    onClick={() => setType('contacts')}
                    className={`p-6 rounded-2xl border-2 text-left transition-all ${type === 'contacts'
                        ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-900/20'
                        : 'border-slate-200 dark:border-slate-700 bg-white/80 dark:bg-slate-800/80 hover:border-indigo-300 dark:hover:border-indigo-700'}`}
                >
                    <div className="flex items-center gap-3 mb-2">
                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${type === 'contacts' ? 'bg-indigo-500' : 'bg-slate-100 dark:bg-slate-700'}`}>
                            <Users className={`w-5 h-5 ${type === 'contacts' ? 'text-white' : 'text-slate-500 dark:text-slate-400'}`} />
                        </div>
                        {type === 'contacts' && <CheckCircle className="w-5 h-5 text-indigo-500 ml-auto" />}
                    </div>
                    <p className="font-bold text-slate-900 dark:text-white">Contactos</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Nombre, email, teléfono, deduplicados por email…</p>
                </button>
            </div>

            {/* Filters panel */}
            {type && (
                <div className="bg-white/80 dark:bg-slate-800/80 backdrop-blur-xl rounded-3xl border border-white/50 dark:border-slate-700/50 shadow-sm p-6 space-y-6">
                    <div className="flex items-center gap-2 text-sm font-bold text-slate-700 dark:text-slate-300">
                        <Filter className="w-4 h-4" />
                        Filtros
                    </div>

                    {/* Shared: date range + pipeline */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                        <div>
                            <label className={labelClass}>Fecha inicio</label>
                            <input
                                type="date"
                                className={inputClass}
                                value={type === 'opportunities' ? oppFilters.startDate : contactFilters.startDate}
                                onChange={e => type === 'opportunities'
                                    ? setOppFilters(f => ({ ...f, startDate: e.target.value }))
                                    : setContactFilters(f => ({ ...f, startDate: e.target.value }))}
                            />
                        </div>
                        <div>
                            <label className={labelClass}>Fecha fin</label>
                            <input
                                type="date"
                                className={inputClass}
                                value={type === 'opportunities' ? oppFilters.endDate : contactFilters.endDate}
                                onChange={e => type === 'opportunities'
                                    ? setOppFilters(f => ({ ...f, endDate: e.target.value }))
                                    : setContactFilters(f => ({ ...f, endDate: e.target.value }))}
                            />
                        </div>
                        <div>
                            <label className={labelClass}>Pipeline</label>
                            <select
                                className={inputClass}
                                value={type === 'opportunities' ? oppFilters.pipelineId : contactFilters.pipelineId}
                                onChange={e => type === 'opportunities'
                                    ? setOppFilters(f => ({ ...f, pipelineId: e.target.value }))
                                    : setContactFilters(f => ({ ...f, pipelineId: e.target.value }))}
                            >
                                <option value="">Todos los pipelines</option>
                                {pipelines.map(p => (
                                    <option key={p.id} value={p.id}>{p.name}</option>
                                ))}
                            </select>
                        </div>

                        {/* Opportunities-specific filters */}
                        {type === 'opportunities' && (
                            <div>
                                <label className={labelClass}>Estado</label>
                                <select
                                    className={inputClass}
                                    value={oppFilters.status}
                                    onChange={e => setOppFilters(f => ({ ...f, status: e.target.value as OppStatus }))}
                                >
                                    <option value="all">Todos</option>
                                    <option value="open">Abierto</option>
                                    <option value="won">Ganado</option>
                                    <option value="lost">Perdido</option>
                                    <option value="abandoned">Abandonado</option>
                                </select>
                            </div>
                        )}
                    </div>

                    {/* Second row — opportunities extra filters */}
                    {type === 'opportunities' && (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div>
                                <label className={labelClass}>Closer</label>
                                <select
                                    className={inputClass}
                                    value={oppFilters.closer}
                                    onChange={e => setOppFilters(f => ({ ...f, closer: e.target.value }))}
                                >
                                    <option value="all">Todos los closers</option>
                                    {customClosers.map(c => (
                                        <option key={c} value={c}>{c}</option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <label className={labelClass}>Origen de venta</label>
                                <select
                                    className={inputClass}
                                    value={oppFilters.origin}
                                    onChange={e => setOppFilters(f => ({ ...f, origin: e.target.value }))}
                                >
                                    <option value="all">Todos</option>
                                    <option value="hotmart">Hotmart</option>
                                    <option value="transferencia">Transferencia</option>
                                    <option value="otro">Otro</option>
                                </select>
                            </div>
                        </div>
                    )}

                    {/* Contacts extra filters */}
                    {type === 'contacts' && (
                        <div className="flex flex-wrap gap-6">
                            <label className="flex items-center gap-2 cursor-pointer">
                                <input
                                    type="checkbox"
                                    className="w-4 h-4 rounded accent-indigo-600"
                                    checked={contactFilters.hasEmail}
                                    onChange={e => setContactFilters(f => ({ ...f, hasEmail: e.target.checked }))}
                                />
                                <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Solo con email</span>
                            </label>
                            <label className="flex items-center gap-2 cursor-pointer">
                                <input
                                    type="checkbox"
                                    className="w-4 h-4 rounded accent-indigo-600"
                                    checked={contactFilters.hasPhone}
                                    onChange={e => setContactFilters(f => ({ ...f, hasPhone: e.target.checked }))}
                                />
                                <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Solo con teléfono</span>
                            </label>
                        </div>
                    )}

                    {/* Preview + download */}
                    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pt-4 border-t border-slate-100 dark:border-slate-700/50">
                        <div className="text-sm text-slate-500 dark:text-slate-400">
                            {countLoading ? (
                                <span className="animate-pulse">Calculando registros…</span>
                            ) : count !== null ? (
                                <span>
                                    <span className="font-black text-slate-900 dark:text-white text-lg">{count}</span>
                                    {' '}registro{count !== 1 ? 's' : ''} encontrado{count !== 1 ? 's' : ''}
                                </span>
                            ) : null}
                        </div>

                        <button
                            onClick={handleDownload}
                            disabled={downloading || count === 0}
                            className="inline-flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white rounded-xl font-bold shadow-lg shadow-indigo-200 dark:shadow-indigo-900/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            <Download className="w-4 h-4" />
                            {downloading ? 'Descargando…' : 'Descargar CSV'}
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};
