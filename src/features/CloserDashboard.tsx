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
  XCircle
} from 'lucide-react';
import { motion } from 'motion/react';

interface CloserDashboardProps {
  closerName: string;
  opportunities: any[];
  onBack: () => void;
  periodLabel?: string;
}

const STAGES = {
  NUEVO: '0592a5e6-fd13-4a5a-90b5-c5a85984ca65',
  INTENTO: '8b2f3520-169a-48c4-a1d9-d57516e92d1a',
  SLA: 'a7af2177-14ac-4eb9-8425-7ec2cb9116cb',
  CONTACTADO: '31e78973-a17e-4bc2-94d9-5493859963bb',
  SEGUIM_CERCANO: 'a929bb37-c579-4bee-98e8-c6375d0ff87b',
  CITA: '20cffdf9-8bb1-4853-9e9e-daa37eb1590f',
  NOSHOW: '83c65690-d05d-4218-b62a-c7be507f2e6a',
  OFERTA: 'abeec1b8-c599-42f7-922d-2d40ae10ef30',
  DECISION: '9f2aa184-c216-43f2-95b2-1ed4034dcbdf',
  PENDIENTE_PAGO: '1be1c2a2-58ed-4497-a5d9-cc0bb65dbf29',
  PAGO_COMPLETO: '59d29ec6-5d94-4b92-a5d1-ffe4ad2f1287',
  SEGUIM_LEJANO: '7f1344af-cf32-4db2-8855-4a002c1e3bc5',
  NO_CUALIFICA: '0ff084c6-dcb8-4a28-a147-0ce6aacb954b',
  DESCARTADO: '00025815-cd2e-4bce-adc4-d4312c7552a8'
};

