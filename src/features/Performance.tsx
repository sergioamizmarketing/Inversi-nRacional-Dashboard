import React from 'react';
import { useStore } from '../store/useStore';
import { TrendingUp, AlertCircle, ArrowLeft } from 'lucide-react';
import { EmptyState } from '../components/ui/Indicators';
import { CloserDashboard } from './CloserDashboard';

export const Performance = () => {
    const { customClosers, opportunities } = useStore();
    const [selectedCloser, setSelectedCloser] = React.useState<string | null>(null);

    const safeOpps = Array.isArray(opportunities) ? opportunities : [];

    const performanceData = (Array.isArray(customClosers) ? customClosers : []).map((closerName: string) => {
        const isCloser = (o: any) => {
            const rawCFs = o.custom_fields || o.raw?.customFields;
            let val = '';

            if (Array.isArray(rawCFs)) {
                const field = rawCFs.find((f: any) => 
                    String(f.id || f.fieldId || "") === 'DPEKghcOYLZADdLcTR8Q' ||
                    String(f.key || "").toLowerCase().includes('closer') ||
                    String(f.name || f.label || "").toLowerCase().includes('closer') ||
                    String(f.id || "").toLowerCase().includes('closer')
                );
                if (field) {
                    let rv = field.fieldValue || field.value || field.fieldValueString;
                    if (Array.isArray(rv) && rv.length > 0) rv = rv[0];
                    val = String(rv || "").toLowerCase().trim();
                }
            } else if (rawCFs && typeof rawCFs === 'object') {
                const key = Object.keys(rawCFs).find(k => 
                    k === 'DPEKghcOYLZADdLcTR8Q' || 
                    k.toLowerCase().includes('closer') ||
                    k.toLowerCase().includes('closer')
                );
                if (key) {
                    val = String((rawCFs as any)[key] || "").toLowerCase().trim();
                }
            }
            
            if (!val || val === 'none' || val === 'null') return false;
            const cName = closerName.toLowerCase().trim();
            return val === cName || cName.includes(val) || val.includes(cName);
        };

        // DIAGNOSTIC LOG (Only for the first 5 opps to avoid spam)
        if (safeOpps.length > 0) {
            console.log(`Checking closer match for ${closerName}`);
        }

        const userOpps = safeOpps.filter(isCloser);
        const wonOpps = userOpps.filter((o: any) => o.status === 'won');
        const lostOpps = userOpps.filter((o: any) => o.status === 'lost');

        const revenue = wonOpps.reduce((sum: number, o: any) => sum + Number(o.value || 0), 0);
        const winRate = userOpps.length > 0 ? (wonOpps.length / userOpps.length) * 100 : 0;
        const avgDeal = wonOpps.length > 0 ? revenue / wonOpps.length : 0;

        // BI Metric: Drop-off Rate (Lost / Total)
        const dropOffRate = userOpps.length > 0 ? (lostOpps.length / userOpps.length) * 100 : 0;

        return {
            id: closerName,
            firstName: closerName,
            revenue,
            oppCount: userOpps.length,
            winRate,
            avgDeal,
            dropOffRate
        };
    }).sort((a: any, b: any) => b.revenue - a.revenue).filter(u => u.oppCount > 0);

    if (selectedCloser) {
        const { filters } = useStore.getState();
        const periodLabels: Record<string, string> = {
            all: 'Todo el tiempo',
            today: 'Hoy',
            yesterday: 'Ayer',
            '7days': 'Últimos 7 días',
            '15days': 'Últimos 15 días',
            '30days': 'Últimos 30 días',
            '3months': 'Últimos 3 meses',
            '6months': 'Últimos 6 meses',
            year: 'Último año',
            custom: `${filters.startDate} - ${filters.endDate}`
        };
        const label = periodLabels[filters.period] || 'Periodo Seleccionado';
        return <CloserDashboard closerName={selectedCloser} opportunities={safeOpps} onBack={() => setSelectedCloser(null)} periodLabel={label} />;
    }

    if (performanceData.length === 0) {
        return <EmptyState title="Sin actividad de equipo" description="No hay métricas de rendimiento para los closers en el periodo seleccionado." />;
    }

    return (
        <div className="space-y-6">
            {/* Diagnosis Panel (Solo para depuración) */}
            <div className="bg-slate-50 dark:bg-slate-900/50 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 text-xs font-mono overflow-auto max-h-40">
                <p className="font-bold mb-1 text-slate-500 uppercase tracking-widest text-[10px]">Diagnóstico Directo:</p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                        <span className="text-indigo-500">customClosers ({customClosers?.length || 0}):</span>
                        <pre className="mt-1 whitespace-pre-wrap">{JSON.stringify(customClosers, null, 2)}</pre>
                    </div>
                    <div>
                        <span className="text-emerald-500">Ejemplo Opp 0 CFs:</span>
                        <pre className="mt-1 whitespace-pre-wrap">{JSON.stringify(safeOpps?.[0]?.custom_fields || safeOpps?.[0]?.raw?.customFields, null, 2)}</pre>
                    </div>
                </div>
                <div className="mt-2 pt-2 border-t border-slate-200 dark:border-slate-800">
                    <span className="text-amber-500">Total Opps Frontend:</span> {safeOpps.length}
                </div>
            </div>

            <div className="bg-white/80 dark:bg-slate-800/80 backdrop-blur-xl rounded-3xl border border-white/50 dark:border-slate-700/50 shadow-sm overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="p-6 border-b border-slate-100 dark:border-slate-700/50 bg-slate-50/50 dark:bg-slate-800/50">
                <h2 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
                    Tabla de Clasificación
                    <span className="text-xs bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300 px-2.5 py-1 rounded-full">{performanceData.length} Closers Activos</span>
                </h2>
            </div>
            <div className="overflow-x-auto w-full">
                <table className="w-full text-left border-collapse">
                    <thead className="bg-slate-50/80 dark:bg-slate-800/80 border-b border-slate-200/50 dark:border-slate-700/50">
                        <tr>
                            <th className="px-6 py-4 text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Closer / Vendedor</th>
                            <th className="px-6 py-4 text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Ingresos (€)</th>
                            <th className="px-6 py-4 text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider text-center">Tasa de Cierre (Win Rate)</th>
                            <th className="px-6 py-4 text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider text-center">Drop-off Rate (Pérdidas)</th>
                            <th className="px-6 py-4 text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Trato Medio</th>
                            <th className="px-6 py-4 text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider text-center">Volumen</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-700/50">
                        {performanceData.map((closer: any, index: number) => (
                            <tr 
                                key={closer.id} 
                                onClick={() => setSelectedCloser(closer.id)}
                                className="hover:bg-slate-50 dark:hover:bg-slate-700/30 transition-colors group cursor-pointer"
                            >
                                <td className="px-6 py-5">
                                    <div className="flex items-center gap-4">
                                        <div className="relative">
                                            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-100 to-purple-100 dark:from-indigo-900/40 dark:to-purple-900/40 flex items-center justify-center text-indigo-700 dark:text-indigo-300 font-bold text-sm shadow-sm">
                                                {closer.firstName?.[0] || 'C'}
                                            </div>
                                            {index === 0 && (
                                                <div className="absolute -top-2 -right-2 bg-amber-400 text-amber-900 border border-amber-200 text-[10px] font-black w-5 h-5 flex items-center justify-center rounded-full shadow-md rotate-12">1</div>
                                            )}
                                        </div>
                                        <div>
                                            <span className="font-bold text-slate-900 dark:text-white block">{closer.firstName}</span>
                                            <span className="text-xs text-slate-400">Custom Closer</span>
                                        </div>
                                    </div>
                                </td>
                                <td className="px-6 py-5">
                                    <div className="font-extrabold text-slate-900 dark:text-white text-lg group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
                                        €{closer.revenue.toLocaleString()}
                                    </div>
                                </td>
                                <td className="px-6 py-5">
                                    <div className="flex flex-col items-center gap-1.5 w-full">
                                        <span className="text-sm font-bold text-slate-700 dark:text-slate-200">{closer.winRate.toFixed(1)}%</span>
                                        <div className="w-24 h-2 bg-slate-100 dark:bg-slate-700/80 rounded-full overflow-hidden shadow-inner">
                                            <div className="h-full bg-emerald-500 rounded-full transition-all duration-1000" style={{ width: `${closer.winRate}%` }} />
                                        </div>
                                    </div>
                                </td>
                                <td className="px-6 py-5">
                                    <div className="flex flex-col items-center gap-1.5 w-full">
                                        <span className="text-sm font-bold text-slate-700 dark:text-slate-200 flex items-center gap-1">
                                            {closer.dropOffRate > 50 && <AlertCircle className="w-3.5 h-3.5 text-rose-500" />}
                                            {closer.dropOffRate.toFixed(1)}%
                                        </span>
                                        <div className="w-24 h-2 bg-slate-100 dark:bg-slate-700/80 rounded-full overflow-hidden shadow-inner">
                                            <div className="h-full bg-rose-500 rounded-full transition-all duration-1000" style={{ width: `${closer.dropOffRate}%` }} />
                                        </div>
                                    </div>
                                </td>
                                <td className="px-6 py-5 font-semibold text-slate-600 dark:text-slate-300">
                                    €{closer.avgDeal.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                                </td>
                                <td className="px-6 py-5">
                                    <div className="flex justify-center items-center">
                                        <div className="px-3 py-1 bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 rounded-lg text-sm font-bold">
                                            {closer.oppCount} opps
                                        </div>
                                    </div>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
        </div>
    );
};
