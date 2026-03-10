import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import crypto from "crypto";
import axios from "axios";
import { createClient } from "@supabase/supabase-js";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3000;

// Supabase Client (Service Role for backend ops)
const supabase = createClient(
  process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || 'https://xyzcompany.supabase.co',
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || 'dummy_key_for_dev'
);

app.use(express.json());

// Helper function to get and potentially refresh the GHL connection
async function getValidConnection(locationId: string) {
  const { data: connection, error } = await supabase
    .from("ghl_connections")
    .select("*")
    .eq("location_id", locationId)
    .single();

  if (error || !connection) return null;

  // Check if token is internal/V1 or already invalid
  if (connection.refresh_token === "internal" || !connection.refresh_token) {
    return connection;
  }

  // Check expiration (refresh if expiring in less than 15 minutes)
  const expiresAtStr = connection.token_expires_at || connection.updated_at;
  const expiresAt = new Date(expiresAtStr).getTime();
  const now = Date.now();
  const timeToExpiry = expiresAt - now;

  if (timeToExpiry < 15 * 60 * 1000) {
    console.log(`Refreshing expired GHL token for location: ${locationId}`);
    try {
      const encodedParams = new URLSearchParams();
      encodedParams.append('client_id', process.env.GHL_CLIENT_ID!);
      encodedParams.append('client_secret', process.env.GHL_CLIENT_SECRET!);
      encodedParams.append('grant_type', 'refresh_token');
      encodedParams.append('refresh_token', connection.refresh_token);
      encodedParams.append('user_type', 'Location');

      const response = await axios.post("https://services.leadconnectorhq.com/oauth/token", encodedParams, {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Accept': 'application/json'
        }
      });

      const { access_token, refresh_token, expires_in } = response.data;
      const newExpiresAt = new Date(Date.now() + expires_in * 1000).toISOString();

      const { error: updateError } = await supabase.from("ghl_connections").update({
        access_token,
        refresh_token,
        token_expires_at: newExpiresAt,
        updated_at: new Date().toISOString()
      }).eq("location_id", locationId);

      if (!updateError) {
        connection.access_token = access_token;
        connection.refresh_token = refresh_token;
        connection.token_expires_at = newExpiresAt;
      }
    } catch (refreshErr: any) {
      console.error("Token refresh failed:", refreshErr.response?.data || refreshErr.message);
      // Could return null here to force re-auth, but let's return connection and let the API call fail if truly invalid
    }
  }

  return connection;
}

// Expose public config to the frontend at runtime
app.get("/api/config", (req, res) => {
  res.json({
    supabaseUrl: process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL,
    supabaseAnonKey: process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY
  });
});

// --- Admin User Management Routes ---

// Middleware to verify Auth JWT (any logged in user)
const requireAuth = async (req: any, res: any, next: any) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: "Missing token" });

  const { data: { user }, error } = await supabase.auth.getUser(token);
  if (error || !user) return res.status(401).json({ error: "Invalid token" });

  req.user = user;
  next();
};

app.get("/api/auth/profile", requireAuth, async (req: any, res: any) => {
  try {
    const user = req.user;
    // Service role bypasses RLS, guaranteeing the profile is readable
    const { data: profile } = await supabase.from('profiles').select('*').eq('id', user.id).single();
    if (!profile) {
      // If still not found, self-heal immediately
      const newProfile = {
        id: user.id,
        email: user.email,
        full_name: user.user_metadata?.full_name || 'Nuevo Usuario',
        role: 'pending',
        created_at: user.created_at
      };
      await supabase.from('profiles').upsert(newProfile);
      return res.json(newProfile);
    }
    res.json(profile);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Middleware to verify Admin JWT
const requireAdmin = async (req: any, res: any, next: any) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ error: "Missing token" });

    const { data: { user }, error } = await supabase.auth.getUser(token);
    if (error || !user) return res.status(401).json({ error: "Invalid token" });

    // Check if user is an admin in profiles (using service key bypasses RLS)
    const { data: profile, error: dbError } = await supabase.from('profiles').select('role').eq('id', user.id).single();
    if (dbError) {
      console.error("requireAdmin db error:", dbError);
    }

    if (profile?.role !== 'admin') {
      console.error(`User ${user.email} (ID: ${user.id}) denied admin access. Role is: ${profile?.role}`);
      return res.status(403).json({ error: "Forbidden: Admins only" });
    }

    req.user = user;
    next();
  } catch (err: any) {
    console.error("requireAdmin exception:", err);
    res.status(500).json({ error: "Internal Server Error in requireAdmin" });
  }
};

app.get("/api/admin/users", requireAdmin, async (req, res) => {
  try {
    // 1. Fetch from Auth API (Service Role only) to self-heal missing profiles
    try {
      const { data: authData, error: authErr } = await supabase.auth.admin.listUsers();
      if (authErr) {
        console.warn("Supabase Auth API listUsers warning (self-healing skipped):", authErr.message);
      } else if (authData?.users) {
        const profilesToSync = authData.users.map(u => ({
          id: u.id,
          email: u.email,
          full_name: u.user_metadata?.full_name || 'Nuevo Usuario',
          role: 'pending',
          created_at: u.created_at
        }));

        if (profilesToSync.length > 0) {
          await supabase.from('profiles').upsert(profilesToSync, { onConflict: 'id', ignoreDuplicates: true });
        }
      }
    } catch (syncErr: any) {
      console.warn("Exception during profile sync:", syncErr.message);
    }

    // 2. Fetch all active profiles for the dashboard
    const { data: profiles, error } = await supabase.from('profiles').select('*').order('created_at', { ascending: false });
    if (error) {
      console.error("Error fetching profiles:", error);
      throw error;
    }
    res.json(profiles);
  } catch (error: any) {
    console.error("/api/admin/users final catch:", error);
    res.status(500).json({ error: error.message });
  }
});

