import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import crypto from "crypto";
import axios from "axios";
import { createClient } from "@supabase/supabase-js";
import OpenAI from "openai";

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

// --- In-App Sync Diagnostics ---
let syncLogs: string[] = ["Servicio de diagnóstico iniciado..."];
const logToSync = (msg: string) => {
  const timestamp = new Date().toLocaleTimeString();
  syncLogs.unshift(`[${timestamp}] ${msg}`);
  if (syncLogs.length > 50) syncLogs.pop();
};

app.get("/api/debug/sync-logs", (req, res) => {
  res.json({ logs: syncLogs });
});

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

// Helper to fetch the latest note for a contact from GHL V1 or V2
async function fetchLatestNote(locationId: string, accessToken: string, contactId: string, isV1: boolean, baseURL: string) {
  if (!contactId) return null;
  try {
    const url = isV1 
      ? `${baseURL}/contacts/${contactId}/notes` 
      : `${baseURL}/contacts/${contactId}/notes`;
    
    logToSync(`Buscando notas en GHL: Contacto ${contactId}`);
    
    const headers: any = {
      'Authorization': `Bearer ${accessToken}`,
      'Accept': 'application/json'
    };

    if (!isV1) {
      headers['Version'] = '2021-07-28';
    }

    const response = await axios.get(url, { headers, timeout: 5000 });

    const notes = response.data.notes || [];
    if (notes.length > 0) {
      logToSync(`✅ Notas encontradas (${notes.length}) para ${contactId}.`);
      // Prioritize bodyText (clean text) over body (HTML)
      return notes[0].bodyText || notes[0].body || null;
    }
    logToSync(`ℹ️ No se encontraron notas para ${contactId}.`);
    return null;
  } catch (err: any) {
    if (err.response?.status !== 404) {
      const errorMsg = err.response?.data?.message || err.message;
      logToSync(`❌ ERROR GHL para ${contactId}: ${errorMsg}`);
      console.warn(`[Notes Sync] Failed for contact ${contactId}:`, err.response?.data || err.message);
    }
    return null;
  }
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
    const { data: profile, error } = await supabase
      .from('profiles')
      .select('role, full_name')
      .eq('id', user.id)
      .single();

    if (error || !profile) {
      // Auto-crear perfil con rol pending si no existe aún
      await supabase.from('profiles').upsert({
        id: user.id,
        email: user.email,
        full_name: user.user_metadata?.full_name || 'Nuevo Usuario',
        role: 'pending',
        created_at: new Date().toISOString()
      }, { onConflict: 'id', ignoreDuplicates: true });
      return res.json({ id: user.id, email: user.email, role: 'pending', full_name: user.user_metadata?.full_name });
    }

    res.json({ id: user.id, email: user.email, role: profile.role, full_name: profile.full_name || user.user_metadata?.full_name });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

const requireAdmin = async (req: any, res: any, next: any) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: "Missing token" });

  const { data: { user }, error } = await supabase.auth.getUser(token);
  if (error || !user) return res.status(401).json({ error: "Invalid token" });

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  if (profile?.role !== 'admin') {
    return res.status(403).json({ error: "Acceso denegado: se requiere rol de administrador" });
  }

  req.user = user;
  next();
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