export const CloserDashboard: React.FC<CloserDashboardProps> = ({ closerName, opportunities, onBack, periodLabel = "Periodo Seleccionado" }) => {
  // Filter opportunities for this closer
  const userOpps = opportunities.filter(o => {
    const customFields = Array.isArray(o.raw?.customFields) ? o.raw.customFields : (Array.isArray(o.custom_fields) ? o.custom_fields : []);
    const closerField = customFields.find((f: any) =>
        String(f.id || "") === 'DPEKghcOYLZADdLcTR8Q' ||
        String(f.key || "").toLowerCase().includes('closer') ||
        String(f.name || "").toLowerCase().includes('closer')
    );
    if (!closerField) return false;
    let rawVal = closerField.fieldValue || closerField.fieldValueString || closerField.field_value || closerField.value;
    if (Array.isArray(rawVal) && rawVal.length > 0) rawVal = rawVal[0];
    return String(rawVal || "").toLowerCase().trim() === closerName.toLowerCase().trim();
  });

  // 1. Volumen de Leads
  const totalLeads = userOpps.length;
  const contactedSet = userOpps.filter(o => ![STAGES.NUEVO, STAGES.INTENTO, STAGES.SLA].includes(o.stage_id));
  const contactedCount = contactedSet.length;
  const appointmentsCount = userOpps.filter(o => o.stage_id === STAGES.CITA).length;
  const salesCount = userOpps.filter(o => o.stage_id === STAGES.PAGO_COMPLETO).length;

  // 2. Ratios
  const contactRate = totalLeads > 0 ? (contactedCount / totalLeads) * 100 : 0;
  const saleFromContactRate = contactedCount > 0 ? (salesCount / contactedCount) * 100 : 0;
  const totalSaleRate = totalLeads > 0 ? (salesCount / totalLeads) * 100 : 0;

  // 3. Estado del Pipeline
  const closeFollowUp = userOpps.filter(o => o.stage_id === STAGES.SEGUIM_CERCANO).length;
  const longFollowUp = userOpps.filter(o => o.stage_id === STAGES.SEGUIM_LEJANO).length;
  const discardedCount = userOpps.filter(o => [STAGES.DESCARTADO, STAGES.NO_CUALIFICA].includes(o.stage_id)).length;
  const totalRevenue = userOpps.filter(o => o.stage_id === STAGES.PAGO_COMPLETO).reduce((acc, o) => acc + Number(o.value || 0), 0);

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

  // 5. Origen de la Venta (Solo para Pagos Completos)
  const wonOpps = userOpps.filter(o => o.stage_id === STAGES.PAGO_COMPLETO);
  const originStats = wonOpps.reduce((acc: any, o) => {
    const customFields = Array.isArray(o.raw?.customFields) ? o.raw.customFields : (Array.isArray(o.custom_fields) ? o.custom_fields : []);
    const originField = customFields.find((f: any) => 
      String(f.id || "") === 'dQIKOJqcDR8uYOcoZGPt' ||
      String(f.name || "").toLowerCase().includes('origen') || 
      String(f.label || "").toLowerCase().includes('origen')
    );
    
    let origin = 'Otro';
    if (originField) {
      let rawVal = originField.fieldValue || originField.fieldValueString || originField.field_value || originField.value;
      if (Array.isArray(rawVal) && rawVal.length > 0) rawVal = rawVal[0];
      const val = String(rawVal || "").toLowerCase().trim();
      
      if (val.includes('hotmart')) origin = 'Hotmart';
      else if (val.includes('transferencia')) origin = 'Transferencia';
      else if (val && val !== 'none' && val !== 'null') origin = val.charAt(0).toUpperCase() + val.slice(1);
    }

    if (!acc[origin]) acc[origin] = { count: 0, revenue: 0 };
    acc[origin].count += 1;
    acc[origin].revenue += Number(o.value || 0);
    return acc;
  }, {});

  const originData = Object.entries(originStats).map(([name, stats]: [string, any]) => ({
    name,
    count: stats.count,
    revenue: stats.revenue,
    percentage: salesCount > 0 ? (stats.count / salesCount) * 100 : 0
  })).sort((a, b) => b.revenue - a.revenue);

  // Phase breakdown for table
  const phases = [
    { name: 'Pago completo', id: STAGES.PAGO_COMPLETO, color: 'bg-emerald-500' },
    { name: 'Cita agendada', id: STAGES.CITA, color: 'bg-blue-500' },
    { name: 'Contactado (actual)', id: STAGES.CONTACTADO, color: 'bg-cyan-500' },
    { name: 'Seguim. Cercano', id: STAGES.SEGUIM_CERCANO, color: 'bg-indigo-500' },
    { name: 'Intento contacto', ids: [STAGES.INTENTO, STAGES.SLA], color: 'bg-amber-500' },
    { name: 'Seguim. Lejano', id: STAGES.SEGUIM_LEJANO, color: 'bg-slate-500' },
    { name: 'Descartado', id: STAGES.DESCARTADO, color: 'bg-rose-500' },
    { name: 'No cualifica', id: STAGES.NO_CUALIFICA, color: 'bg-pink-500' },
  ];

  const tableData = phases.map(p => {
    const count = p.ids 
      ? userOpps.filter(o => p.ids!.includes(o.stage_id)).length
      : userOpps.filter(o => o.stage_id === p.id).length;
    const percentage = totalLeads > 0 ? (count / totalLeads) * 100 : 0;
    return { ...p, count, percentage };
  });

  const MetricCard = ({ label, value, sublabel, icon: Icon, colorClass, highlightValue }: any) => (
    <div className="bg-slate-800/50 border border-slate-700/50 p-4 rounded-xl flex items-center gap-4">
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

  return (
    <div className="space-y-6 animate-in fade-in duration-500 overflow-hidden pb-12">
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
            <p className="text-xs text-slate-500 font-bold uppercase tracking-tighter mt-1 opacity-70">
              Ratios de conversión · Pipeline · Estado de leads · <span className="text-indigo-400/80">{periodLabel.toUpperCase()}</span>
            </p>
          </div>
          <div className="w-12 h-12 bg-indigo-500/20 rounded-full flex items-center justify-center border border-indigo-500/30">
            <Target className="text-indigo-400 w-6 h-6" />
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
              <MetricCard label="Leads Totales" value={totalLeads} icon={Users} colorClass="bg-amber-400" highlightValue />
              <MetricCard label="Contactados (acum)" value={contactedCount} icon={Phone} colorClass="bg-emerald-400" />
              <MetricCard label="Citas Agendadas" value={appointmentsCount} icon={Calendar} colorClass="bg-blue-400" />
              <MetricCard label="Ventas Cerradas" value={salesCount} icon={CheckCircle} colorClass="bg-rose-400" />
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
              <MetricCard label="Seguim. Cercano" value={closeFollowUp} icon={Target} colorClass="bg-emerald-500" />
              <MetricCard label="Seguim. Lejano" value={longFollowUp} icon={Users} colorClass="bg-blue-500" />
              <MetricCard label="Descartados / N.C." value={discardedCount} icon={XCircle} colorClass="bg-rose-500" />
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
              <MetricCard label="Ventas Cerradas" value={salesCount} icon={CheckCircle} colorClass="bg-emerald-500" />
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
              {originData.length > 0 ? originData.map((item, idx) => (
                <div key={idx} className="bg-slate-800/40 border border-slate-700/50 p-5 rounded-2xl relative overflow-hidden group">
                  <div className={`absolute top-0 right-0 w-24 h-24 -mr-8 -mt-8 rounded-full opacity-10 blur-2xl ${item.name === 'Hotmart' ? 'bg-orange-500' : item.name === 'Transferencia' ? 'bg-blue-500' : 'bg-slate-500'}`} />
                  <div className="relative z-10">
                    <div className="flex justify-between items-start mb-4">
                      <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest ${item.name === 'Hotmart' ? 'bg-orange-500/20 text-orange-400 border border-orange-500/30' : item.name === 'Transferencia' ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30' : 'bg-slate-500/20 text-slate-400 border border-slate-500/30'}`}>
                        {item.name}
                      </span>
                      <span className="text-xs font-black text-slate-500">{item.percentage.toFixed(0)}%</span>
                    </div>
                    <div className="space-y-1">
                      <p className="text-3xl font-black text-white">€{item.revenue.toLocaleString()}</p>
                      <p className="text-xs font-bold text-slate-500 uppercase tracking-tighter">{item.count} Ventas cerradas</p>
                    </div>
                    <div className="mt-4 w-full h-1.5 bg-slate-700/50 rounded-full overflow-hidden">
                      <div className={`h-full rounded-full ${item.name === 'Hotmart' ? 'bg-orange-500' : item.name === 'Transferencia' ? 'bg-blue-500' : 'bg-slate-500'}`} style={{ width: `${item.percentage}%` }} />
                    </div>
                  </div>
                </div>
              )) : (
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
                            <tr key={idx} className="hover:bg-slate-700/20 transition-colors">
                                <td className="px-6 py-3 text-sm font-bold text-slate-300">
                                    <div className="flex items-center gap-2">
                                        <div className={`w-2 h-2 rounded-full ${row.color}`} />
                                        {row.name}
                                    </div>
                                </td>
                                <td className="px-6 py-3 text-center text-sm font-black text-slate-300">{row.count}</td>
                                <td className="px-6 py-3 text-center text-xs font-bold text-slate-400">{row.percentage.toFixed(1)}%</td>
                                <td className="px-6 py-3 min-w-[150px]">
                                    <div className="w-full h-2 bg-slate-700/50 rounded-full overflow-hidden">
                                        <div className={`h-full ${row.color} rounded-full`} style={{ width: `${row.percentage}%` }} />
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
    </div>
  );
};
