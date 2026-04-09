/**
 * export-opportunities.ts
 * Exporta oportunidades del pipeline "Evergreen Web" a CSV.
 * Uso: npx tsx export-opportunities.ts
 */

import { createClient } from '@supabase/supabase-js';
import { writeFileSync } from 'fs';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY!
);

function extractOrigin(o: any): string {
  const rawCFs = o.custom_fields || o.raw?.customFields;
  let val = '';

  if (Array.isArray(rawCFs)) {
    const field = rawCFs.find((f: any) => {
      const id = String(f.id || f.fieldId || '').toLowerCase();
      const label = String(f.name || f.label || '').toLowerCase();
      return id === 'dqikojqcdr8uyocozgpt' || label.includes('origen') || label.includes('fuente') || label.includes('procedencia');
    });

    if (field) {
      let rv = field.fieldValue || field.value || field.fieldValueString;
      if (typeof rv === 'string' && rv.startsWith('[') && rv.endsWith(']')) {
        try { const p = JSON.parse(rv); if (Array.isArray(p)) rv = p; } catch {}
      }
      if (Array.isArray(rv) && rv.length > 0) rv = rv[0];
      val = String(rv || '').toLowerCase().trim();
    }

    if (!val || ['none', 'null', 'undefined', 'otro'].includes(val)) {
      const kw = rawCFs.find((f: any) => {
        const v = String(f.fieldValue || f.value || f.fieldValueString || '').toLowerCase();
        return v.includes('hotmart') || v.includes('transferencia');
      });
      if (kw) {
        let rv = kw.fieldValue || kw.value || kw.fieldValueString;
        if (Array.isArray(rv) && rv.length > 0) rv = rv[0];
        val = String(rv || '').toLowerCase().trim();
      }
    }
  } else if (rawCFs && typeof rawCFs === 'object') {
    const key = Object.keys(rawCFs).find(k =>
      k === 'dQIKOJqcDR8uYOcoZGPt' || k.toLowerCase().includes('origen') || k.toLowerCase().includes('fuente')
    );
    if (key) val = String((rawCFs as any)[key] || '').toLowerCase().trim();
  }

  let origin = 'Otro';
  if (val && !['none', 'null', 'undefined', 'otro'].includes(val)) {
    if (val.includes('hotmart')) origin = 'Hotmart';
    else if (val.includes('transferencia')) origin = 'Transferencia';
    else origin = val.charAt(0).toUpperCase() + val.slice(1);
  }

  // Último recurso: buscar en el raw completo
  if (origin === 'Otro' && o.raw) {
    const rawStr = JSON.stringify(o.raw).toLowerCase();
    if (rawStr.includes('hotmart')) origin = 'Hotmart';
    else if (rawStr.includes('transferencia')) origin = 'Transferencia';
  }

  return origin;
}

function extractEmail(o: any): string {
  // Busca email en múltiples ubicaciones posibles del objeto
  return o.contact?.email
    || o.raw?.contact?.email
    || o.email
    || o.raw?.email
    || '';
}

async function main() {
  console.log('Buscando pipeline "Evergreen Web"...');

  // 1. Obtener el pipeline por nombre
  const { data: pipelines, error: pipeErr } = await supabase
    .from('pipelines')
    .select('id, name')
    .ilike('name', '%evergreen%');

  if (pipeErr) { console.error('Error al buscar pipelines:', pipeErr.message); process.exit(1); }
  if (!pipelines || pipelines.length === 0) { console.error('No se encontró ningún pipeline con "evergreen" en el nombre.'); process.exit(1); }

  console.log('Pipelines encontrados:');
  pipelines.forEach(p => console.log(` - [${p.id}] ${p.name}`));

  // Usa el primero que contenga "web" o el primero disponible
  const pipeline = pipelines.find(p => p.name.toLowerCase().includes('web')) || pipelines[0];
  console.log(`\nUsando pipeline: "${pipeline.name}" (${pipeline.id})\n`);

  // 2. Obtener oportunidades de ese pipeline
  const { data: opportunities, error: oppErr } = await supabase
    .from('opportunities')
    .select('*')
    .eq('pipeline_id', pipeline.id);

  if (oppErr) { console.error('Error al obtener oportunidades:', oppErr.message); process.exit(1); }
  if (!opportunities || opportunities.length === 0) { console.error('No se encontraron oportunidades para ese pipeline.'); process.exit(1); }

  console.log(`Total oportunidades encontradas: ${opportunities.length}`);

  // 3. Construir filas CSV
  const rows = opportunities.map(o => {
    const email = extractEmail(o);
    const origen = extractOrigin(o);
    return { id: o.id, email, origen };
  });

  // 4. Escribir CSV con BOM para que Excel lo abra con tildes correctamente
  const BOM = '\uFEFF';
  const header = 'ID Oportunidad,Email Contacto,Origen de Venta\n';
  const body = rows
    .map(r => `"${r.id}","${r.email}","${r.origen}"`)
    .join('\n');

  const filename = `evergreen-web-oportunidades-${new Date().toISOString().split('T')[0]}.csv`;
  writeFileSync(filename, BOM + header + body, 'utf8');

  console.log(`\n✓ Exportado: ${filename}`);
  console.log(`  Filas: ${rows.length}`);

  // Resumen de orígenes
  const originCount: Record<string, number> = {};
  rows.forEach(r => { originCount[r.origen] = (originCount[r.origen] || 0) + 1; });
  console.log('\nResumen por origen:');
  Object.entries(originCount).sort((a, b) => b[1] - a[1]).forEach(([k, v]) => console.log(`  ${k}: ${v}`));

  // Aviso si hay emails vacíos
  const sinEmail = rows.filter(r => !r.email).length;
  if (sinEmail > 0) console.log(`\n⚠ ${sinEmail} oportunidades sin email registrado.`);
}

main().catch(err => { console.error('Error fatal:', err); process.exit(1); });