app.delete("/api/admin/users/:id", requireAdmin, async (req, res) => {
  const { id } = req.params;
  try {
    // 1. Delete from Supabase Auth (Service Role)
    const { error: authError } = await supabase.auth.admin.deleteUser(id);
    if (authError) throw authError;

    // 2. Delete from Profiles table
    const { error: dbError } = await supabase.from('profiles').delete().eq('id', id);
    if (dbError) throw dbError;

    res.json({ success: true, message: "Usuario eliminado correctamente" });
  } catch (error: any) {
    console.error("Error deleting user:", error.message);
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/admin/users/:id/reset-password", requireAdmin, async (req, res) => {
  const { id } = req.params;
  try {
    // 1. Get user email
    const { data: profile, error: getError } = await supabase.from('profiles').select('email').eq('id', id).single();
    if (getError || !profile) throw new Error("Usuario no encontrado");

    // 2. Trigger password reset email from Supabase
    // Note: resetPasswordForEmail sends the email automatically
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(profile.email, {
      redirectTo: `${process.env.APP_URL || 'http://localhost:3000'}/reset-password`
    });
    
    if (resetError) throw resetError;

    res.json({ success: true, message: "Correo de restablecimiento enviado" });
  } catch (error: any) {
    console.error("Error resetting password:", error.message);
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

// --- New GHL Native Webhook Endpoint ---
app.post("/api/ghl/webhook", async (req, res) => {
  const payload = req.body;
  const locationId = payload.locationId || payload.location_id;
  // GHL webhooks for opportunities usually send 'id' for the opportunity ID
  const opportunityId = payload.id || payload.opportunityId || payload.opportunity_id;

  console.log(`[Webhook] Received GHL event: ${payload.type || 'unknown'} for loc ${locationId}`);

  if (!locationId || !opportunityId) {
    return res.status(200).json({ status: "ignored", message: "Missing locationId or opportunityId" });
  }

  // Deduplication to avoid double processing
  const dedupeKey = crypto.createHash("sha256").update(JSON.stringify(payload) + (payload.timestamp || Date.now())).digest("hex");
  const { data: existing } = await supabase.from("webhook_events").select("id").eq("dedupe_key", dedupeKey).single();
  
  if (existing) return res.status(200).json({ status: "duplicate" });

  await supabase.from("webhook_events").insert({ dedupe_key: dedupeKey, location_id: locationId, payload });

  // Refresh in background
  refreshGHLData(locationId, opportunityId).catch(err => console.error("[Webhook Refresh Error]:", err.message));

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

app.get("/api/crm/sync", requireAdmin, async (req: any, res: any) => {
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

    // Full sync wipe happens AFTER fetching data (safety guard below)

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
        // V2: Fetch and sync all statuses (open, won, lost, abandoned)
        const statuses = ['open', 'won', 'lost', 'abandoned'];
        for (const status of statuses) {
          console.log(`Syncing ${status} opportunities for ${locationId}...`);
          let page = 1;
          let hasMore = true;
          let safetyCounter = 0;

          while (hasMore && safetyCounter < 100) {
            safetyCounter++;
            try {
              const oppRes = await ghl.post("/opportunities/search", {
                locationId,
                status, // Iterate through all statuses
                limit: 100,
                page: page
              });

              const fetchedOpps = oppRes.data.opportunities || [];
              if (fetchedOpps.length > 0) {
                console.log(`Found ${fetchedOpps.length} ${status} opportunities on page ${page}.`);

                const existingIds = new Set(allOpps.map(o => o.id));
                const newOpps = fetchedOpps.filter((o: any) => !existingIds.has(o.id));
                allOpps = [...allOpps, ...newOpps];

                if (fetchedOpps.length === 100) {
                  page++;
                } else {
                  hasMore = false;
                }
              } else {
                hasMore = false;
              }
            } catch (err: any) {
              const detail = err.response?.data || err.message;
              console.error(`Page ${page} failed for status=${status}:`, detail);
              throw new Error(`GHL API error (${status} p.${page}): ${JSON.stringify(detail)}`);
            }
          }
        }
        console.log(`V2 Search completed. Total unique opportunities found: ${allOpps.length}`);
      }
    } catch (ghlError: any) {
      const detail = ghlError.response?.data || ghlError.message;
      console.error("GHL API Error during sync:", detail);
      return res.status(ghlError.response?.status || 500).json({ error: detail });
    }

    // Safety guard: never wipe the DB if GHL returned 0 results
    if (allOpps.length === 0) {
      return res.status(422).json({ error: "GHL devolvió 0 oportunidades — sync abortado para proteger los datos existentes. Revisa los logs del servidor." });
    }

    // Now safe to wipe for full sync
    if (isFullSync) {
      console.log(`Wiping existing opportunities for location ${locationId} before full sync...`);
      const { error: wipeErr } = await supabase.from('opportunities').delete().eq('location_id', locationId);
      if (wipeErr) console.warn("Wipe failed, continuing anyway:", wipeErr.message);
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

    // 2. Fetch latest notes for opportunities to show closer status
    // We do this in small batches to avoid hitting rate limits
    logToSync(`Sincronizando notas de ${allOpps.length} oportunidades...`);
    // 'connection' is already defined at line 622 in this scope
    if (!connection) {
      logToSync(`❌ Error: Conexión no encontrada.`);
      throw new Error("Connection not found for notes sync");
    }

    const batchSize = 2;
    let notesCount = 0;
    for (let i = 0; i < allOpps.length; i += batchSize) {
      const batch = allOpps.slice(i, i + batchSize);
      await Promise.all(batch.map(async (opp) => {
        const contactId = opp.contactId || opp.contact?.id;
        if (contactId) {
          const note = await fetchLatestNote(locationId as string, connection.access_token, contactId, isV1, baseURL);
          if (note) {
            opp.lastNote = note;
            notesCount++;
          }
        }
      }));
      // Slower delay for GHL Note sub-resource rate limit
      if (allOpps.length > batchSize) await new Promise(resolve => setTimeout(resolve, 500));
    }
    logToSync(`✅ Sincronización de notas terminada: ${notesCount} notas aplicadas.`);

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
        custom_fields: opp.customFields || opp.custom_fields || {},
        raw: { ...opp, lastNoteSynced: opp.lastNote || null },
        created_at: createdAt,
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


app.get("/api/metrics/overview", requireAuth, async (req: any, res: any) => {
  const { locationId, startDate, endDate, pipelineId, userId, source } = req.query;

  try {
    let query = supabase
      .from("opportunities")
      .select("*")
      .eq("location_id", locationId);

    if (startDate) query = query.gte("created_at", `${startDate}T00:00:00Z`);
    if (endDate) query = query.lte("created_at", `${endDate}T23:59:59Z`);

    if (pipelineId) {
      query = query.eq("pipeline_id", pipelineId);
    }


    let rawOpps: any[] = [];
    try {
      const { data, error } = await query;
      if (error) {
        console.error("Supabase query error:", error.message);
        return res.status(503).json({ error: 'DB_ERROR', message: 'Error al consultar los datos. Verifica la sincronización con GoHighLevel.' });
      }
      rawOpps = data || [];
    } catch (err: any) {
      console.error("Supabase fetch failed:", err.message);
      return res.status(503).json({ error: 'DB_ERROR', message: 'Error al conectar con la base de datos.' });
    }


    let baseOpps = rawOpps;


    let opps = baseOpps;


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

    // Previous period comparison (same duration, shifted back)
    let prevRevenue = 0, prevTotalOpps = 0, prevWinRate = 0;
    if (startDate && endDate) {
      const start = new Date(`${startDate}T00:00:00Z`);
      const end = new Date(`${endDate}T23:59:59Z`);
      const durationMs = end.getTime() - start.getTime();
      const prevEnd = new Date(start.getTime() - 1);
      const prevStart = new Date(prevEnd.getTime() - durationMs);

      try {
        let prevQuery = supabase
          .from("opportunities")
          .select("status, value")
          .eq("location_id", locationId)
          .gte("created_at", prevStart.toISOString())
          .lte("created_at", prevEnd.toISOString());
        if (pipelineId) prevQuery = prevQuery.eq("pipeline_id", pipelineId as string);

        const { data: prevData } = await prevQuery;
        if (prevData && prevData.length > 0) {
          const prevWon = prevData.filter((o: any) => o.status === "won");
          prevRevenue = prevWon.reduce((sum: number, o: any) => sum + Number(o.value || 0), 0);
          prevTotalOpps = prevData.length;
          prevWinRate = prevTotalOpps > 0 ? (prevWon.length / prevTotalOpps) * 100 : 0;
        }
      } catch (e) { /* previous period data is optional */ }
    }

    res.json({
      totalOpps,
      wonOpps: wonOpps.length,
      lostOpps: lostOpps.length,
      revenue,
      pipelineValue,
      winRate,
      totalInDb,
      prevRevenue,
      prevTotalOpps,
      prevWinRate
    });
  } catch (error: any) {
    console.error("Overview Endpoint Crash Error:", error.stack || error);
    res.status(500).json({ error: error.message || error.toString() });
  }
});

app.get("/api/crm/pipelines", requireAuth, async (req: any, res: any) => {
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

app.get("/api/crm/users", requireAuth, async (req: any, res: any) => {
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

app.get("/api/crm/closers", requireAuth, async (req: any, res: any) => {
  const { locationId } = req.query;
  try {
    const { data, error } = await supabase.from('opportunities').select('raw, custom_fields').eq("location_id", locationId);
    if (error) throw error;

    const uniqueClosers = new Set<string>();
    (data || []).forEach(o => {
      const rawCFs = o.custom_fields || o.raw?.customFields;
      let val = '';

      if (Array.isArray(rawCFs)) {
        const closerField = rawCFs.find((f: any) =>
          String(f.id || f.fieldId || "") === 'DPEKghcOYLZADdLcTR8Q' ||
          String(f.key || "").toLowerCase().includes('closer') ||
          String(f.name || f.label || "").toLowerCase().includes('closer') ||
          String(f.id || "").toLowerCase().includes('closer')
        );
        if (closerField) {
          let rv = closerField.fieldValue || closerField.fieldValueString || closerField.field_value || closerField.value;
          if (Array.isArray(rv) && rv.length > 0) rv = rv[0];
          val = String(rv || "").trim();
        }
      } else if (rawCFs && typeof rawCFs === 'object') {
        const key = Object.keys(rawCFs).find(k => 
          k === 'DPEKghcOYLZADdLcTR8Q' || 
          k.toLowerCase().includes('closer')
        );
        if (key) {
          val = String((rawCFs as any)[key] || "").trim();
        }
      }

      if (val && val.toLowerCase() !== 'none' && val.toLowerCase() !== 'null') {
        uniqueClosers.add(val);
      }
    });

    res.json(Array.from(uniqueClosers).sort());
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// --- Targets Endpoints ---

app.get("/api/targets", requireAuth, async (req: any, res: any) => {
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

app.post("/api/targets", requireAdmin, async (req: any, res: any) => {
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

app.get("/api/crm/funnel", requireAuth, async (req: any, res: any) => {
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
      if (error) {
        console.error("Funnel query error:", error.message);
        return res.status(503).json({ error: 'DB_ERROR', message: 'Error al consultar los datos del funnel.' });
      }
      opps = data || [];
    } catch (e: any) {
      return res.status(503).json({ error: 'DB_ERROR', message: 'Error al conectar con la base de datos.' });
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

app.get("/api/crm/opportunities", requireAuth, async (req: any, res: any) => {
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
        console.error("Supabase query error:", error.message);
        return res.status(503).json({ error: 'DB_ERROR', message: 'Error al consultar los datos. Verifica la sincronización con GoHighLevel.' });
      }
      rawOpps = data || [];
    } catch (err: any) {
      console.error("Supabase fetch failed:", err.message);
      return res.status(503).json({ error: 'DB_ERROR', message: 'Error al conectar con la base de datos.' });
    }

    let baseOpps = rawOpps;

    let opps = baseOpps;

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

app.post("/api/copilot/chat", requireAuth, async (req, res) => {
  const { query, context } = req.body;

  if (!query) return res.status(400).json({ error: "Missing query" });

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return res.status(503).json({ error: "OPENAI_API_KEY no configurada en el servidor" });

  try {
    const openai = new OpenAI({ apiKey });

    // Limit context size to avoid exceeding token limits
    const contextSummary = context ? JSON.stringify(context).slice(0, 4000) : '{}';

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `Eres un experto en operaciones de ventas para GoHighLevel.
Analiza los datos del dashboard proporcionados y responde de forma clara y accionable en español.
Estructura tu respuesta así:
- Responde directamente la pregunta
- Identifica los 2-3 factores principales
- Da recomendaciones concretas y accionables`
        },
        {
          role: "user",
          content: `Datos del dashboard de ventas:\n${contextSummary}\n\nPregunta: ${query}`
        }
      ],
      max_tokens: 1000,
      temperature: 0.7
    });

    const text = completion.choices[0]?.message?.content ?? 'Sin respuesta del asistente.';
    res.json({ answer: text });
  } catch (error: any) {
    const detail = error?.message || error?.toString() || 'Unknown error';
    console.error("Copilot Error:", detail);
    res.status(500).json({ error: detail });
  }
});


// --- Temporal Export Endpoint ---

app.get("/api/export/evergreen-web", requireAdmin, async (req: any, res: any) => {
  try {
    // Find the Evergreen Web pipeline
    const { data: pipelines, error: pipeErr } = await supabase
      .from('pipelines')
      .select('id, name')
      .ilike('name', '%evergreen%');

    if (pipeErr || !pipelines || pipelines.length === 0) {
      return res.status(404).json({ error: 'Pipeline Evergreen no encontrado' });
    }

    const pipeline = pipelines.find((p: any) => p.name.toLowerCase().includes('web')) || pipelines[0];

    // Fetch all opportunities for this pipeline
    const { data: opportunities, error: oppErr } = await supabase
      .from('opportunities')
      .select('*')
      .eq('pipeline_id', pipeline.id);

    if (oppErr) return res.status(500).json({ error: oppErr.message });

    // Helper: extract contact email
    const extractEmail = (o: any): string =>
      o.contact?.email || o.raw?.contact?.email || o.email || o.raw?.email || '';

    // Helper: extract sale origin (same logic as CloserDashboard)
    const extractOrigin = (o: any): string => {
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
        const key = Object.keys(rawCFs).find((k: string) =>
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
      if (origin === 'Otro' && o.raw) {
        const rawStr = JSON.stringify(o.raw).toLowerCase();
        if (rawStr.includes('hotmart')) origin = 'Hotmart';
        else if (rawStr.includes('transferencia')) origin = 'Transferencia';
      }
      return origin;
    };

    // Build CSV with BOM for Excel compatibility
    const BOM = '\uFEFF';
    const header = 'ID Oportunidad,Email Contacto,Origen de Venta\n';
    const body = (opportunities || [])
      .map((o: any) => `"${o.id}","${extractEmail(o)}","${extractOrigin(o)}"`)
      .join('\n');

    const filename = `evergreen-web-${new Date().toISOString().split('T')[0]}.csv`;
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(BOM + header + body);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// --- Export Endpoints ---

// Shared helpers for export
function exportExtractOrigin(o: any): string {
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
    const key = Object.keys(rawCFs).find((k: string) =>
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
  if (origin === 'Otro' && o.raw) {
    const rawStr = JSON.stringify(o.raw).toLowerCase();
    if (rawStr.includes('hotmart')) origin = 'Hotmart';
    else if (rawStr.includes('transferencia')) origin = 'Transferencia';
  }
  return origin;
}

function exportExtractCloser(o: any): string {
  const rawCFs = o.custom_fields || o.raw?.customFields;
  if (Array.isArray(rawCFs)) {
    const field = rawCFs.find((f: any) => {
      const id = String(f.id || f.fieldId || '').toLowerCase();
      const label = String(f.name || f.label || '').toLowerCase();
      return id === 'dpekghcoylzaddlctr8q' || label.includes('closer');
    });
    if (field) {
      let rv = field.fieldValue || field.value || field.fieldValueString;
      if (Array.isArray(rv) && rv.length > 0) rv = rv[0];
      return String(rv || '').trim();
    }
  } else if (rawCFs && typeof rawCFs === 'object') {
    const key = Object.keys(rawCFs).find(k => k === 'DPEKghcOYLZADdLcTR8Q' || k.toLowerCase().includes('closer'));
    if (key) return String((rawCFs as any)[key] || '').trim();
  }
  return '';
}

function exportExtractContact(o: any): { name: string; email: string; phone: string } {
  const c = o.contact || o.raw?.contact || {};
  return {
    name:  c.name  || o.raw?.contactName  || '',
    email: c.email || o.raw?.email        || o.email || '',
    phone: c.phone || o.raw?.phone        || o.phone || ''
  };
}

function sendCsv(res: any, filename: string, header: string, rows: string[]) {
  const BOM = '\uFEFF';
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(BOM + header + '\n' + rows.join('\n'));
}

function csvCell(v: any): string {
  return `"${String(v ?? '').replace(/"/g, '""')}"`;
}

app.get("/api/export/opportunities", requireAuth, async (req: any, res: any) => {
  const { locationId, pipelineId, status, startDate, endDate, closer, origin } = req.query;
  try {
    let query = supabase.from('opportunities').select('*').eq('location_id', locationId);
    if (pipelineId)  query = query.eq('pipeline_id', pipelineId);
    if (status && status !== 'all') query = query.eq('status', status);
    if (startDate)   query = query.gte('created_at', `${startDate}T00:00:00Z`);
    if (endDate)     query = query.lte('created_at', `${endDate}T23:59:59Z`);

    const { data, error } = await query;
    if (error) return res.status(500).json({ error: error.message });

    let opps = data || [];

    // Post-filter closer and origin (stored in raw JSON)
    if (closer && closer !== 'all') {
      opps = opps.filter(o => exportExtractCloser(o).toLowerCase() === String(closer).toLowerCase());
    }
    if (origin && origin !== 'all') {
      opps = opps.filter(o => exportExtractOrigin(o).toLowerCase() === String(origin).toLowerCase());
    }

    // Resolve pipeline/stage names from metadata
    const { data: pipelines } = await supabase.from('pipelines').select('id, name, raw').eq('location_id', locationId);
    const stageMap: Record<string, string> = {};
    const pipeMap: Record<string, string> = {};
    (pipelines || []).forEach((p: any) => {
      pipeMap[p.id] = p.name;
      const stages = p.raw?.stages || p.stages || [];
      stages.forEach((s: any) => { stageMap[s.id] = s.name; });
    });

    const header = ['ID Oportunidad','Nombre','Email Contacto','Teléfono','Pipeline','Etapa','Estado','Closer','Origen','Valor (€)','Fecha Creación'].map(csvCell).join(',');
    const rows = opps.map(o => {
      const contact = exportExtractContact(o);
      return [
        o.id,
        o.name || '',
        contact.email,
        contact.phone,
        pipeMap[o.pipeline_id] || o.pipeline_id || '',
        stageMap[o.stage_id]   || o.stage_id   || '',
        o.status || '',
        exportExtractCloser(o),
        exportExtractOrigin(o),
        o.value || 0,
        o.created_at ? o.created_at.split('T')[0] : ''
      ].map(csvCell).join(',');
    });

    const filename = `oportunidades-${new Date().toISOString().split('T')[0]}.csv`;
    sendCsv(res, filename, header, rows);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.get("/api/export/contacts", requireAuth, async (req: any, res: any) => {
  const { locationId, pipelineId, startDate, endDate, hasEmail, hasPhone } = req.query;
  try {
    let query = supabase.from('opportunities').select('*').eq('location_id', locationId);
    if (pipelineId) query = query.eq('pipeline_id', pipelineId);
    if (startDate)  query = query.gte('created_at', `${startDate}T00:00:00Z`);
    if (endDate)    query = query.lte('created_at', `${endDate}T23:59:59Z`);

    const { data, error } = await query;
    if (error) return res.status(500).json({ error: error.message });

    // Deduplicate contacts by email (or by name if no email)
    const contactMap: Record<string, any> = {};
    (data || []).forEach(o => {
      const c = exportExtractContact(o);
      const key = c.email || c.name || o.id;
      if (!contactMap[key]) {
        contactMap[key] = { ...c, opps: 0, lastOpp: '', pipeline: o.pipeline_id, status: o.status };
      }
      contactMap[key].opps += 1;
      if (!contactMap[key].lastOpp || o.created_at > contactMap[key].lastOpp) {
        contactMap[key].lastOpp = o.created_at ? o.created_at.split('T')[0] : '';
        contactMap[key].status = o.status;
        contactMap[key].pipeline = o.pipeline_id;
      }
    });

    let contacts = Object.values(contactMap);
    if (hasEmail === 'true') contacts = contacts.filter(c => c.email);
    if (hasPhone === 'true') contacts = contacts.filter(c => c.phone);

    // Resolve pipeline names
    const { data: pipelines } = await supabase.from('pipelines').select('id, name').eq('location_id', locationId);
    const pipeMap: Record<string, string> = {};
    (pipelines || []).forEach((p: any) => { pipeMap[p.id] = p.name; });

    const header = ['Nombre','Email','Teléfono','Oportunidades','Última Oportunidad','Pipeline','Estado'].map(csvCell).join(',');
    const rows = contacts.map(c => [
      c.name,
      c.email,
      c.phone,
      c.opps,
      c.lastOpp,
      pipeMap[c.pipeline] || c.pipeline || '',
      c.status || ''
    ].map(csvCell).join(','));

    const filename = `contactos-${new Date().toISOString().split('T')[0]}.csv`;
    sendCsv(res, filename, header, rows);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.get("/api/export/count", requireAuth, async (req: any, res: any) => {
  const { locationId, type, pipelineId, status, startDate, endDate, closer, origin } = req.query;
  try {
    let query = supabase.from('opportunities').select('id, custom_fields, raw', { count: 'exact' }).eq('location_id', locationId);
    if (pipelineId) query = query.eq('pipeline_id', pipelineId);
    if (status && status !== 'all') query = query.eq('status', status);
    if (startDate)  query = query.gte('created_at', `${startDate}T00:00:00Z`);
    if (endDate)    query = query.lte('created_at', `${endDate}T23:59:59Z`);

    const { data, count, error } = await query;
    if (error) return res.status(500).json({ error: error.message });

    let opps = data || [];
    if (closer && closer !== 'all') {
      opps = opps.filter(o => exportExtractCloser(o).toLowerCase() === String(closer).toLowerCase());
    }
    if (origin && origin !== 'all') {
      opps = opps.filter(o => exportExtractOrigin(o).toLowerCase() === String(origin).toLowerCase());
    }

    res.json({ count: opps.length });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
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
