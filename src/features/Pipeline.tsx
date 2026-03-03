import React, { useMemo } from 'react';
import { useStore } from '../store/useStore';
import { GitBranch, AlertCircle, Clock, CheckCircle2 } from 'lucide-react';
import { EmptyState } from '../components/ui/Indicators';
import { differenceInDays } from 'date-fns';

export const Pipeline = () => {
    const { pipelines, opportunities, filters } = useStore();

    const filteredPipelines = useMemo(() => {
        return Array.isArray(pipelines)
            ? (filters.pipelineId ? pipelines.filter(p => p.id === filters.pipelineId) : pipelines)
            : [];
    }, [pipelines, filters.pipelineId]);

    if (filteredPipelines.length === 0) {
        return <EmptyState title="No hay Pipelines" description="No se encontraron pipelines activos para mostrar." icon={GitBranch} />;
    }

    const getRiskLevel = (daysStagnant: number) => {
        if (daysStagnant > 14) return { label: 'Alto Riesgo', color: 'bg-rose-500', text: 'text-rose-600', bg: 'bg-rose-100 dark:bg-rose-900/30' };
        if (daysStagnant > 7) return { label: 'En Observación', color: 'bg-amber-500', text: 'text-amber-600', bg: 'bg-amber-100 dark:bg-amber-900/30' };
        return { label: 'Saludable', color: 'bg-emerald-500', text: 'text-emerald-600', bg: 'bg-emerald-100 dark:bg-emerald-900/30' };
    };

    return (
        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
            {filteredPipelines.map((pipeline: any) => {
                const pipeOpps = (Array.isArray(opportunities) ? opportunities : []).filter((o: any) => o.pipeline_id === pipeline.id);
                const stages = pipeline.stages || [];

                const validStageIds = new Set(stages.map((s: any) => s.id));
                const orphanOpps = pipeOpps.filter((o: any) => o.status === 'open' && !validStageIds.has(o.stage_id));
                const orphanValue = orphanOpps.reduce((sum: number, o: any) => sum + Number(o.value || 0), 0);

                let totalPipelineValue = orphanValue;

                const stageData = stages.map((stage: any, index: number) => {
                    const stageOpps = pipeOpps.filter((o: any) => o.stage_id === stage.id && o.status === 'open');
                    const value = stageOpps.reduce((sum: number, o: any) => sum + Number(o.value || 0), 0);
                    totalPipelineValue += value;

                    // Calculate average days in stage
                    const avgDays = stageOpps.length > 0
                        ? stageOpps.reduce((sum: number, o: any) => {
                            const updated = new Date(o.updated_at || o.created_at);
                            return sum + differenceInDays(new Date(), updated);
                        }, 0) / stageOpps.length
                        : 0;

                    const risk = getRiskLevel(avgDays);

                    return { ...stage, value, oppCount: stageOpps.length, avgDays, risk };
                });

                if (stageData.length === 0) return null;

                return (
                    <div key={pipeline.id} className="bg-white/80 dark:bg-slate-800/80 backdrop-blur-xl rounded-3xl border border-white/50 dark:border-slate-700/50 shadow-sm overflow-hidden">
                        <div className="p-6 border-b border-slate-100 dark:border-slate-700/50 bg-slate-50/50 dark:bg-slate-800/50 flex justify-between items-center">
                            <div>
                                <h2 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
                                    <GitBranch className="w-5 h-5 text-indigo-500" />
                                    {pipeline.name}
                                </h2>
                                <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">{pipeOpps.length} Oportunidades Históricas</p>
                            </div>
                            <div className="text-right">
                                <p className="text-sm font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Valor Abierto Total</p>
                                <p className="text-2xl font-black text-slate-900 dark:text-white">€{totalPipelineValue.toLocaleString()}</p>
                            </div>
                        </div>

                        <div className="p-6">
                            <div className="flex flex-col gap-6">
                                {/* Visual Pipeline Bar */}
                                <div className="flex w-full h-4 rounded-full overflow-hidden border border-slate-100 dark:border-slate-700 bg-slate-100 dark:bg-slate-800">
                                    {stageData.map((stage: any, i: number) => {
                                        if (stage.value === 0) return null;
                                        const width = (stage.value / totalPipelineValue) * 100;
                                        return (
                                            <div
                                                key={`bar-${stage.id}`}
                                                className={`h-full border-r border-white/20 dark:border-slate-900/20 last:border-0 transition-all duration-1000`}
                                                style={{ width: `${width}%`, backgroundColor: `hsl(230, 80%, ${Math.max(30, 80 - (i * 10))}%)` }}
                                                title={`${stage.name}: €${stage.value.toLocaleString()}`}
                                            />
                                        );
                                    })}
                                </div>

                                <div className="grid grid-cols-1 gap-4">
                                    {stageData.map((stage: any, index: number) => (
                                        <div key={stage.id} className="flex flex-col md:flex-row md:items-center justify-between p-4 rounded-2xl border border-slate-100 dark:border-slate-700/50 hover:bg-slate-50 dark:hover:bg-slate-700/30 transition-all group gap-4">

                                            <div className="flex items-center gap-4 min-w-[200px]">
                                                <div className="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-700 flex items-center justify-center font-bold text-slate-500 dark:text-slate-400 text-sm">
                                                    {index + 1}
                                                </div>
                                                <div>
                                                    <div className="font-bold text-slate-900 dark:text-white">{stage.name}</div>
                                                    <div className="text-sm text-slate-500 dark:text-slate-400">{stage.oppCount} tratos abiertos</div>
                                                </div>
                                            </div>

                                            <div className="flex-1 md:text-center">
                                                <div className="font-black text-lg text-slate-900 dark:text-white">€{stage.value.toLocaleString()}</div>
                                                <div className="text-xs text-slate-400 font-medium">
                                                    {totalPipelineValue > 0 ? ((stage.value / totalPipelineValue) * 100).toFixed(1) : 0}% del pipeline
                                                </div>
                                            </div>

                                            <div className="flex items-center gap-4 justify-between md:justify-end min-w-[250px]">
                                                <div className="flex flex-col items-end">
                                                    <span className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Días en Etapa</span>
                                                    <div className="flex items-center gap-2">
                                                        <Clock className="w-4 h-4 text-slate-400" />
                                                        <span className="font-semibold text-slate-700 dark:text-slate-200">{stage.avgDays.toFixed(1)} días prev.</span>
                                                    </div>
                                                </div>

                                                {stage.oppCount > 0 && (
                                                    <div className={`flex items-center gap-2 px-3 py-1.5 rounded-xl ${stage.risk.bg} ${stage.risk.text} font-bold text-sm min-w-[140px] justify-center`}>
                                                        <div className={`w-2 h-2 rounded-full ${stage.risk.color} animate-pulse`} />
                                                        {stage.risk.label}
                                                    </div>
                                                )}
                                            </div>

                                        </div>
                                    ))}

                                    {/* ORPHAN OPPORTUNITIES CATCH-ALL */}
                                    {orphanOpps.length > 0 && (
                                        <div className="flex flex-col md:flex-row md:items-center justify-between p-4 rounded-2xl border border-rose-200 dark:border-rose-900/50 bg-rose-50/50 dark:bg-rose-900/20 hover:bg-rose-50 dark:hover:bg-rose-900/40 transition-all group gap-4 mt-6">
                                            <div className="flex items-center gap-4 min-w-[200px]">
                                                <div className="w-8 h-8 rounded-full bg-rose-100 dark:bg-rose-800 flex items-center justify-center font-bold text-rose-500 dark:text-rose-400">
                                                    <AlertCircle className="w-4 h-4" />
                                                </div>
                                                <div>
                                                    <div className="font-bold text-rose-700 dark:text-rose-300">Etapa Desconocida / Borrada</div>
                                                    <div className="text-sm text-rose-600 dark:text-rose-400">{orphanOpps.length} tratos huérfanos</div>
                                                </div>
                                            </div>

                                            <div className="flex-1 md:text-center">
                                                <div className="font-black text-lg text-rose-700 dark:text-rose-300">€{orphanValue.toLocaleString()}</div>
                                                <div className="text-xs text-rose-500/70 font-medium">
                                                    {totalPipelineValue > 0 ? ((orphanValue / totalPipelineValue) * 100).toFixed(1) : 0}% del pipeline
                                                </div>
                                            </div>

                                            <div className="flex items-center gap-4 justify-between md:justify-end min-w-[250px]">
                                                <p className="text-xs text-rose-600 dark:text-rose-400 text-right">
                                                    Estos tratos están activos en GHL pero su "Etapa" no existe en los ajustes del CRM actuales.
                                                </p>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                );
            })}
        </div>
    );
};
