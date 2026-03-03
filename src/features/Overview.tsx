import React, { useMemo } from 'react';
import { useStore } from '../store/useStore';
import { Card } from '../components/ui/Card';
import { ChartSkeleton, EmptyState } from '../components/ui/Indicators';
import { DollarSign, Users, CheckCircle, GitBranch, Target, AlertTriangle } from 'lucide-react';
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line, AreaChart, Area, Cell, ComposedChart, Legend
} from 'recharts';
import { format, differenceInDays, endOfMonth, startOfMonth } from 'date-fns';

const CustomTooltip = ({ active, payload, label, isCurrency = false }: any) => {
    if (active && payload && payload.length) {
        return (
            <div className="bg-white/90 dark:bg-slate-800/90 backdrop-blur-xl p-4 rounded-xl shadow-xl border border-white/50 dark:border-slate-700/50">
                <p className="text-slate-500 dark:text-slate-400 text-xs font-bold mb-2 tracking-wider uppercase">{label}</p>
                {payload.map((entry: any, index: number) => (
                    <div key={index} className="flex items-center gap-3 mb-1">
                        <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: entry.color }} />
                        <span className="font-semibold text-slate-900 dark:text-white">
                            {entry.name}: {isCurrency ? '€' : ''}{Number(entry.value).toLocaleString()}{isCurrency ? '' : (entry.name.includes('%') ? '%' : '')}
                        </span>
                    </div>
                ))}
            </div>
        );
    }
    return null;
};

