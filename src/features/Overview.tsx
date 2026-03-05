import React, { useMemo } from 'react';
import { useStore } from '../store/useStore';
import { ChartSkeleton, EmptyState } from '../components/ui/Indicators';
import {
    PieChart, Pie, Cell, ResponsiveContainer, Tooltip as RechartsTooltip, Legend,
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Label
} from 'recharts';

// Colors based on the screenshot (GHL standard)
const COLORS = ['#38bdf8', '#fbbf24', '#a855f7', '#818cf8', '#6366f1', '#4ade80', '#f472b6', '#f87171'];
const STATUS_COLORS = { open: '#38bdf8', won: '#4ade80', lost: '#f87171', abandoned: '#94a3b8' };

const CustomTooltip = ({ active, payload, isCurrency = false }: any) => {
    if (active && payload && payload.length) {
        return (
            <div className="bg-white/90 dark:bg-slate-800/90 backdrop-blur-xl p-3 rounded-xl shadow-xl border border-white/50 dark:border-slate-700/50 text-sm z-50">
                {payload.map((entry: any, index: number) => (
                    <div key={index} className="flex items-center gap-2">
                        <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: entry.color || entry.payload?.fill || "#000" }} />
                        <span className="font-semibold text-slate-800 dark:text-slate-200">
                            {entry.name}: {isCurrency ? '€' : ''}{Number(entry.value).toLocaleString()}
                        </span>
                    </div>
                ))}
            </div>
        );
    }
    return null;
};

