import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('Missing credentials');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function debugMismatches() {
    console.log('Checking for Pipeline/Opportunity ID mismatches...');

    const { data: pipes } = await supabase.from('pipelines').select('id, name');
    const { data: opps } = await supabase.from('opportunities').select('id, name, pipeline_id, stage_id').limit(10);

    console.log('\n--- PIPELINES IN DB ---');
    console.table(pipes);

    console.log('\n--- SAMPLE OPPORTUNITIES IN DB ---');
    console.table(opps);

    if (pipes && opps) {
        const pipeIds = new Set(pipes.map(p => p.id));
        const mismatched = opps.filter(o => !pipeIds.has(o.pipeline_id));
        console.log(`\nFound ${mismatched.length} / ${opps.length} sample opportunities with mismatched pipeline_id`);
        if (mismatched.length > 0) {
            console.log('Sample mismatch (Opp Pipeline ID):', mismatched[0].pipeline_id);
        }
    }
}

debugMismatches();