export const Overview = () => {
    const { metrics, opportunities, totalOpps, pipelines } = useStore();

    const chartData = useMemo(() => {
        if (!opportunities || opportunities.length === 0) return { trendData: [], distributionData: [], pacingData: null };

        const safeOpps = [...opportunities]
            .filter(o => o.created_at)
            .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

        const trendData = safeOpps.reduce((acc: any[], opp: any) => {
            try {
                const date = format(new Date(opp.created_at), 'dd/MM');
                const existing = acc.find(d => d.name === date);
                if (existing) {
                    if (opp.status === 'won') existing.value += Number(opp.value || 0);
                } else {
                    acc.push({ name: date, value: opp.status === 'won' ? Number(opp.value || 0) : 0 });
                }
            } catch (e) { }
            return acc;
        }, []).slice(-14);

        const distributionData = [
            { name: 'Abiertas', value: safeOpps.filter(o => o.status === 'open').length, color: '#6366f1' },
            { name: 'Ganadas', value: safeOpps.filter(o => o.status === 'won').length, color: '#10b981' },
            { name: 'Perdidas', value: safeOpps.filter(o => o.status === 'lost').length, color: '#ef4444' },
            { name: 'Abandonadas', value: safeOpps.filter(o => o.status === 'abandoned').length, color: '#94a3b8' },
        ];

        // Pacing Calculation
        const today = new Date();
        const start = startOfMonth(today);
        const end = endOfMonth(today);
        const totalDaysInMonth = differenceInDays(end, start) + 1;
        const daysPassedInMonth = differenceInDays(today, start) + 1;

        // Simulating a monthly target based on historical data or flat 500k for the example
        const monthlyTarget = 500000;
        const currentRevenue = metrics?.revenue || 0;
        const targetPace = (monthlyTarget / totalDaysInMonth) * daysPassedInMonth;
        const pacingPercent = (currentRevenue / targetPace) * 100;

        const pacingData = {
            target: monthlyTarget,
            current: currentRevenue,
            targetPace,
            pacingPercent,
            isOnTrack: pacingPercent >= 100
        };

        // Pipeline Distribution (Combined Count and Value)
        const pipelineDistributionData = (Array.isArray(pipelines) ? pipelines : []).map(p => {
            const pipeOpps = safeOpps.filter(o => o.pipeline_id === p.id && o.status === 'open');
            const totalValue = pipeOpps.reduce((sum, o) => sum + Number(o.value || 0), 0);
            return {
                name: p.name,
                Oportunidades: pipeOpps.length,
                Valor: totalValue
            };
        }).filter(d => d.Oportunidades > 0);

        return { trendData, distributionData, pacingData, pipelineDistributionData };
    }, [opportunities, metrics, pipelines]);

    if (!metrics) return (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 animate-pulse">
            {[1, 2, 3, 4].map(i => <div key={i} className="h-40 bg-white/50 dark:bg-slate-800/50 rounded-2xl" />)}
        </div>
    );

    if (opportunities.length === 0 && metrics?.totalOpps === 0) {
        return <EmptyState title="Sin datos comerciales" description="No hemos encontrado oportunidades en el rango de fechas seleccionado. Cambia los filtros o sincroniza con tu CRM." />;
    }

    const { trendData, distributionData, pacingData, pipelineDistributionData } = chartData;

    return (
        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <Card title="Ingresos Totales" value={metrics.revenue || 0} isCurrency subValue="Ganado en periodo" icon={DollarSign} trend={metrics.revenue > 0 ? "up" : "down"} trendValue="+12%" />
                <Card title="Oportunidades" value={metrics.totalOpps || 0} subValue="Leads totales" icon={Users} trend="up" trendValue="+5%" />
                <Card title="Tasa de Cierre" value={`${(metrics.winRate || 0).toFixed(1)}`} subValue="Conversión final" icon={CheckCircle} trend="up" trendValue="+2.1%" />
                <Card title="Valor Pipeline" value={metrics.pipelineValue || 0} isCurrency subValue="Pendiente de cierre" icon={GitBranch} />
            </div>

            {pacingData && (
                <div className="bg-white/80 dark:bg-slate-800/80 backdrop-blur-xl p-6 rounded-3xl border border-white/50 dark:border-slate-700/50 shadow-sm relative overflow-hidden group">
                    <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-500/10 dark:bg-indigo-500/5 rounded-full blur-3xl -mr-20 -mt-20 pointer-events-none"></div>

                    <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 relative z-10 gap-4">
                        <div className="flex items-center gap-3">
                            <div className={`p-2.5 rounded-xl ${pacingData.isOnTrack ? 'bg-emerald-100 dark:bg-emerald-900/30' : 'bg-rose-100 dark:bg-rose-900/30'}`}>
                                {pacingData.isOnTrack ? <Target className="w-6 h-6 text-emerald-600 dark:text-emerald-400" /> : <AlertTriangle className="w-6 h-6 text-rose-600 dark:text-rose-400" />}
                            </div>
                            <div>
                                <h3 className="font-bold text-lg text-slate-900 dark:text-white flex items-center gap-2">
                                    Ritmo hacia Objetivo (Pacing)
                                    {!pacingData.isOnTrack && <span className="text-xs bg-rose-100 text-rose-600 dark:bg-rose-900/40 dark:text-rose-400 px-2 py-0.5 rounded-full font-bold">Riesgo</span>}
                                </h3>
                                <p className="text-slate-500 dark:text-slate-400 text-sm">Objetivo mensual: €{pacingData.target.toLocaleString()}</p>
                            </div>
                        </div>

                        <div className="text-right">
                            <div className="text-3xl font-extrabold text-slate-900 dark:text-white">€{pacingData.current.toLocaleString()}</div>
                            <div className={`text-sm font-bold ${pacingData.isOnTrack ? 'text-emerald-500' : 'text-rose-500'}`}>
                                {pacingData.isOnTrack ? '↑ Por encima del ritmo esperado' : `↓ A €${(pacingData.targetPace - pacingData.current).toLocaleString()} del ritmo óptimo`}
                            </div>
                        </div>
                    </div>

                    <div className="relative h-6 bg-slate-100 dark:bg-slate-700/50 rounded-full overflow-hidden z-10 p-1">
                        <div className="absolute top-0 bottom-0 left-0 bg-gradient-to-r from-indigo-500 to-purple-600 rounded-full transition-all duration-1000 ease-out" style={{ width: `${Math.min((pacingData.current / pacingData.target) * 100, 100)}%` }}></div>
                        <div className="absolute top-0 bottom-0 w-1 bg-slate-900 dark:bg-white z-20" style={{ left: `${Math.min((pacingData.targetPace / pacingData.target) * 100, 100)}%` }} title="Ritmo Esperado Hoy"></div>
                    </div>
                    <div className="flex justify-between mt-2 text-xs font-bold text-slate-400 z-10 relative">
                        <span>€0</span>
                        <span>Esperado Hoy (Línea)</span>
                        <span>€{pacingData.target.toLocaleString()}</span>
                    </div>
                </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="bg-white/80 dark:bg-slate-800/80 backdrop-blur-xl p-6 rounded-3xl border border-white/50 dark:border-slate-700/50 shadow-sm transition-all hover:shadow-md">
                    <h3 className="font-bold text-slate-900 dark:text-white mb-6 text-lg">Tendencia de Ingresos</h3>
                    <div className="h-80 min-h-[320px]">
                        {trendData.length > 0 ? (
                            <ResponsiveContainer width="100%" height="100%">
                                <AreaChart data={trendData}>
                                    <defs>
                                        <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3} />
                                            <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                                        </linearGradient>
                                    </defs>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" className="dark:stroke-slate-700" />
                                    <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 12, fontWeight: 600 }} dy={10} />
                                    <YAxis axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 12, fontWeight: 600 }} tickFormatter={(val) => `€${val / 1000}k`} />
                                    <Tooltip content={<CustomTooltip isCurrency />} />
                                    <Area type="monotone" dataKey="value" name="Ingresos" stroke="#6366f1" strokeWidth={4} fillOpacity={1} fill="url(#colorRevenue)" activeDot={{ r: 8, strokeWidth: 0 }} />
                                </AreaChart>
                            </ResponsiveContainer>
                        ) : <ChartSkeleton />}
                    </div>
                </div>

                <div className="bg-white/80 dark:bg-slate-800/80 backdrop-blur-xl p-6 rounded-3xl border border-white/50 dark:border-slate-700/50 shadow-sm transition-all hover:shadow-md">
                    <h3 className="font-bold text-slate-900 dark:text-white mb-6 text-lg">Distribución de Oportunidades</h3>
                    <div className="h-80 min-h-[320px]">
                        {distributionData.length > 0 ? (
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={distributionData} margin={{ top: 20 }}>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" className="dark:stroke-slate-700" />
                                    <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 12, fontWeight: 600 }} dy={10} />
                                    <YAxis axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 12, fontWeight: 600 }} />
                                    <Tooltip cursor={{ fill: 'transparent' }} content={<CustomTooltip />} />
                                    <Bar dataKey="value" name="Oportunidades" radius={[6, 6, 0, 0]} barSize={48}>
                                        {distributionData.map((entry, index) => (
                                            <Cell key={`cell-${index}`} fill={entry.color} />
                                        ))}
                                    </Bar>
                                </BarChart>
                            </ResponsiveContainer>
                        ) : <ChartSkeleton />}
                    </div>
                </div>
            </div>

            {/* Pipeline Distribution Chart */}
            <div className="bg-white/80 dark:bg-slate-800/80 backdrop-blur-xl p-6 rounded-3xl border border-white/50 dark:border-slate-700/50 shadow-sm transition-all hover:shadow-md">
                <h3 className="font-bold text-slate-900 dark:text-white mb-6 text-lg">Distribución por Pipeline (Oportunidades Abiertas)</h3>
                <div className="h-80 min-h-[320px]">
                    {pipelineDistributionData.length > 0 ? (
                        <ResponsiveContainer width="100%" height="100%">
                            <ComposedChart data={pipelineDistributionData} margin={{ top: 20 }}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" className="dark:stroke-slate-700" />
                                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 12, fontWeight: 600 }} dy={10} />
                                <YAxis yAxisId="left" axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 12 }} />
                                <YAxis yAxisId="right" orientation="right" axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 12 }} tickFormatter={(val) => `€${val / 1000}k`} />
                                <Tooltip cursor={{ fill: 'transparent' }} content={<CustomTooltip />} />
                                <Legend wrapperStyle={{ paddingTop: '20px' }} />
                                <Bar yAxisId="left" dataKey="Oportunidades" name="Num. Tratos" barSize={32} fill="#6366f1" radius={[4, 4, 0, 0]} />
                                <Line yAxisId="right" type="monotone" dataKey="Valor" name="Valor (€)" stroke="#10b981" strokeWidth={3} dot={{ r: 6, fill: "#10b981", strokeWidth: 2, stroke: "#fff" }} />
                            </ComposedChart>
                        </ResponsiveContainer>
                    ) : <ChartSkeleton />}
                </div>
            </div>
        </div>
    );
};
