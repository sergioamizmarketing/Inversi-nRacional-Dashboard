import React from 'react';
import { 
  ArrowLeft, 
  Users, 
  Phone, 
  Calendar, 
  CheckCircle, 
  TrendingUp, 
  Target, 
  DollarSign, 
  AlertCircle,
  XCircle,
  FileText,
  Mail,
  X,
  Activity
} from 'lucide-react';
import { motion } from 'motion/react';
import { useStore } from '../store/useStore';

interface CloserDashboardProps {
  closerName: string;
  opportunities: any[];
  onBack: () => void;
  periodLabel?: string;
}

// Helper to identify stages dynamically in CloserDashboard
const getDynamicStages = (activePipeline: any) => {
  const stages = activePipeline?.stages || [];
  const findId = (keywords: string[]) => 
    stages.find((s: any) => keywords.some(k => s.name.toLowerCase().includes(k.toLowerCase())))?.id || '';

  return {
    NUEVO: findId(['nuevo', 'entry']),
    INTENTO: findId(['intento', 'attempt']),
    SLA: findId(['sla']),
    CONTACTADO: findId(['contactado', 'contacted']),
    SEGUIM_CERCANO: findId(['cercano', 'hot follow']),
    CITA: findId(['cita', 'appointment', 'agendada']),
    NOSHOW: findId(['no show', 'noshow', 'asistió']),
    OFERTA: findId(['oferta', 'proposal']),
    DECISION: findId(['decisión', 'decision']),
    PENDIENTE_PAGO: findId(['pendiente', 'pending']),
    PAGO_COMPLETO: findId(['pago', 'won', 'completo', 'cerrado']),
    SEGUIM_LEJANO: findId(['lejano', 'cold follow']),
    NO_CUALIFICA: findId(['cualifica', 'dq']),
    DESCARTADO: findId(['descartado', 'lost', 'perdido', 'trash'])
  };
};

