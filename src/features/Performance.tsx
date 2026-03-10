import React from 'react';
import { useStore } from '../store/useStore';
import { TrendingUp, AlertCircle } from 'lucide-react';
import { EmptyState } from '../components/ui/Indicators';

export const Performance = () => {
    const { customClosers, opportunities } = useStore();

    const safeOpps = Array.isArray(opportunities) ? opportunities : [];

    const performanceData = (Array.isArray(customClosers) ? customClosers : []).map((closerName: string) => {
        const isCloser = (o: any) => {
            // Support both mapped custom_fields (if we ever did) or raw GHL payload
            const customFields = Array.isArray(o.raw?.customFields) ? o.raw.customFields : (Array.isArray(o.custom_fields) ? o.custom_fields : []);
            if (!customFields || !Array.isArray(customFields)) return false;

            const closerField = customFields.find((f: any) =>
                String(f.id || "") === 'DPEKghcOYLZADdLcTR8Q' ||
                String(f.key || "").toLowerCase().includes('closer') ||
                String(f.name || "").toLowerCase().includes('closer') ||
                String(f.id || "").toLowerCase().includes('closer')
            );

            if (!closerField) return false;

            let rawVal = closerField.fieldValue || closerField.fieldValueString || closerField.field_value || closerField.value;
            if (Array.isArray(rawVal) && rawVal.length > 0) rawVal = rawVal[0];
            const val = String(rawVal || "").toLowerCase().trim();
            if (!val) return false;

            // Provide a direct string match since val and closerName are both strings
            return val === closerName.toLowerCase().trim();
        };

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

    if (performanceData.length === 0) {
        return <EmptyState title="Sin actividad de equipo" description="No hay métricas de rendimiento para los closers en el periodo seleccionado." />;
    }

    return (
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
                            <tr key={closer.id} className="hover:bg-slate-50 dark:hover:bg-slate-700/30 transition-colors group cursor-pointer">
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
    );
};
