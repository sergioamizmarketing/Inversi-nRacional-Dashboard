const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
const path = require('path');
const axios = require('axios');

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('Missing credentials');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function check() {
    const { data: conn } = await supabase.from('ghl_connections').select('*').limit(1);
    if (!conn || conn.length === 0) return console.log('No connection');
    let connection = conn[0];
    const locationId = connection.location_id;
    console.log('Location ID:', locationId);
    console.log('Token Expires At:', connection.token_expires_at);

    const expiresAt = new Date(connection.token_expires_at || connection.updated_at).getTime();
    const now = Date.now();
    const timeToExpiry = expiresAt - now;

    console.log(`Time to expiry: ${timeToExpiry / 1000 / 60} minutes`);

    if (timeToExpiry < 15 * 60 * 1000) {
        console.log('Token is expired or expiring soon, attempting refresh...');
        try {
            const encodedParams = new URLSearchParams();
            encodedParams.append('client_id', process.env.GHL_CLIENT_ID);
            encodedParams.append('client_secret', process.env.GHL_CLIENT_SECRET);
            encodedParams.append('grant_type', 'refresh_token');
            encodedParams.append('refresh_token', connection.refresh_token);

            const response = await axios.post("https://services.leadconnectorhq.com/oauth/token", encodedParams, {
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'Accept': 'application/json'
                }
            });
            console.log('SUCCESSFUL REFRESH!');
            connection.access_token = response.data.access_token;
        } catch (err) {
            console.error('REFRESH FAILED:', err.response?.data || err.message);
        }
    }

    // Now try to fetch opportunities
    console.log('\nFetching opportunities...');
    try {
        const oppRes = await axios.post("https://services.leadconnectorhq.com/opportunities/search", {
            locationId,
            status: "open",
            limit: 10,
            page: 1
        }, {
            headers: {
                Authorization: `Bearer ${connection.access_token}`,
                Version: '2021-07-28'
            }
        });

        console.log(`Success! Found ${oppRes.data.opportunities?.length} opportunities.`);
        if (oppRes.data.opportunities?.length > 0) {
            console.log("Sample Opp:", JSON.stringify(oppRes.data.opportunities[0], null, 2).substring(0, 500));
        }
    } catch (err) {
        console.error('FETCH OPPORTUNITIES FAILED:', err.response?.data || err.message);
    }

}
check();