export const CloserDashboard: React.FC<CloserDashboardProps> = ({ closerName, opportunities, onBack, periodLabel = "Periodo Seleccionado" }) => {
  const { pipelines, filters } = useStore();
  const [selectedPhase, setSelectedPhase] = React.useState<any | null>(null);
  const [showDiagnostics, setShowDiagnostics] = React.useState(false);
  const [syncLogs, setSyncLogs] = React.useState<string[]>([]);
  
  const activePipelineId = filters.pipelineId || pipelines[0]?.id;
  const activePipeline = pipelines.find(p => p.id === activePipelineId);
  const STAGES = getDynamicStages(activePipeline);
  
  const fetchLogs = async () => {
    try {
      const resp = await fetch('/api/debug/sync-logs');
      const data = await resp.json();
      setSyncLogs(data.logs || []);
    } catch (err) {
      console.error("Failed to fetch logs", err);
    }
  };

  React.useEffect(() => {
    if (showDiagnostics) {
      fetchLogs();
      const interval = setInterval(fetchLogs, 3000);
      return () => clearInterval(interval);
    }
  }, [showDiagnostics]);

  // Filter opportunities for this closer
  const userOpps = opportunities.filter(o => {
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
        k.toLowerCase().includes('closer')
      );
      if (key) {
        val = String((rawCFs as any)[key] || "").toLowerCase().trim();
      }
    }
    
    return val === closerName.toLowerCase().trim() || (val && closerName.toLowerCase().trim().includes(val));
  });

  // 1. Volumen de Leads
  const totalLeads = userOpps.length;
  const contactedSet = userOpps.filter(o => ![STAGES.NUEVO, STAGES.INTENTO, STAGES.SLA].includes(o.stage_id));
  const contactedCount = contactedSet.length;
  const appointmentsSet = userOpps.filter(o => o.stage_id === STAGES.CITA);
  const appointmentsCount = appointmentsSet.length;
  const salesSet = userOpps.filter(o => o.stage_id === STAGES.PAGO_COMPLETO);
  const salesCount = salesSet.length;

  // 2. Ratios
  const contactRate = totalLeads > 0 ? (contactedCount / totalLeads) * 100 : 0;
  const saleFromContactRate = contactedCount > 0 ? (salesCount / contactedCount) * 100 : 0;
  const totalSaleRate = totalLeads > 0 ? (salesCount / totalLeads) * 100 : 0;

  // 3. Estado del Pipeline
  const closeFollowUpSet = userOpps.filter(o => o.stage_id === STAGES.SEGUIM_CERCANO);
  const closeFollowUp = closeFollowUpSet.length;
  const longFollowUpSet = userOpps.filter(o => o.stage_id === STAGES.SEGUIM_LEJANO);
  const longFollowUp = longFollowUpSet.length;
  const discardedSet = userOpps.filter(o => [STAGES.DESCARTADO, STAGES.NO_CUALIFICA].includes(o.stage_id));
  const discardedCount = discardedSet.length;
  const totalRevenue = salesSet.reduce((acc, o) => acc + Number(o.value || 0), 0);

  // 4. Métricas Avanzadas
  const failedAttempts = userOpps.filter(o => [STAGES.INTENTO, STAGES.SLA].includes(o.stage_id)).length;
  const discardRate = totalLeads > 0 ? (discardedCount / totalLeads) * 100 : 0;
  
  // New Metrics
  const avgTicket = salesCount > 0 ? totalRevenue / salesCount : 0;
  const noShows = userOpps.filter(o => o.stage_id === STAGES.NOSHOW).length;
  const bookedTotal = appointmentsCount + noShows;
  const noShowRate = bookedTotal > 0 ? (noShows / bookedTotal) * 100 : 0;
  
  const openOpps = userOpps.filter(o => !['won', 'lost', 'abandoned'].includes(o.status) && ![STAGES.PAGO_COMPLETO, STAGES.DESCARTADO, STAGES.NO_CUALIFICA].includes(o.stage_id));
  const openValue = openOpps.reduce((acc, o) => acc + Number(o.value || 0), 0);
  const projectedRevenue = openValue * (totalSaleRate / 100);

  // 5. Origen de las Ventas (Basado en la etapa 'Pago Completo' para coherencia total)
  const wonOpps = salesSet;
  const originStats = wonOpps.reduce((acc: any, o) => {
    // Handle both array and object structures
    const rawCFs = o.custom_fields || o.raw?.customFields;
    let val = '';

    if (Array.isArray(rawCFs)) {
      // 1. Specific Search by ID or Label
      const field = rawCFs.find((f: any) => {
        const id = String(f.id || f.fieldId || "").toLowerCase();
        const label = String(f.name || f.label || "").toLowerCase();
        return id === 'dqikojqcdr8uyocozgpt' || label.includes('origen') || label.includes('fuente') || label.includes('procedencia');
      });

      if (field) {
        let rv = field.fieldValue || field.value || field.fieldValueString;
        if (typeof rv === 'string' && rv.startsWith('[') && rv.endsWith(']')) {
          try { const p = JSON.parse(rv); if (Array.isArray(p)) rv = p; } catch(e) {}
        }
        if (Array.isArray(rv) && rv.length > 0) rv = rv[0];
        val = String(rv || "").toLowerCase().trim();
      }

      // 2. Fail-Safe: Search ALL fields for keywords "hotmart" / "transferencia"
      if (!val || val === 'none' || val === 'null' || val === 'otro') {
        const keywordField = rawCFs.find((f: any) => {
          const v = String(f.fieldValue || f.value || f.fieldValueString || "").toLowerCase();
          return v.includes('hotmart') || v.includes('transferencia');
        });
        if (keywordField) {
          let rv = keywordField.fieldValue || keywordField.value || keywordField.fieldValueString;
          if (Array.isArray(rv) && rv.length > 0) rv = rv[0];
          val = String(rv || "").toLowerCase().trim();
        }
      }
    } else if (rawCFs && typeof rawCFs === 'object') {
      const key = Object.keys(rawCFs).find(k => k === 'dQIKOJqcDR8uYOcoZGPt' || k.toLowerCase().includes('origen') || k.toLowerCase().includes('fuente') || k.toLowerCase().includes('procedencia'));
      if (key) {
        val = String((rawCFs as any)[key] || "").toLowerCase().trim();
      }
    }
    
    let origin = 'Otro';
    if (val && !['none', 'null', 'undefined', 'otro'].includes(val)) {
      if (val.includes('hotmart')) origin = 'Hotmart';
      else if (val.includes('transferencia')) origin = 'Transferencia';
      else origin = val.charAt(0).toUpperCase() + val.slice(1);
    }

    // Ultimate Fallback: Scour the raw JSON for the keywords if still 'Otro'
    if (origin === 'Otro' && o.raw) {
      const rawStr = JSON.stringify(o.raw).toLowerCase();
      if (rawStr.includes('hotmart')) origin = 'Hotmart';
      else if (rawStr.includes('transferencia')) origin = 'Transferencia';
    }

    if (!acc[origin]) acc[origin] = { count: 0, revenue: 0, opportunities: [] };
    acc[origin].count += 1;
    acc[origin].revenue += Number(o.value || 0);
    // Keep reference for drill-down
    acc[origin].opportunities.push(o);
    return acc;
  }, {});

  const originData = Object.entries(originStats).map(([name, stats]: [string, any]) => ({
    name,
    count: stats.count,
    revenue: stats.revenue,
    apps: stats.opportunities,
    percentage: salesCount > 0 ? (stats.count / salesCount) * 100 : 0
  })).sort((a, b) => b.revenue - a.revenue);

  // Phase breakdown for table - now fully dynamic
  const tableData = (activePipeline?.stages || []).map((stage: any, index: number) => {
    const count = userOpps.filter(o => o.stage_id === stage.id).length;
    const percentage = totalLeads > 0 ? (count / totalLeads) * 100 : 0;
    
    // Choose a color based on stage name or index
    let color = `bg-indigo-${Math.min(900, 400 + (index * 100))}`;
    if (stage.name.toLowerCase().includes('pago') || stage.name.toLowerCase().includes('won')) color = 'bg-emerald-500';
    if (stage.name.toLowerCase().includes('descartado') || stage.name.toLowerCase().includes('lost')) color = 'bg-rose-500';
    if (stage.name.toLowerCase().includes('cita')) color = 'bg-blue-500';

    return { 
      name: stage.name, 
      id: stage.id, 
      color, 
      count, 
      percentage 
    };
  });

  const MetricCard = ({ label, value, sublabel, icon: Icon, colorClass, highlightValue, onClick }: any) => (
    <div 
      onClick={onClick}
      className={`bg-slate-800/50 border border-slate-700/50 p-4 rounded-xl flex items-center gap-4 transition-all duration-300 ${
        onClick ? 'cursor-pointer hover:border-indigo-500/50 hover:bg-slate-800/80 active:scale-[0.98]' : ''
      }`}
    >
      <div className={`p-3 rounded-lg ${colorClass} bg-opacity-10`}>
        <Icon className={`w-5 h-5 ${colorClass.replace('bg-', 'text-')}`} />
      </div>
      <div>
        <p className="text-[10px] uppercase font-bold text-slate-400 tracking-wider mb-1">{label}</p>
        <div className="flex items-baseline gap-2">
            <span className={`text-2xl font-black ${highlightValue ? 'text-amber-400' : 'text-white'}`}>{value}</span>
            {sublabel && <span className="text-xs text-slate-500 font-bold">{sublabel}</span>}
        </div>
      </div>
    </div>
  );

  const OpportunityModal = ({ phase, onClose }: { phase: any, onClose: () => void }) => {
    // phase can be a 'p' from phases table OR a custom object from MetricCard
    const title = phase.name || phase.title;
    const color = phase.color || 'bg-indigo-500';
    const phaseOpps = phase.apps || (phase.ids 
      ? userOpps.filter(o => phase.ids!.includes(o.stage_id))
      : userOpps.filter(o => o.stage_id === phase.id));

    return (
      <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-300">
        <div className="bg-slate-900 border border-slate-700 w-full max-w-4xl max-h-[85vh] rounded-3xl overflow-hidden shadow-2xl flex flex-col animate-in zoom-in-95 duration-300">
          <div className="p-6 border-b border-slate-800 bg-[#0f172a] flex justify-between items-center group">
            <div className="flex items-center gap-3">
              <div className={`w-10 h-10 rounded-xl ${color} bg-opacity-20 flex items-center justify-center border ${color.replace('bg-', 'border-')}/30`}>
                <FileText className={`w-6 h-6 ${color.replace('bg-', 'text-')}`} />
              </div>
              <div>
                <h3 className="text-xl font-black text-white tracking-widest uppercase">{title}</h3>
                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-tighter">
                  {phaseOpps.length} Oportunidades encontradas para {closerName}
                </p>
              </div>
            </div>
            <button 
              onClick={onClose}
              className="p-2 hover:bg-slate-800 rounded-full transition-colors text-slate-400 hover:text-white"
            >
              <X className="w-6 h-6" />
            </button>
          </div>
          
          <div className="flex-1 overflow-auto p-6 bg-[#0a0f1e]">
            {phaseOpps.length > 0 ? (
              <div className="space-y-4">
                {phaseOpps.map((o: any, idx: number) => {
                  const contact = o.contact || o.raw?.contact || {};
                  const notes = o.raw?.lastNoteSynced || o.last_note || o.raw?.description || 'Sin notas del closer registradas.';
                  
                  return (
                    <div key={idx} className="bg-slate-800/40 border border-slate-700/50 p-5 rounded-2xl group hover:border-indigo-500/50 transition-all duration-300">
                      <div className="flex flex-col md:flex-row md:items-start justify-between gap-4 mb-4">
                        <div className="space-y-1">
                          <h4 className="text-lg font-black text-white group-hover:text-amber-400 transition-colors">{o.name}</h4>
                          <div className="flex flex-wrap gap-3">
                            <div className="flex items-center gap-1.5 text-xs font-bold text-slate-400">
                              <Users className="w-3.5 h-3.5 text-indigo-400" />
                              {contact.name || 'S/N'}
                            </div>
                            {contact.email && (
                              <a href={`mailto:${contact.email}`} className="flex items-center gap-1.5 text-xs font-bold text-slate-400 hover:text-indigo-400 transition-colors">
                                <Mail className="w-3.5 h-3.5" />
                                {contact.email}
                              </a>
                            )}
                            {contact.phone && (
                              <a href={`tel:${contact.phone}`} className="flex items-center gap-1.5 text-xs font-bold text-slate-400 hover:text-indigo-400 transition-colors">
                                <Phone className="w-3.5 h-3.5" />
                                {contact.phone}
                              </a>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-lg font-black text-emerald-400">€{Number(o.value || 0).toLocaleString()}</span>
                          <span className="px-2 py-0.5 rounded-md bg-slate-700 text-[10px] font-bold text-slate-400 uppercase tracking-widest">{o.status === 'won' ? 'PAGADO' : 'ABIERTO'}</span>
                        </div>
                      </div>
                      
                      <div className="bg-slate-900/50 border border-slate-700/30 p-4 rounded-xl relative">
                        <p className="text-[10px] font-black text-indigo-400 mb-2 uppercase tracking-widest flex items-center gap-1.5">
                          <AlertCircle className="w-3 h-3" />
                          Notas del Closer
                        </p>
                        <p className="text-sm font-medium text-slate-300 whitespace-pre-wrap leading-relaxed italic">
                          "{notes}"
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="h-64 flex flex-col items-center justify-center opacity-50">
                <AlertCircle className="w-12 h-12 text-slate-600 mb-4" />
                <p className="text-sm font-black uppercase tracking-widest text-slate-500">No hay oportunidades en este estado</p>
              </div>
            )}
          </div>
          
          <div className="p-4 bg-[#0f172a] border-t border-slate-800 text-center">
            <button 
              onClick={onClose}
              className="px-8 py-3 bg-slate-800 hover:bg-slate-700 text-white rounded-xl font-black uppercase tracking-widest text-xs transition-all border border-slate-700"
            >
              Cerrar Listado
            </button>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500 overflow-hidden pb-12">
      {selectedPhase && (
        <OpportunityModal phase={selectedPhase} onClose={() => setSelectedPhase(null)} />
      )}
      <button 
        onClick={onBack}
        className="flex items-center gap-2 text-slate-400 hover:text-white transition-colors font-bold text-sm mb-4 group"
      >
        <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
        Volver a Clasificación
      </button>

      <div className="bg-slate-900 border border-slate-700 rounded-3xl overflow-hidden shadow-2xl">
        <div className="bg-[#0f172a] p-6 border-b border-slate-700 flex justify-between items-center">
          <div>
            <h1 className="text-xl font-black text-white tracking-widest uppercase">
              DASHBOARD CLOSER | <span className="text-indigo-400">{closerName.toUpperCase()}</span>
            </h1>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-[10px] bg-slate-800 text-slate-400 px-2 py-0.5 rounded border border-slate-700 font-black uppercase tracking-widest">
                Pipeline: {activePipeline?.name || 'Cargando...'}
              </span>
              <p className="text-xs text-slate-500 font-bold uppercase tracking-tighter opacity-70">
                · {periodLabel.toUpperCase()}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button 
              onClick={() => setShowDiagnostics(true)}
              className="w-10 h-10 bg-indigo-500/10 hover:bg-indigo-500/20 rounded-xl flex items-center justify-center border border-indigo-500/20 transition-all text-indigo-400"
              title="Diagnóstico de Sincronización"
            >
              <Activity className="w-5 h-5" />
            </button>
            <div className="w-12 h-12 bg-indigo-500/20 rounded-full flex items-center justify-center border border-indigo-500/30">
              <Target className="text-indigo-400 w-6 h-6" />
            </div>
          </div>
        </div>

        <div className="p-6 space-y-8 bg-[#0a0f1e]">
          {/* Section 1: Volumen */}
          <section>
            <h2 className="text-xs font-black text-indigo-400 mb-4 flex items-center gap-2 uppercase tracking-widest">
                <span className="w-5 h-5 bg-indigo-500/20 text-indigo-400 rounded-full flex items-center justify-center text-[10px] border border-indigo-500/30">1</span>
                Volumen de Leads
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <MetricCard 
                label="Leads Totales" 
                value={totalLeads} 
                icon={Users} 
                colorClass="bg-amber-400" 
                highlightValue 
                onClick={() => setSelectedPhase({ title: 'Leads Totales', apps: userOpps, color: 'bg-amber-400' })}
              />
              <MetricCard 
                label="Contactados (acum)" 
                value={contactedCount} 
                icon={Phone} 
                colorClass="bg-emerald-400" 
                onClick={() => setSelectedPhase({ title: 'Leads Contactados', apps: contactedSet, color: 'bg-emerald-400' })}
              />
              <MetricCard 
                label="Citas Agendadas" 
                value={appointmentsCount} 
                icon={Calendar} 
                colorClass="bg-blue-400" 
                onClick={() => setSelectedPhase({ title: 'Citas Agendadas', apps: appointmentsSet, color: 'bg-blue-400' })}
              />
              <MetricCard 
                label="Ventas Cerradas" 
                value={salesCount} 
                icon={CheckCircle} 
                colorClass="bg-rose-400" 
                onClick={() => setSelectedPhase({ title: 'Pago Completo', apps: salesSet, color: 'bg-rose-400' })}
              />
            </div>
          </section>

          {/* Section 2: Ratios */}
          <section>
            <h2 className="text-xs font-black text-indigo-400 mb-4 flex items-center gap-2 uppercase tracking-widest">
                <span className="w-5 h-5 bg-indigo-500/20 text-indigo-400 rounded-full flex items-center justify-center text-[10px] border border-indigo-500/30">2</span>
                Ratios de Conversión (%)
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <MetricCard label="Contactado / Lead" value={`${contactRate.toFixed(0)}%`} icon={Phone} colorClass="bg-emerald-500" />
              <MetricCard label="Venta / Contactado" value={`${saleFromContactRate.toFixed(0)}%`} icon={TrendingUp} colorClass="bg-amber-500" highlightValue />
              <MetricCard label="Venta / Lead Total" value={`${totalSaleRate.toFixed(0)}%`} icon={CheckCircle} colorClass="bg-rose-500" />
            </div>
          </section>

          {/* Section 3: Estado Pipeline */}
          <section>
            <h2 className="text-xs font-black text-indigo-400 mb-4 flex items-center gap-2 uppercase tracking-widest">
                <span className="w-5 h-5 bg-indigo-500/20 text-indigo-400 rounded-full flex items-center justify-center text-[10px] border border-indigo-500/30">3</span>
                Estado del Pipeline
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <MetricCard 
                label="Seguim. Cercano" 
                value={closeFollowUp} 
                icon={Target} 
                colorClass="bg-emerald-500" 
                onClick={() => setSelectedPhase({ title: 'Seguimiento Cercano', apps: closeFollowUpSet, color: 'bg-emerald-500' })}
              />
              <MetricCard 
                label="Seguim. Lejano" 
                value={longFollowUp} 
                icon={Users} 
                colorClass="bg-blue-500" 
                onClick={() => setSelectedPhase({ title: 'Seguimiento Lejano', apps: longFollowUpSet, color: 'bg-blue-500' })}
              />
              <MetricCard 
                label="Descartados / N.C." 
                value={discardedCount} 
                icon={XCircle} 
                colorClass="bg-rose-500" 
                onClick={() => setSelectedPhase({ title: 'Leads Descartados', apps: discardedSet, color: 'bg-rose-500' })}
              />
              <MetricCard label="Ingresos Generados" value={`€${totalRevenue.toLocaleString()}`} icon={DollarSign} colorClass="bg-amber-500" highlightValue />
            </div>
          </section>

          {/* Section 4: Métricas Avanzadas */}
          <section>
            <h2 className="text-xs font-black text-indigo-400 mb-4 flex items-center gap-2 uppercase tracking-widest">
                <span className="w-5 h-5 bg-indigo-500/20 text-indigo-400 rounded-full flex items-center justify-center text-[10px] border border-indigo-500/30">4</span>
                Métricas Avanzadas
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <MetricCard label="Ticket Medio" value={`€${avgTicket.toLocaleString(undefined, { maximumFractionDigits: 0 })}`} icon={DollarSign} colorClass="bg-emerald-500" />
              <MetricCard label="Tasa No-Show" value={`${noShowRate.toFixed(1)}%`} icon={XCircle} colorClass="bg-amber-500" highlightValue />
              <MetricCard 
                label="Ventas Cerradas" 
                value={salesCount} 
                icon={CheckCircle} 
                colorClass="bg-emerald-500" 
                onClick={() => setSelectedPhase({ title: 'Resumen de Ventas', apps: salesSet, color: 'bg-emerald-500' })}
              />
              <MetricCard label="Ingresos Proyectados" value={`€${projectedRevenue.toLocaleString(undefined, { maximumFractionDigits: 0 })}`} icon={TrendingUp} colorClass="bg-rose-500" />
            </div>
          </section>

          {/* Section 5: Origen de las Ventas */}
          <section>
            <h2 className="text-xs font-black text-indigo-400 mb-4 flex items-center gap-2 uppercase tracking-widest">
                <span className="w-5 h-5 bg-indigo-500/20 text-indigo-400 rounded-full flex items-center justify-center text-[10px] border border-indigo-500/30">5</span>
                Origen de las Ventas (Hotmart vs Transf.)
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {originData.length > 0 ? originData.map((item, idx) => {
                return (
                  <div 
                    key={idx} 
                    onClick={() => setSelectedPhase({ title: `Ventas via ${item.name}`, apps: item.apps, color: item.name === 'Hotmart' ? 'bg-orange-500' : 'bg-blue-500' })}
                    className="bg-slate-800/40 border border-slate-700/50 p-5 rounded-2xl relative overflow-hidden group cursor-pointer hover:border-indigo-500/50 transition-all active:scale-[0.98]"
                  >
                    <div className={`absolute top-0 right-0 w-24 h-24 -mr-8 -mt-8 rounded-full opacity-10 blur-2xl ${item.name === 'Hotmart' ? 'bg-orange-500' : item.name === 'Transferencia' ? 'bg-blue-500' : 'bg-slate-500'}`} />
                    <div className="relative z-10">
                      <div className="flex justify-between items-start mb-4">
                        <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest ${item.name === 'Hotmart' ? 'bg-orange-500/20 text-orange-400 border border-orange-500/30' : item.name === 'Transferencia' ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30' : 'bg-slate-500/20 text-slate-400 border border-slate-500/30'}`}>
                          {item.name}
                        </span>
                        <span className="text-xs font-black text-slate-500">{item.percentage.toFixed(0)}%</span>
                      </div>
                      <div className="space-y-1">
                        <p className="text-3xl font-black text-white group-hover:text-indigo-400 transition-colors">€{item.revenue.toLocaleString()}</p>
                        <p className="text-xs font-bold text-slate-500 uppercase tracking-tighter">{item.count} Ventas cerradas</p>
                      </div>
                      <div className="mt-4 w-full h-1.5 bg-slate-700/50 rounded-full overflow-hidden">
                        <div className={`h-full rounded-full ${item.name === 'Hotmart' ? 'bg-orange-500' : item.name === 'Transferencia' ? 'bg-blue-500' : 'bg-slate-500'}`} style={{ width: `${item.percentage}%` }} />
                      </div>
                    </div>
                  </div>
                );
              }) : (
                <div className="col-span-full py-10 bg-slate-800/20 rounded-2xl border border-dashed border-slate-700 flex flex-col items-center justify-center opacity-50">
                  <AlertCircle className="w-8 h-8 text-slate-600 mb-2" />
                  <p className="text-xs font-bold uppercase tracking-widest text-slate-500">Sin datos de origen disponibles</p>
                </div>
              )}
            </div>
          </section>

          {/* Section 6: Table Breakdown */}
          <section className="pt-4">
            <div className="bg-slate-800/30 border border-slate-700/50 rounded-2xl overflow-hidden">
                <table className="w-full text-left">
                    <thead className="bg-[#0a0f1e] border-b border-slate-700">
                        <tr>
                            <th className="px-6 py-4 text-[10px] font-black text-slate-500 uppercase tracking-widest text-center">Fase / Estado</th>
                            <th className="px-6 py-4 text-[10px] font-black text-slate-500 uppercase tracking-widest text-center"># Leads</th>
                            <th className="px-6 py-4 text-[10px] font-black text-slate-500 uppercase tracking-widest text-center">% s/total</th>
                            <th className="px-6 py-4 text-[10px] font-black text-slate-500 uppercase tracking-widest">Barra Visual</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-700/50">
                        {tableData.map((row, idx) => (
                            <tr 
                                key={idx} 
                                onClick={() => setSelectedPhase(row)}
                                className="hover:bg-slate-700/40 transition-all cursor-pointer group active:scale-[0.99]"
                            >
                                <td className="px-6 py-3 text-sm font-bold text-slate-300">
                                    <div className="flex items-center gap-2">
                                        <div className={`w-2 h-2 rounded-full ${row.color} shadow-[0_0_8px] shadow-current`} />
                                        <span className="group-hover:text-white transition-colors capitalize">{row.name}</span>
                                    </div>
                                </td>
                                <td className="px-6 py-3 text-center text-sm font-black text-slate-300 group-hover:text-amber-400 transition-colors">{row.count}</td>
                                <td className="px-6 py-3 text-center text-xs font-bold text-slate-400">{row.percentage.toFixed(1)}%</td>
                                <td className="px-6 py-3 min-w-[150px]">
                                    <div className="w-full h-2 bg-slate-700/50 rounded-full overflow-hidden border border-slate-800">
                                        <div className={`h-full ${row.color} rounded-full transition-all duration-1000 group-hover:brightness-125`} style={{ width: `${row.percentage}%` }} />
                                    </div>
                                </td>
                            </tr>
                        ))}
                        <tr className="bg-amber-400/5">
                            <td className="px-6 py-4 text-sm font-black text-amber-400 uppercase tracking-wider">Total Ventas (Pago Completo)</td>
                            <td className="px-6 py-4 text-center text-lg font-black text-amber-400">{salesCount}</td>
                            <td className="px-6 py-4 text-center text-sm font-black text-amber-400">{totalSaleRate.toFixed(1)}%</td>
                            <td className="px-6 py-4">
                                <div className="w-full h-3 bg-slate-700/50 rounded-full overflow-hidden">
                                    <div className="h-full bg-amber-400 rounded-full" style={{ width: `${totalSaleRate}%` }} />
                                </div>
                            </td>
                        </tr>
                    </tbody>
                </table>
            </div>
            <p className="mt-4 text-[10px] text-slate-500 italic uppercase tracking-tighter text-right px-2">
                * CONTACTADOS = leads con conversación real (excluye "intento de contacto" sin respuesta). | Fuente: api 'opportunities' - Inversión Racional
            </p>
          </section>
        </div>
      </div>
      {/* Diagnostics Modal */}
      {showDiagnostics && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 overflow-hidden">
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm"
            onClick={() => setShowDiagnostics(false)}
          />
          <motion.div 
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="relative bg-slate-900 border border-slate-700 w-full max-w-2xl rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[80vh]"
          >
            <div className="p-6 border-b border-slate-700 flex justify-between items-center bg-[#0f172a]">
              <div className="flex items-center gap-3">
                <Activity className="w-6 h-6 text-indigo-400" />
                <h2 className="text-xl font-black text-white uppercase tracking-widest">Diagnóstico de Sincronización</h2>
              </div>
              <button 
                onClick={() => setShowDiagnostics(false)}
                className="p-2 hover:bg-slate-800 rounded-xl transition-colors text-slate-400"
              >
                <X className="w-6 h-6" />
              </button>
            </div>
            
            <div className="flex-1 overflow-y-auto p-4 bg-black/40 font-mono text-[11px] leading-relaxed">
              {syncLogs.length === 0 ? (
                <div className="text-slate-600 italic py-8 text-center uppercase tracking-widest text-[10px]">Esperando actividad... Pulsa "Sincronizar" para empezar.</div>
              ) : (
                <div className="space-y-1">
                  {syncLogs.map((log, i) => (
                    <div key={i} className={`py-1.5 border-b border-white/5 transition-colors ${
                      log.includes('❌') ? 'text-rose-400 bg-rose-400/5' : 
                      log.includes('✅') ? 'text-emerald-400' : 
                      log.includes('ℹ️') ? 'text-sky-400' : 'text-slate-400'
                    }`}>
                      <span className="opacity-30 mr-2">[{i}]</span>
                      {log}
                    </div>
                  ))}
                </div>
              )}
            </div>
            
            <div className="p-4 bg-slate-800/50 text-center border-t border-slate-700">
              <p className="text-slate-500 text-[9px] uppercase tracking-[0.2em] font-black">
                Autorefresco activo cada 3 seg · Servidor: OK
              </p>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
};