export const Overview = () => {
    const { metrics, opportunities, pipelines, filters } = useStore();

    const chartData = useMemo(() => {
        if (!opportunities || opportunities.length === 0) return null;

        const safeOpps = [...opportunities].filter(o => o.created_at);

        // 1. Opportunity Status -> count
        const openCount = safeOpps.filter(o => o.status === 'open').length;
        const wonCount = safeOpps.filter(o => o.status === 'won').length;
        const statusData = [
            { name: 'Open', value: openCount, fill: STATUS_COLORS.open },
            { name: 'Won', value: wonCount, fill: STATUS_COLORS.won }
        ];

        // 2. Opportunity Value -> sum
        const openValue = safeOpps.filter(o => o.status === 'open').reduce((sum, o) => sum + Number(o.value || 0), 0);
        const wonValue = safeOpps.filter(o => o.status === 'won').reduce((sum, o) => sum + Number(o.value || 0), 0);
        const valueData = [
            { name: 'Open', value: openValue, fill: STATUS_COLORS.open },
            { name: 'Won', value: wonValue, fill: STATUS_COLORS.won }
        ];
        const totalRevenue = wonValue + openValue;

        // 3. Conversion Rate
        const totalClosed = wonCount + safeOpps.filter(o => o.status === 'lost' || o.status === 'abandoned').length;
        const winRate = totalClosed > 0 ? (wonCount / totalClosed) * 100 : 0;

        // 4 & 5. Funnel & Stage Distribution
        // Find the active pipeline or first if none selected
        const activePipelineId = filters.pipelineId || (pipelines.length > 0 ? pipelines[0].id : null);
        const activePipeline = pipelines.find(p => p.id === activePipelineId);

        const stageData: any[] = [];
        let totalOpenInPipe = 0;

        if (activePipeline && activePipeline.stages) {
            const pipeOpps = safeOpps.filter(o => o.pipeline_id === activePipeline.id && o.status === 'open');
            totalOpenInPipe = pipeOpps.length;

            activePipeline.stages.forEach((stage: any, index: number) => {
                const sOpps = pipeOpps.filter(o => o.stage_id === stage.id);
                const sValue = sOpps.reduce((sum, o) => sum + Number(o.value || 0), 0);
                if (sOpps.length > 0) {
                    stageData.push({
                        name: stage.name,
                        count: sOpps.length,
                        value: sValue,
                        fill: COLORS[index % COLORS.length]
                    });
                }
            });
        }

        return {
            statusData,
            totalStatus: openCount + wonCount,
            valueData,
            totalRevenue,
            winRate,
            wonValue,
            stageData,
            totalOpenInPipe
        };

    }, [opportunities, pipelines, filters.pipelineId]);

    if (!metrics) return (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 animate-pulse">
            {[1, 2, 3, 4, 5].map(i => <div key={i} className="h-64 bg-white/50 dark:bg-slate-800/50 rounded-2xl" />)}
        </div>
    );

    if (!chartData || opportunities.length === 0) {
        return <EmptyState title="Sin datos comerciales" description="No hemos encontrado oportunidades en el rango de fechas seleccionado. Cambia los filtros o sincroniza con tu CRM." />;
    }

    const { statusData, totalStatus, valueData, totalRevenue, winRate, wonValue, stageData, totalOpenInPipe } = chartData;

    return (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-10">

            {/* Top Row: 3 Widgets */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

                {/* 1. Opportunity Status */}
                <div className="bg-white/80 dark:bg-slate-800/80 backdrop-blur-xl p-6 rounded-3xl border border-white/50 dark:border-slate-700/50 shadow-sm flex flex-col items-center">
                    <h3 className="font-bold text-slate-900 dark:text-white w-full text-left mb-2 text-sm">Opportunity Status</h3>
                    <div className="w-full h-52 relative">
                        <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                                <Pie data={statusData} innerRadius={65} outerRadius={85} dataKey="value" stroke="none">
                                    <Label value={totalStatus} position="center" className="text-3xl font-black fill-slate-900 dark:fill-white" />
                                </Pie>
                                <Legend verticalAlign="middle" align="right" layout="vertical" iconType="circle" wrapperStyle={{ fontSize: '12px', fontWeight: 'bold' }} />
                                <RechartsTooltip content={<CustomTooltip />} />
                            </PieChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                {/* 2. Opportunity Value */}
                <div className="bg-white/80 dark:bg-slate-800/80 backdrop-blur-xl p-6 rounded-3xl border border-white/50 dark:border-slate-700/50 shadow-sm flex flex-col">
                    <h3 className="font-bold text-slate-900 dark:text-white w-full text-left mb-2 text-sm">Opportunity Value</h3>
                    <div className="w-full h-40 mt-4">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={valueData} layout="vertical" margin={{ top: 0, right: 30, left: 10, bottom: 5 }}>
                                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e2e8f0" className="dark:stroke-slate-700" />
                                <XAxis type="number" axisLine={false} tickLine={false} tick={{ fontSize: 11, fontWeight: 'bold' }} tickFormatter={(val) => `€${val >= 1000 ? val / 1000 + 'k' : val}`} />
                                <YAxis dataKey="name" type="category" axisLine={false} tickLine={false} tick={{ fontSize: 12, fontWeight: 'bold', fill: '#94a3b8' }} width={50} />
                                <RechartsTooltip content={<CustomTooltip isCurrency />} cursor={{ fill: 'transparent' }} />
                                <Bar dataKey="value" barSize={14} radius={[0, 4, 4, 0]} />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                    <div className="text-center mt-2 border-t border-slate-100 dark:border-slate-700/50 pt-3">
                        <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mb-0.5">Total Revenue</p>
                        <p className="text-xl font-black text-slate-900 dark:text-white">€{totalRevenue.toLocaleString()}</p>
                    </div>
                </div>

                {/* 3. Conversion Rate */}
                <div className="bg-white/80 dark:bg-slate-800/80 backdrop-blur-xl p-6 rounded-3xl border border-white/50 dark:border-slate-700/50 shadow-sm flex flex-col items-center">
                    <h3 className="font-bold text-slate-900 dark:text-white w-full text-left mb-2 text-sm">Conversion Rate</h3>
                    <div className="w-full h-44 relative">
                        <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                                <Pie data={[{ value: winRate, fill: '#38bdf8' }, { value: Math.max(100 - winRate, 0), fill: '#f1f5f9', stroke: 'none' }]} innerRadius={65} outerRadius={85} dataKey="value" stroke="none" startAngle={90} endAngle={-270}>
                                    <Label value={`${winRate.toFixed(2)}%`} position="center" className="text-2xl font-black fill-slate-900 dark:fill-white" />
                                </Pie>
                                <RechartsTooltip content={({ active }) => active && winRate > 0 ? <div className="bg-white/90 dark:bg-slate-800/90 p-2 rounded-lg shadow font-bold text-sm">Tasa de Cierre: {winRate.toFixed(2)}%</div> : null} />
                            </PieChart>
                        </ResponsiveContainer>
                    </div>
                    <div className="text-center mt-3 w-full">
                        <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mb-0.5">Won Revenue</p>
                        <p className="text-xl font-black text-slate-900 dark:text-white">€{wonValue.toLocaleString()}</p>
                    </div>
                </div>
            </div>

            {/* Bottom Row: 2 Widgets */}
            <div className="grid grid-cols-1 lg:grid-cols-[1.5fr_1fr] gap-6">

                {/* 4. Funnel */}
                <div className="bg-white/80 dark:bg-slate-800/80 backdrop-blur-xl p-6 rounded-3xl border border-white/50 dark:border-slate-700/50 shadow-sm flex flex-col">
                    <h3 className="font-bold text-slate-900 dark:text-white w-full text-left mb-4 text-sm flex justify-between">
                        Funnel
                        <span className="text-xs text-slate-400 font-normal border border-slate-200 dark:border-slate-700 px-2.5 py-1 rounded-lg bg-slate-50 dark:bg-slate-900">Oportunidades Abiertas por Etapa</span>
                    </h3>
                    <div className="w-full h-96 pr-4">
                        {stageData.length > 0 ? (
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={stageData} layout="vertical" margin={{ top: 0, right: 60, left: 10, bottom: 0 }}>
                                    <XAxis type="number" hide />
                                    <YAxis dataKey="name" type="category" axisLine={false} tickLine={false} tick={{ fontSize: 11, fontWeight: 'bold' }} width={140} />
                                    <RechartsTooltip content={<CustomTooltip isCurrency />} cursor={{ fill: 'transparent' }} />
                                    <Bar dataKey="value" barSize={32} radius={[0, 4, 4, 0]}>
                                        {stageData.map((entry, index) => (
                                            <Cell key={`cell-${index}`} fill={entry.fill} />
                                        ))}
                                    </Bar>
                                </BarChart>
                            </ResponsiveContainer>
                        ) : <EmptyState title="Sin etapas" description="No hay etapas activas en este pipeline." />}
                    </div>
                </div>

                {/* 5. Stage Distribution */}
                <div className="bg-white/80 dark:bg-slate-800/80 backdrop-blur-xl p-6 rounded-3xl border border-white/50 dark:border-slate-700/50 shadow-sm flex flex-col items-center">
                    <h3 className="font-bold text-slate-900 dark:text-white w-full text-left mb-4 text-sm">Stage Distribution</h3>
                    <div className="w-full h-80 relative mt-4">
                        {stageData.length > 0 ? (
                            <ResponsiveContainer width="100%" height="100%">
                                <PieChart>
                                    <Pie data={stageData} innerRadius={80} outerRadius={110} dataKey="count" stroke="none">
                                        <Label value={totalOpenInPipe} position="center" className="text-4xl font-black fill-slate-900 dark:fill-white" />
                                    </Pie>
                                    <Legend verticalAlign="middle" align="right" layout="vertical" iconType="circle" wrapperStyle={{ fontSize: '11px', fontWeight: 'bold', width: '45%' }} formatter={(value, entry: any) => `${value} (${entry.payload.count})`} />
                                    <RechartsTooltip content={<CustomTooltip />} />
                                </PieChart>
                            </ResponsiveContainer>
                        ) : <EmptyState title="Sin pipeline" description="No hay un pipeline seleccionado." />}
                    </div>
                </div>
            </div>


        </div>
    );
};