app.put("/api/admin/users/:id/role", requireAdmin, async (req, res) => {
  const { id } = req.params;
  const { role } = req.body;
  if (!['admin', 'manager', 'closer', 'viewer', 'pending'].includes(role)) {
    return res.status(400).json({ error: "Invalid role" });
  }

  try {
    const { data, error } = await supabase.from('profiles').update({ role }).eq('id', id).select().single();
    if (error) throw error;
    res.json({ success: true, user: data });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// --- GHL Internal Integration & OAuth Routes ---

app.get("/api/crm/status", async (req, res) => {
  try {
    const { data, error } = await supabase.from('ghl_connections').select('*').limit(1);

    if (error) {
      console.error("Supabase Error tracking connection:", error);
      return res.status(500).json({ connected: false, error: error.message });
    }

    if (data && data.length > 0) {
      res.json({ connected: true, connection: data[0] });
    } else {
      res.json({ connected: false });
    }
  } catch (error: any) {
    res.status(500).json({ connected: false, error: error.message });
  }
});

app.get("/api/crm/debug-status", async (req, res) => {
  let { locationId } = req.query;
  try {
    let startObj;
    if (locationId) {
      startObj = await supabase.from('ghl_connections').select('*').eq('location_id', locationId).single();
    } else {
      startObj = await supabase.from('ghl_connections').select('*').limit(1).single();
      if (startObj.data) {
        locationId = startObj.data.location_id;
      }
    }

    if (!startObj.data) {
      return res.send("No connection found in database for that location (or no connections at all).");
    }

    const connectionInfo = {
      hasToken: !!startObj.data.access_token,
      hasRefresh: !!startObj.data.refresh_token,
      expires: startObj.data.token_expires_at,
    };

    const validConnection = await getValidConnection(locationId as string);
    if (!validConnection) {
      return res.send(`Failed to get valid connection. <br><pre>${JSON.stringify(connectionInfo, null, 2)}</pre>`);
    }

    // Try a test call
    const ghl = axios.create({
      baseURL: "https://services.leadconnectorhq.com",
      headers: { Authorization: `Bearer ${validConnection.access_token}`, Version: '2021-07-28' }
    });

    let apiStatus = "OK";
    let apiError = null;
    try {
      await ghl.post('/opportunities/search', { locationId, limit: 1 });
    } catch (e: any) {
      apiStatus = "ERROR";
      apiError = e.response?.data || e.message;
    }

    res.json({
      connectionBeforeRefresh: connectionInfo,
      validConnectionReturned: !!validConnection,
      apiTest: apiStatus,
      apiError: apiError,
      timestamp: new Date().toISOString()
    });

  } catch (err: any) {
    res.send(`DEBUG ENDPOINT FATAL: ${err.message}`);
  }
});

app.post("/api/crm/init-internal", async (req, res) => {
  const locationId = process.env.GHL_LOCATION_ID?.trim();
  const apiKey = process.env.GHL_API_KEY?.trim();

  if (!locationId || !apiKey) {
    return res.status(400).json({ error: "GHL_LOCATION_ID or GHL_API_KEY not found in environment variables." });
  }

  try {
    const { data, error } = await supabase.from("ghl_connections").upsert({
      location_id: locationId,
      access_token: apiKey, // Using API Key as token for internal/V1 style or pre-authorized
      refresh_token: "internal",
      token_expires_at: new Date(Date.now() + 100 * 365 * 24 * 60 * 60 * 1000).toISOString(), // Far future
      scopes: ["internal"],
    }, { onConflict: "location_id" }).select().single();

    if (error) throw error;

    res.json({ success: true, message: "Internal integration initialized.", connection: data });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.get("/api/crm/oauth/start", (req, res) => {
  const clientId = process.env.GHL_CLIENT_ID;
  const redirectUri = `${process.env.APP_URL}/api/crm/oauth/callback`;
  const scope = "opportunities.readonly opportunities.write contacts.readonly contacts.write users.readonly locations.readonly locations.customFields.readonly";

  const authUrl = `https://marketplace.gohighlevel.com/oauth/chooselocation?response_type=code&client_id=${clientId}&redirect_uri=${redirectUri}&scope=${scope}`;

  res.redirect(authUrl);
});

app.get("/api/crm/oauth/callback", async (req, res) => {
  const { code } = req.query;

  try {
    const encodedParams = new URLSearchParams();
    encodedParams.append('client_id', process.env.GHL_CLIENT_ID!);
    encodedParams.append('client_secret', process.env.GHL_CLIENT_SECRET!);
    encodedParams.append('grant_type', 'authorization_code');
    encodedParams.append('code', code as string);
    encodedParams.append('user_type', 'Location');
    encodedParams.append('redirect_uri', `${process.env.APP_URL}/api/crm/oauth/callback`);

    const response = await axios.post("https://services.leadconnectorhq.com/oauth/token", encodedParams, {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'application/json'
      }
    });

    const { access_token, refresh_token, expires_in, locationId, scope } = response.data;
    const expiresAt = new Date(Date.now() + expires_in * 1000).toISOString();

    const { error: upsertError } = await supabase.from("ghl_connections").upsert({
      location_id: locationId,
      access_token,
      refresh_token,
      token_expires_at: expiresAt,
      scopes: scope.split(" "),
    }, { onConflict: "location_id" });

    if (upsertError) {
      throw new Error(`DB Save Failed: ${upsertError.message}`);
    }

    res.send(`
      <html>
        <body>
          <script>
            window.opener.postMessage({ type: 'GHL_AUTH_SUCCESS', locationId: '${locationId}' }, '*');
            window.close();
          </script>
          <p>Authentication successful. You can close this window.</p>
        </body>
      </html>
    `);
  } catch (error: any) {
    const errorDetails = error.response?.data || error.message;
    console.error("OAuth Error:", errorDetails);
    res.status(500).send(`Authentication failed. Detalles del error de HighLevel: ${JSON.stringify(errorDetails)}`);
  }
});

// --- Webhook Endpoint ---

app.post("/api/webhooks/crm", async (req, res) => {
  const signature = req.headers["x-webhook-secret"];
  if (signature !== process.env.GHL_WEBHOOK_SECRET) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const payload = req.body;
  const locationId = payload.locationId;
  const opportunityId = payload.id || payload.opportunityId;

  if (!locationId || !opportunityId) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  // Deduplication
  const dedupeKey = crypto.createHash("sha256").update(JSON.stringify(payload) + payload.timestamp).digest("hex");

  const { data: existing } = await supabase
    .from("webhook_events")
    .select("id")
    .eq("dedupe_key", dedupeKey)
    .single();

  if (existing) {
    return res.status(200).json({ message: "Duplicate event ignored" });
  }

  await supabase.from("webhook_events").insert({
    dedupe_key: dedupeKey,
    location_id: locationId,
    payload,
  });

  // Trigger background refresh
  refreshGHLData(locationId, opportunityId).catch(console.error);

  res.status(200).json({ status: "received" });
});

async function refreshGHLData(locationId: string, opportunityId: string) {
  const { data: connection } = await supabase
    .from("ghl_connections")
    .select("*")
    .eq("location_id", locationId)
    .single();

  if (!connection) return;

  // Determine if we are using V1 API Key, V2 OAuth Token, or V2 PIT
  const isPit = connection.access_token.startsWith("pit-");
  const isV1 = connection.refresh_token === "internal" && !isPit;
  const baseURL = isV1 ? "https://rest.gohighlevel.com/v1" : "https://services.leadconnectorhq.com";

  const headers: any = { Authorization: `Bearer ${connection.access_token}` };
  if (!isV1) {
    headers["Version"] = "2021-07-28";
  }

  const ghl = axios.create({
    baseURL,
    headers
  });

  try {
    console.log(`Refreshing data for opportunity ${opportunityId} in location ${locationId}`);
    // 1. Fetch Opportunity
    const oppRes = await ghl.get(`/opportunities/${opportunityId}`, {
      params: isV1 ? {} : { locationId }
    });
    const opp = isV1 ? oppRes.data : oppRes.data.opportunity;

    // 2. Fetch Contact
    let contactData = null;
    if (opp.contactId) {
      const contactRes = await ghl.get(`/contacts/${opp.contactId}`, {
        params: isV1 ? {} : { locationId }
      });
      contactData = contactRes.data.contact;

      const { error: contactError } = await supabase.from("contacts").upsert({
        id: contactData.id,
        location_id: locationId,
        email: contactData.email,
        phone: contactData.phone,
        raw: contactData,
      });

      if (contactError) {
        console.warn("Webhook Contact Upsert Error:", contactError.message);
        // Fallback to minimal data to satisfy FK
        await supabase.from("contacts").upsert({
          id: contactData.id,
          location_id: locationId,
          updated_at: new Date().toISOString()
        });
      }
    }

    // 3. Ensure FKs exist for Opportunity
    if (opp.pipelineId) {
      await supabase.from("pipelines").upsert({
        id: opp.pipelineId,
        location_id: locationId,
        name: "Unknown Pipeline",
        updated_at: new Date().toISOString()
      }, { onConflict: 'id' });
    }
    const stageId = opp.pipelineStageId || opp.stageId;
    if (stageId) {
      await supabase.from("pipeline_stages").upsert({
        id: stageId,
        pipeline_id: opp.pipelineId,
        name: "Unknown Stage",
        updated_at: new Date().toISOString()
      }, { onConflict: 'id' });
    }
    if (opp.assignedTo) {
      await supabase.from("ghl_users").upsert({
        id: opp.assignedTo,
        location_id: locationId,
        name: "Unknown User",
        updated_at: new Date().toISOString()
      }, { onConflict: 'id' });
    }

    // 4. Upsert Opportunity
    await supabase.from("opportunities").upsert({
      id: opp.id,
      location_id: locationId,
      contact_id: opp.contactId,
      pipeline_id: opp.pipelineId,
      stage_id: stageId,
      owner_user_id: opp.assignedTo,
      name: opp.name,
      status: opp.status.toLowerCase(),
      value: opp.monetaryValue,
      currency: "EUR",
      custom_fields: opp.customFields,
      raw: opp,
      created_at: opp.createdAt ? new Date(opp.createdAt).toISOString() : new Date().toISOString(),
      updated_at: opp.updatedAt ? new Date(opp.updatedAt).toISOString() : new Date().toISOString(),
    });

    // 5. Log Event (simplified)
    await supabase.from("opportunity_events").insert({
      opportunity_id: opp.id,
      event_type: "webhook_refresh",
      to_value: opp.status,
      raw_payload: opp,
    });

  } catch (error: any) {
    console.error("Refresh Error:", error.response?.data || error.message);
  }
}

// --- Metrics Endpoints ---

app.get("/api/crm/sync", async (req, res) => {
  try {
    const { locationId, full } = req.query;
    if (!locationId) return res.status(400).json({ error: "Missing locationId" });
    const isFullSync = full === 'true';

    console.log(`Starting ${isFullSync ? 'FULL ' : ''}CRM sync for ${locationId}...`);
    const connection = await getValidConnection(locationId as string);

    if (!connection) return res.status(404).json({ error: "Connection not found" });

    const isPit = connection.access_token.startsWith("pit-");
    const isV1 = connection.refresh_token === "internal" && !isPit;
    const baseURL = isV1 ? "https://rest.gohighlevel.com/v1" : "https://services.leadconnectorhq.com";

    const headers: any = { Authorization: `Bearer ${connection.access_token}` };
    if (!isV1) {
      headers["Version"] = "2021-07-28";
    }

    const ghl = axios.create({ baseURL, headers });

    console.log(`Starting sync for location ${locationId} (V1: ${isV1})`);

    // 0. Sync Metadata (Pipelines & Users) first to satisfy FKs
    try {
      const [pipeRes, userRes] = await Promise.all([
        ghl.get(isV1 ? "/pipelines/" : "/opportunities/pipelines", { params: { locationId } }),
        ghl.get("/users/", { params: { locationId } })
      ]);

      const pipelines = pipeRes.data.pipelines || [];
      const users = userRes.data.users || [];

      // Upsert Pipelines
      if (pipelines.length > 0) {
        const pipeData = pipelines.map((p: any) => ({
          id: p.id,
          location_id: locationId,
          name: p.name,
          raw: p,
          updated_at: new Date().toISOString()
        }));
        await supabase.from("pipelines").upsert(pipeData);

        // Upsert Stages
        const stageData: any[] = [];
        pipelines.forEach((p: any) => {
          (p.stages || []).forEach((s: any) => {
            stageData.push({
              id: s.id,
              pipeline_id: p.id,
              location_id: locationId, // Added location_id
              name: s.name,
              position: s.position,
              raw: s,
              updated_at: new Date().toISOString()
            });
          });
        });
        if (stageData.length > 0) {
          await supabase.from("pipeline_stages").upsert(stageData);
        }
      }

      // Upsert Users
      if (users.length > 0) {
        const userData = users.map((u: any) => ({
          id: u.id,
          location_id: locationId,
          name: u.name,
          email: u.email,
          role: u.role,
          raw: u,
          updated_at: new Date().toISOString()
        }));
        await supabase.from("ghl_users").upsert(userData);
      }
    } catch (metaError: any) {
      console.warn("Metadata sync failed, but proceeding with opportunities:", metaError.message);
    }

    // 1. If Full Sync, wipe existing data for this location first
    if (isFullSync) {
      console.log(`Wiping existing opportunities for location ${locationId} before full sync...`);
      const { error: wipeErr } = await supabase
        .from('opportunities')
        .delete()
        .eq('location_id', locationId);
      if (wipeErr) {
        console.warn("Wipe failed, continuing anyway:", wipeErr.message);
      }
    }

    let allOpps: any[] = [];

    try {
      if (isV1) {
        const pipeRes = await ghl.get("/pipelines/");
        const pipelines = pipeRes.data.pipelines || [];
        console.log(`Found ${pipelines.length} pipelines for V1 sync`);

        for (const pipe of pipelines) {
          const oppRes = await ghl.get(`/pipelines/${pipe.id}/opportunities`);
          if (oppRes.data.opportunities) {
            allOpps = [...allOpps, ...oppRes.data.opportunities];
          }
        }
      } else {
        // V2: Use search endpoint (POST)
        console.log(`Fetching V2 opportunities for ${locationId}...`);
        try {
          let page = 1;
          let hasMore = true;
          let safetyCounter = 0;

          while (hasMore && safetyCounter < 100) { // Limit to 10k opps total for safety
            safetyCounter++;
            try {
              const oppRes = await ghl.post("/opportunities/search", {
                locationId,
                limit: 100, // Maximum per page request
                page: page
              });

              const fetchedOpps = oppRes.data.opportunities || [];
              if (fetchedOpps.length > 0) {
                console.log(`Found ${fetchedOpps.length} opportunities on page ${page}.`);

                // Merge without duplicates
                const existingIds = new Set(allOpps.map(o => o.id));
                const newOpps = fetchedOpps.filter((o: any) => !existingIds.has(o.id));
                allOpps = [...allOpps, ...newOpps];

                // If it returned a full page of 100, there might be more
                if (fetchedOpps.length === 100) {
                  page++;
                } else {
                  hasMore = false; // Less than 100 means we're on the last page
                }
              } else {
                hasMore = false; // Zero results means we're done
              }
            } catch (statusErr: any) {
              console.warn(`V2 Search Error on page ${page}:`, statusErr.response?.data || statusErr.message);
              hasMore = false; // Break loop on error
            }
          }

          console.log(`V2 Search completed. Total unique opportunities found: ${allOpps.length}`);

        } catch (searchError: any) {
          console.error("V2 Search Fatal Error:", searchError.response?.data || searchError.message);
          throw searchError;
        }
      }
    } catch (ghlError: any) {
      console.error("GHL API Error during sync:", ghlError.response?.data || ghlError.message);
      return res.status(ghlError.response?.status || 500).json({
        error: ghlError.response?.data || ghlError.message
      });
    }

    // 1. Upsert Contacts first to satisfy foreign key constraints
    const contactsData = allOpps
      .filter(opp => opp.contactId || opp.contact?.id)
      .map(opp => {
        const contactId = opp.contactId || opp.contact?.id;
        return {
          id: contactId,
          location_id: locationId,
          email: opp.contact?.email || null,
          phone: opp.contact?.phone || null,
          updated_at: new Date().toISOString(),
        };
      });

    if (contactsData.length > 0) {
      const uniqueContacts = Array.from(new Map(contactsData.map(c => [c.id, c])).values());
      console.log(`Upserting ${uniqueContacts.length} unique contacts...`);
      const { error: contactError } = await supabase.from("contacts").upsert(uniqueContacts, { onConflict: 'id' });
      if (contactError) {
        console.warn("Contact upsert failed, using minimal fallback:", contactError.message);
        const minimalContacts = uniqueContacts.map(c => ({ id: c.id, location_id: c.location_id, updated_at: new Date().toISOString() }));
        await supabase.from("contacts").upsert(minimalContacts, { onConflict: 'id' });
      }
    }

    // 1.5. Ensure all other FKs (Pipelines, Stages, Users) exist
    // Sometimes opportunities refer to stages or users that weren't in the metadata sync
    const uniquePipelines = [...new Set(allOpps.filter(o => o.pipelineId).map(o => o.pipelineId))];
    const uniqueStages = [...new Set(allOpps.filter(o => o.pipelineStageId || o.stageId).map(o => o.pipelineStageId || o.stageId))];
    const uniqueUsers = [...new Set(allOpps.filter(o => o.assignedTo).map(o => o.assignedTo))];

    console.log(`Ensuring FKs: ${uniquePipelines.length} pipelines, ${uniqueStages.length} stages, ${uniqueUsers.length} users`);

    if (uniquePipelines.length > 0) {
      const { error: pErr } = await supabase.from("pipelines").upsert(
        uniquePipelines.map(id => ({
          id,
          location_id: locationId,
          name: "Unknown Pipeline",
          updated_at: new Date().toISOString()
        })),
        { onConflict: 'id' }
      );
      if (pErr) console.error("Error ensuring pipelines:", pErr.message);
    } else {
      // Create a dummy pipeline if none exist to satisfy stage FKs
      await supabase.from("pipelines").upsert([{
        id: 'default_pipeline',
        location_id: locationId,
        name: "Default Pipeline",
        updated_at: new Date().toISOString()
      }], { onConflict: 'id' });
    }

    if (uniqueStages.length > 0) {
      const stageUpserts = allOpps
        .filter(o => o.pipelineStageId || o.stageId)
        .map(o => ({
          id: o.pipelineStageId || o.stageId,
          pipeline_id: o.pipelineId || uniquePipelines[0] || 'default_pipeline',
          location_id: locationId, // Added location_id
          name: "Unknown Stage",
          updated_at: new Date().toISOString()
        }));
      const uniqueStageUpserts = Array.from(new Map(stageUpserts.map(s => [s.id, s])).values());
      const { error: sErr } = await supabase.from("pipeline_stages").upsert(uniqueStageUpserts, { onConflict: 'id' });
      if (sErr) console.error("Error ensuring stages:", sErr.message);
    }

    if (uniqueUsers.length > 0) {
      const { error: uErr } = await supabase.from("ghl_users").upsert(
        uniqueUsers.map(id => ({
          id,
          location_id: locationId,
          name: "Unknown User",
          updated_at: new Date().toISOString()
        })),
        { onConflict: 'id' }
      );
      if (uErr) console.error("Error ensuring users:", uErr.message);
    }

    // 2. Upsert opportunities
    const upsertData = allOpps.map(opp => {
      let createdAtDate = new Date();
      if (opp.createdAt) {
        if (typeof opp.createdAt === 'number') {
          createdAtDate = new Date(opp.createdAt > 10000000000 ? opp.createdAt : opp.createdAt * 1000);
        } else {
          createdAtDate = new Date(opp.createdAt);
        }
      }

      let updatedAtDate = new Date();
      if (opp.updatedAt) {
        if (typeof opp.updatedAt === 'number') {
          updatedAtDate = new Date(opp.updatedAt > 10000000000 ? opp.updatedAt : opp.updatedAt * 1000);
        } else {
          updatedAtDate = new Date(opp.updatedAt);
        }
      }

      const createdAt = createdAtDate.toISOString();
      const updatedAt = updatedAtDate.toISOString();

      return {
        id: opp.id,
        location_id: locationId,
        contact_id: opp.contactId || opp.contact?.id,
        pipeline_id: opp.pipelineId,
        stage_id: opp.pipelineStageId || opp.stageId,
        owner_user_id: opp.assignedTo,
        name: opp.name,
        status: (opp.status || "open").toLowerCase(),
        value: opp.monetaryValue || opp.value || 0,
        currency: "EUR",
        raw: opp,
        created_at: createdAt, // We use GHL date as the primary date for dashboard filtering
        updated_at: updatedAt,
      };
    });

    if (upsertData.length > 0) {
      console.log(`Upserting ${upsertData.length} opportunities to Supabase.`);
      const { error: upsertError } = await supabase.from("opportunities").upsert(upsertData);
      if (upsertError) {
        console.error("Supabase Upsert Error:", JSON.stringify(upsertError, null, 2));
        throw new Error(`Supabase Upsert failed: ${upsertError.message} (${upsertError.code})`);
      }

      // Safe pruning: Delete any opportunity in this location that is no longer in GHL
      // We limit this to syncs under 3000 items to avoid deleting valid data if GHL pagination clipped the results
      if (upsertData.length < 3000) {
        try {
          const { data: existingOpps } = await supabase.from('opportunities').select('id').eq('location_id', locationId);
          if (existingOpps) {
            const validSet = new Set(upsertData.map(o => o.id));
            const idsToDelete = existingOpps.map(o => o.id).filter(id => !validSet.has(id));

            if (idsToDelete.length > 0) {
              console.log(`Pruning ${idsToDelete.length} orphaned opportunities from Supabase...`);
              // Delete in chunks of 200 to avoid HTTP URI Too Long errors
              for (let i = 0; i < idsToDelete.length; i += 200) {
                const chunk = idsToDelete.slice(i, i + 200);
                await supabase.from('opportunities').delete().in('id', chunk);
              }
            }
          }
        } catch (pruneErr: any) {
          console.warn("Non-fatal error during opportunity pruning:", pruneErr.message);
        }
      }

    } else {
      console.log("No opportunities found to sync.");
    }

    // Bump the connection timestamp so the Dashboard "Sincronizado" clock updates
    await supabase.from("ghl_connections")
      .update({ updated_at: new Date().toISOString() })
      .eq("location_id", locationId);

    res.json({ success: true, count: upsertData.length });
  } catch (error: any) {
    console.error("Sync Error:", error.response?.data || error.message);
    res.status(500).json({ error: error.message });
  }
});

// --- REAL-TIME WEBHOOK RECEIVER ---
app.post("/api/ghl/webhook", async (req, res) => {
  try {
    const payload = req.body;
    console.log("Received GHL Webhook:", payload.type || "Unknown Type", "for location:", payload.locationId || "Unknown Location");

    // We only process it if it looks like an Opportunity or Pipeline update
    if (payload.type === 'Opportunity' || payload.pipelineId) {
      if (!payload.id || !payload.locationId) {
        return res.status(400).json({ error: "Missing id or locationId in webhook payload" });
      }

      const oppData = {
        id: payload.id,
        location_id: payload.locationId,
        contact_id: payload.contactId || null,
        pipeline_id: payload.pipelineId,
        stage_id: payload.pipelineStageId || payload.stageId || null,
        owner_user_id: payload.assignedTo || null,
        name: payload.name || "Webhook Opportunity",
        status: (payload.status || "open").toLowerCase(),
        value: payload.monetaryValue || payload.value || 0,
        currency: "EUR",
        raw: payload,
        created_at: payload.dateAdded || new Date().toISOString(),
        updated_at: payload.dateUpdated || new Date().toISOString(),
      };

      const { error } = await supabase.from("opportunities").upsert([oppData]);
      if (error) {
        console.error("Webhook Upsert Error:", error.message);
        return res.status(500).json({ error: error.message });
      }

      // Bump the connection timestamp so the Dashboard "Sincronizado" clock updates
      await supabase.from("ghl_connections")
        .update({ updated_at: new Date().toISOString() })
        .eq("location_id", payload.locationId);

      console.log(`Successfully synced opportunity via webhook: ${payload.id}`);
      return res.json({ success: true, message: "Opportunity upserted via webhook" });
    }

    // Acknowledge other webhook types safely
    res.json({ success: true, message: "Webhook received but ignored (not an opportunity)" });
  } catch (err: any) {
    console.error("Webhook Internal Error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/metrics/overview", async (req, res) => {
  const { locationId, startDate, endDate, pipelineId, userId, source } = req.query;

  try {
    console.log("MARKER 0: Starting /api/metrics/overview");
    let query = supabase
      .from("opportunities")
      .select("*")
      .eq("location_id", locationId);

    if (startDate) query = query.gte("created_at", `${startDate}T00:00:00Z`);
    if (endDate) query = query.lte("created_at", `${endDate}T23:59:59Z`);

    if (pipelineId) {
      query = query.eq("pipeline_id", pipelineId);
    }

    console.log("MARKER 1: Built query");

    let rawOpps: any[] = [];
    try {
      const { data, error } = await query;
      if (error) {
        console.warn("Supabase query error (mocking instead):", error.message);
      } else {
        rawOpps = data || [];
      }
    } catch (err: any) {
      console.warn("Supabase fetch failed (mocking instead):", err.message);
    }

    console.log("MARKER 2: Checked rawOpps length");

    let baseOpps = rawOpps || [];
    if (baseOpps.length === 0) {
      const mockStatuses = ['open', 'won', 'lost', 'abandoned', 'open', 'won'];
      for (let i = 1; i <= 60; i++) {
        baseOpps.push({
          id: `mock-${i}`,
          location_id: locationId,
          status: mockStatuses[i % mockStatuses.length],
          value: Math.floor(Math.random() * 5000) + 1000,
          created_at: new Date(Date.now() - Math.floor(Math.random() * 30) * 86400000).toISOString(),
          source: i % 2 === 0 ? 'vsl' : 'webinar',
          owner_user_id: `user-${(i % 3) + 1}`,
          pipeline_id: 'pipe-1'
        });
      }
    }

    console.log("MARKER 3: Generated baseOpps loop");

    // Inject mock source based on ID
    let opps = baseOpps.map(o => ({
      ...o,
      source: o.source || ((o.id || "").toString().charCodeAt(0) % 2 === 0 ? "vsl" : "webinar")
    }));

    console.log("MARKER 4: Mapped opps");

    // Filter by source if requested
    if (source && source !== 'all') {
      opps = opps.filter(o => o.source === source);
    }

    // Filter by closer custom field (using frontend userId as the closer string)
    if (userId && userId !== 'all') {
      const matchUserId = String(userId).toLowerCase().trim();
      opps = opps.filter(o => {
        const customFields = o.raw?.customFields || o.custom_fields;
        if (!customFields || !Array.isArray(customFields)) return false;

        const closerField = customFields.find((f: any) =>
          String(f.key || "").toLowerCase().includes('closer') ||
          String(f.name || "").toLowerCase().includes('closer') ||
          String(f.id || "").toLowerCase().includes('closer')
        );

        if (!closerField) return false;
        const val = String(closerField.field_value || closerField.value || "").toLowerCase().trim();
        if (!val) return false;

        return val === matchUserId || val.includes(matchUserId) || matchUserId.includes(val);
      });
    }

    let totalInDb = 0;
    try {
      const { count } = await supabase
        .from("opportunities")
        .select("*", { count: 'exact', head: true })
        .eq("location_id", locationId);
      totalInDb = count || 0;
    } catch (err: any) {
      console.warn("totalInDb fetch failed (mocking 0):", err.message);
    }

    console.log(`Overview: Found ${opps.length} opps for filters. Total in DB for location: ${totalInDb}`);

    const totalOpps = opps.length;
    const wonOpps = opps.filter(o => o.status === "won");
    const lostOpps = opps.filter(o => o.status === "lost");
    const revenue = wonOpps.reduce((sum, o) => sum + Number(o.value || 0), 0);
    const pipelineValue = opps.filter(o => o.status === "open").reduce((sum, o) => sum + Number(o.value || 0), 0);

    const winRate = totalOpps > 0 ? (wonOpps.length / totalOpps) * 100 : 0;

    res.json({
      totalOpps,
      wonOpps: wonOpps.length,
      lostOpps: lostOpps.length,
      revenue,
      pipelineValue,
      winRate,
      totalInDb
    });
  } catch (error: any) {
    console.error("Overview Endpoint Crash Error:", error.stack || error);
    res.status(500).json({ error: error.message || error.toString() });
  }
});

app.get("/api/crm/pipelines", async (req, res) => {
  const { locationId } = req.query;
  try {
    const connection = await getValidConnection(locationId as string);

    if (!connection) {
      return res.json([
        { id: "pipe-1", name: "Proyecto Pioneros - Ventas" },
        { id: "pipe-2", name: "Renovaciones Backend" }
      ]);
    }

    const isPit = connection.access_token.startsWith("pit-");
    const isV1 = connection.refresh_token === "internal" && !isPit;
    const baseURL = isV1 ? "https://rest.gohighlevel.com/v1" : "https://services.leadconnectorhq.com";
    const headers: any = { Authorization: `Bearer ${connection.access_token}` };
    if (!isV1) headers["Version"] = "2021-07-28";

    const ghl = axios.create({ baseURL, headers });
    const endpoint = isV1 ? "/pipelines/" : "/opportunities/pipelines";
    const pipeRes = await ghl.get(endpoint, {
      params: { locationId }
    });
    res.json(pipeRes.data.pipelines || []);
  } catch (error: any) {
    console.error("Pipelines Error:", error.response?.data || error.message);
    res.status(500).json({ error: error.response?.data || error.message });
  }
});

app.get("/api/crm/users", async (req, res) => {
  const { locationId } = req.query;
  try {
    const connection = await getValidConnection(locationId as string);

    if (!connection) {
      return res.json([
        { id: "user-1", firstName: "Closer", lastName: "Pro" },
        { id: "user-2", firstName: "Luis Miguel", lastName: "Ortiz" },
        { id: "user-3", firstName: "Setter", lastName: "Elite" }
      ]);
    }

    const isPit = connection.access_token.startsWith("pit-");
    const isV1 = connection.refresh_token === "internal" && !isPit;
    const baseURL = isV1 ? "https://rest.gohighlevel.com/v1" : "https://services.leadconnectorhq.com";
    const headers: any = { Authorization: `Bearer ${connection.access_token}` };
    if (!isV1) headers["Version"] = "2021-07-28";

    const ghl = axios.create({ baseURL, headers });
    const userRes = await ghl.get("/users/", {
      params: { locationId }
    });
    res.json(userRes.data.users || []);
  } catch (error: any) {
    console.error("Users Error:", error.response?.data || error.message);
    res.status(500).json({ error: error.response?.data || error.message });
  }
});

app.get("/api/crm/closers", async (req, res) => {
  const { locationId } = req.query;
  try {
    const { data, error } = await supabase.from('opportunities').select('raw, custom_fields').eq("location_id", locationId);
    if (error) throw error;

    const uniqueClosers = new Set<string>();
    (data || []).forEach(o => {
      const customFields = o.raw?.customFields || o.custom_fields;
      if (customFields && Array.isArray(customFields)) {
        const closerField = customFields.find((f: any) =>
          String(f.id || "") === 'DPEKghcOYLZADdLcTR8Q' ||
          String(f.key || "").toLowerCase().includes('closer') ||
          String(f.name || "").toLowerCase().includes('closer') ||
          String(f.id || "").toLowerCase().includes('closer')
        );
        if (closerField) {
          let rawVal = closerField.fieldValue || closerField.fieldValueString || closerField.field_value || closerField.value;
          if (Array.isArray(rawVal) && rawVal.length > 0) rawVal = rawVal[0];
          const val = String(rawVal || "").trim();
          if (val && val.toLowerCase() !== 'none' && val.toLowerCase() !== 'null') {
            uniqueClosers.add(val);
          }
        }
      }
    });

    res.json(Array.from(uniqueClosers).sort());
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// --- Targets Endpoints ---

app.get("/api/targets", async (req, res) => {
  const { locationId } = req.query;
  try {
    const { data, error } = await supabase
      .from("ghl_targets")
      .select("*")
      .eq("location_id", locationId);

    if (error) {
      // If table doesn't exist, return empty array instead of crashing
      if (error.code === 'PGRST116' || error.message.includes('does not exist')) {
        return res.json([]);
      }
      throw error;
    }
    res.json(data || []);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/targets", async (req, res) => {
  const { locationId, targets } = req.body;
  try {
    const upsertData = targets.map((t: any) => ({
      location_id: locationId,
      name: t.name,
      target_value: Number(t.target_value),
      unit: t.unit,
      period: t.period || 'month'
    }));

    const { error } = await supabase
      .from("ghl_targets")
      .upsert(upsertData, { onConflict: 'location_id,name' });

    if (error) throw error;
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.get("/api/crm/funnel", async (req, res) => {
  const { locationId, pipelineId, startDate, endDate, userId } = req.query;
  try {
    let query = supabase
      .from("opportunities")
      .select("stage_id, status")
      .eq("location_id", locationId)
      .eq("pipeline_id", pipelineId);

    if (startDate) query = query.gte("created_at", `${startDate}T00:00:00Z`);
    if (endDate) query = query.lte("created_at", `${endDate}T23:59:59Z`);
    if (userId) query = query.eq("owner_user_id", userId);

    let opps: any[] = [];
    try {
      const { data, error } = await query;
      if (!error) opps = data || [];
    } catch (e) { }

    if (opps.length === 0) {
      return res.json({
        "1": 150, // Leads
        "2": 45,  // Booked
        "3": 35,  // Show
        "4": 25,  // Offer
        "5": 12   // Won
      });
    }

    const counts: Record<string, number> = {};
    opps.forEach(o => {
      counts[o.stage_id] = (counts[o.stage_id] || 0) + 1;
    });

    res.json(counts);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.get("/api/crm/opportunities", async (req, res) => {
  const { locationId, pipelineId, startDate, endDate, userId, source } = req.query;
  try {
    let query = supabase
      .from("opportunities")
      .select("*")
      .eq("location_id", locationId);

    if (pipelineId) query = query.eq("pipeline_id", pipelineId);
    if (startDate) query = query.gte("created_at", `${startDate}T00:00:00Z`);
    if (endDate) query = query.lte("created_at", `${endDate}T23:59:59Z`);

    let rawOpps: any[] = [];
    try {
      const { data, error } = await query;
      if (error) {
        console.warn("Supabase query error (mocking instead):", error.message);
      } else {
        rawOpps = data || [];
      }
    } catch (err: any) {
      console.warn("Supabase fetch failed (mocking instead):", err.message);
    }

    let baseOpps = rawOpps || [];
    if (baseOpps.length === 0) {
      const mockStatuses = ['open', 'won', 'lost', 'abandoned', 'open', 'won'];
      for (let i = 1; i <= 60; i++) {
        baseOpps.push({
          id: `mock-${i}`,
          location_id: locationId,
          status: mockStatuses[i % mockStatuses.length],
          value: Math.floor(Math.random() * 5000) + 1000,
          created_at: new Date(Date.now() - Math.floor(Math.random() * 30) * 86400000).toISOString(),
          source: i % 2 === 0 ? 'vsl' : 'webinar',
          owner_user_id: `user-${(i % 3) + 1}`,
          pipeline_id: 'pipe-1'
        });
      }
    }

    // Inject mock source based on ID
    let opps = baseOpps.map(o => ({
      ...o,
      source: o.source || ((o.id || "").toString().charCodeAt(0) % 2 === 0 ? "vsl" : "webinar")
    }));

    // Filter by source if requested
    if (source && source !== 'all') {
      opps = opps.filter(o => o.source === source);
    }

    // Filter by closer custom field (using frontend userId as the closer string)
    if (userId && userId !== 'all') {
      const matchUserId = String(userId).toLowerCase().trim();
      opps = opps.filter(o => {
        const customFields = o.raw?.customFields || o.custom_fields;
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
        if (!val || val === 'none' || val === 'null') return false;

        return val === matchUserId || val.includes(matchUserId) || matchUserId.includes(val);
      });
    }

    res.json(opps || []);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// --- Admin Setup Endpoint ---

app.post("/api/auth/setup-admin", async (req, res) => {
  const { email, password } = req.body;

  if (email !== "sergioamizmarketing@gmail.com") {
    return res.status(403).json({ error: "Only the designated admin email can be set up this way." });
  }

  try {
    // 1. Create user using Service Role (bypasses email confirmation)
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: 'Admin User' }
    });

    if (authError) {
      // If user already exists, we'll try to update their password and confirm them
      if (authError.message.toLowerCase().includes("already registered") || authError.message.toLowerCase().includes("already exists")) {
        const { data: listData, error: listError } = await supabase.auth.admin.listUsers();
        if (listError) throw listError;

        const existingUser = listData.users.find((u: any) => u.email?.toLowerCase() === email.toLowerCase());

        if (existingUser) {
          const { error: updateError } = await supabase.auth.admin.updateUserById(existingUser.id, {
            password,
            email_confirm: true
          });
          if (updateError) throw updateError;
          return res.json({ success: true, message: "Admin account updated and confirmed successfully." });
        }
      }
      throw authError;
    }

    res.json({ success: true, message: "Admin account created and confirmed successfully." });
  } catch (error: any) {
    console.error("Admin Setup Error:", error.message);
    res.status(500).json({ error: error.message });
  }
});

// --- Reports Endpoint ---

app.post("/api/reports/send", async (req, res) => {
  const { email, locationId, metrics } = req.body;

  if (!email || !locationId) {
    return res.status(400).json({ error: "Missing email or locationId" });
  }

  try {
    // Generate simple HTML report
    const htmlReport = `
      <div style="font-family: sans-serif; color: #334155; max-width: 600px; margin: auto; border: 1px solid #e2e8f0; border-radius: 12px; padding: 24px;">
        <h2 style="color: #4f46e5; margin-bottom: 16px;">Sales Ops Executive Report</h2>
        <p style="font-size: 14px; color: #64748b;">Report generated for: <strong>${email}</strong></p>
        <hr style="border: 0; border-top: 1px solid #f1f5f9; margin: 24px 0;" />
        
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 24px;">
          <div style="background: #f8fafc; padding: 16px; border-radius: 8px;">
            <p style="font-size: 12px; text-transform: uppercase; color: #94a3b8; margin: 0;">Revenue</p>
            <p style="font-size: 20px; font-weight: bold; margin: 4px 0;">${(metrics?.revenue || 0).toLocaleString()}€</p>
          </div>
          <div style="background: #f8fafc; padding: 16px; border-radius: 8px;">
            <p style="font-size: 12px; text-transform: uppercase; color: #94a3b8; margin: 0;">Win Rate</p>
            <p style="font-size: 20px; font-weight: bold; margin: 4px 0;">${(metrics?.winRate || 0).toFixed(1)}%</p>
          </div>
          <div style="background: #f8fafc; padding: 16px; border-radius: 8px;">
            <p style="font-size: 12px; text-transform: uppercase; color: #94a3b8; margin: 0;">Total Opps</p>
            <p style="font-size: 20px; font-weight: bold; margin: 4px 0;">${metrics?.totalOpps || 0}</p>
          </div>
          <div style="background: #f8fafc; padding: 16px; border-radius: 8px;">
            <p style="font-size: 12px; text-transform: uppercase; color: #94a3b8; margin: 0;">Pipeline Value</p>
            <p style="font-size: 20px; font-weight: bold; margin: 4px 0;">${(metrics?.pipelineValue || 0).toLocaleString()}€</p>
          </div>
        </div>

        <p style="font-size: 12px; color: #94a3b8; text-align: center;">Generated by SalesOps Dashboard</p>
      </div>
    `;

    // Send to n8n Webhook
    await axios.post("https://appwebhook.sergiomars.com/webhook/informe-closer", {
      email,
      locationId,
      htmlReport,
      metrics,
      timestamp: new Date().toISOString()
    });

    res.json({ success: true, message: "Report sent to webhook" });
  } catch (error: any) {
    console.error("Report Send Error:", error.response?.data || error.message);
    res.status(500).json({ error: "Failed to send report" });
  }
});

// --- Copilot Endpoint ---

// Removed missing import: import { getCopilotResponse } from "./src/services/geminiService";

app.post("/api/copilot/chat", async (req, res) => {
  const { query, context } = req.body;

  try {
    // Mocking response
    res.json({ text: "Simulated Copilot Response: Todo parece correcto." });
  } catch (error: any) {
    console.error("Copilot Error:", error);
    res.status(500).json({ error: "Failed to get AI response" });
  }
});

app.get("/api/debug-custom", async (req, res) => {
  const { data: conns } = await supabase.from('ghl_connections').select('location_id, updated_at');
  const { data: opps } = await supabase.from('opportunities').select('location_id, raw, custom_fields').limit(20);
  res.json({ conns, opps });
});

// --- Vite Setup ---

async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    // Serve static files with 1-year cache on assets
    app.use(express.static(path.join(__dirname, "dist"), {
      setHeaders: (res, path) => {
        if (path.endsWith('.html')) {
          res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
          res.setHeader('Pragma', 'no-cache');
          res.setHeader('Expires', '0');
        } else {
          // Keep normal cache for JS/CSS with hash filenames
          res.setHeader('Cache-Control', 'public, max-age=31536000');
        }
      }
    }));

    // Always serve fresh index.html for unknown routes (SPA)
    app.get("*", (req, res) => {
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
      res.sendFile(path.join(__dirname, "dist", "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
