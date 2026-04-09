import { create } from 'zustand';
import { supabase } from '../lib/supabase';
import { format, subDays } from 'date-fns';

export interface Toast {
  id: string;
  message: string;
  type: 'success' | 'error' | 'info';
}

export interface UserProfile {
  id: string;
  email: string;
  role: 'pending' | 'viewer' | 'closer' | 'manager' | 'admin';
  full_name?: string;
  profile?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface GHLConnection {
  id: string;
  location_id: string;
  access_token: string;
  refresh_token: string;
  token_expires_at?: string;
  updated_at?: string;
  [key: string]: unknown;
}

export interface Pipeline {
  id: string;
  name: string;
  stages?: PipelineStage[];
  [key: string]: unknown;
}

export interface PipelineStage {
  id: string;
  name: string;
  position?: number;
  [key: string]: unknown;
}

export interface GHLUser {
  id: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  [key: string]: unknown;
}

export interface Opportunity {
  id: string;
  status: 'open' | 'won' | 'lost' | 'abandoned';
  value?: number;
  pipeline_id?: string;
  stage_id?: string;
  created_at?: string;
  owner_user_id?: string;
  location_id?: string;
  custom_fields?: unknown;
  raw?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface Metrics {
  totalOpps: number;
  revenue: number;
  winRate: number;
  totalInDb?: number;
  prevRevenue?: number;
  prevTotalOpps?: number;
  prevWinRate?: number;
  [key: string]: unknown;
}

interface AppState {
  // Auth & Connection
  user: UserProfile | null;
  connection: GHLConnection | null;
  pipelines: Pipeline[];
  ghlUsers: GHLUser[];
  customClosers: string[];
  isDark: boolean;
  sidebarOpen: boolean;

  // Data
  opportunities: Opportunity[];
  totalOpps: number;
  metrics: Metrics | null;

  // Toasts
  toasts: Toast[];
  addToast: (message: string, type?: Toast['type']) => void;
  removeToast: (id: string) => void;

  // Filters
  filters: {
    startDate: string;
    endDate: string;
    pipelineId: string;
    userId: string;
    period: string;
  };

  // Actions
  setUser: (user: UserProfile | null) => void;
  setConnection: (connection: GHLConnection | null) => void;
  setPipelines: (pipelines: Pipeline[]) => void;
  setGhlUsers: (users: GHLUser[]) => void;
  setCustomClosers: (closers: string[]) => void;
  toggleTheme: () => void;
  toggleSidebar: () => void;
  setOpportunities: (opps: Opportunity[]) => void;
  setTotalOpps: (total: number) => void;
  setMetrics: (metrics: Metrics | null) => void;
  setFilters: (filters: Partial<AppState['filters']>) => void;
  handlePeriodChange: (period: string) => void;

  // Async Actions
  fetchMetadata: () => Promise<void>;
  fetchOpportunities: () => Promise<void>;
  fetchMetrics: () => Promise<void>;
}

export const useStore = create<AppState>((set, get) => ({
  user: null,
  connection: null,
  pipelines: [],
  ghlUsers: [],
  customClosers: [],
  isDark: false,
  sidebarOpen: true,
  opportunities: [],
  totalOpps: 0,
  metrics: null,
  toasts: [],

  filters: {
    startDate: format(new Date(2000, 0, 1), 'yyyy-MM-dd'),
    endDate: format(new Date(), 'yyyy-MM-dd'),
    pipelineId: '',
    userId: '',
    period: 'all'
  },

  setUser: (user) => set({ user }),
  setConnection: (connection) => set({ connection }),
  setPipelines: (pipelines) => set({ pipelines }),
  setGhlUsers: (ghlUsers) => set({ ghlUsers }),
  setCustomClosers: (customClosers) => set({ customClosers }),
  toggleTheme: () => set((state) => ({ isDark: !state.isDark })),
  toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),
  setOpportunities: (opportunities) => set({ opportunities }),
  setTotalOpps: (totalOpps) => set({ totalOpps }),
  setMetrics: (metrics) => set({ metrics }),

  addToast: (message, type = 'info') => {
    const id = Math.random().toString(36).slice(2);
    set((state) => ({ toasts: [...state.toasts, { id, message, type }] }));
    setTimeout(() => useStore.getState().removeToast(id), 4000);
  },
  removeToast: (id) => set((state) => ({ toasts: state.toasts.filter(t => t.id !== id) })),

  setFilters: (newFilters) => set((state) => ({
    filters: { ...state.filters, ...newFilters }
  })),

  handlePeriodChange: (period) => {
    let start = new Date();
    let end = new Date();

    switch (period) {
      case 'all':
        start = new Date(2000, 0, 1);
        break;
      case 'today':
        // Start and end are already today
        break;
      case 'yesterday':
        start = subDays(end, 1);
        end = subDays(end, 1);
        break;
      case '7days':
        start = subDays(end, 7);
        break;
      case '15days':
        start = subDays(end, 15);
        break;
      case '30days':
        start = subDays(end, 30);
        break;
      case '3months':
        start = subDays(end, 90);
        break;
      case '6months':
        start = subDays(end, 180);
        break;
      case 'year':
        start = subDays(end, 365);
        break;
      case 'custom':
        set((state) => ({ filters: { ...state.filters, period } }));
        return;
    }

    set((state) => ({
      filters: {
        ...state.filters,
        period,
        startDate: format(start, 'yyyy-MM-dd'),
        endDate: format(end, 'yyyy-MM-dd')
      }
    }));
  },

  fetchMetadata: async () => {
    const { connection } = get();
    if (!connection) return;
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const headers: Record<string, string> = session
        ? { Authorization: `Bearer ${session.access_token}` }
        : {};

      const [pipeRes, userRes, closersRes] = await Promise.all([
        fetch(`/api/crm/pipelines?locationId=${connection.location_id}`, { headers }),
        fetch(`/api/crm/users?locationId=${connection.location_id}`, { headers }),
        fetch(`/api/crm/closers?locationId=${connection.location_id}`, { headers })
      ]);

      if (pipeRes.ok) {
        const pipes = await pipeRes.json();
        set({ pipelines: Array.isArray(pipes) ? pipes : [] });
      }

      if (userRes.ok) {
        const users = await userRes.json();
        set({ ghlUsers: Array.isArray(users) ? users : [] });
      }

      if (closersRes.ok) {
        const closers = await closersRes.json();
        set({ customClosers: Array.isArray(closers) ? closers : [] });
      }
    } catch (err) {
      console.error('Error fetching metadata:', err);
      useStore.getState().addToast('Error al cargar los metadatos del CRM.', 'error');
    }
  },

  fetchOpportunities: async () => {
    const { connection, filters } = get();
    if (!connection) return;
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const headers: Record<string, string> = session
        ? { Authorization: `Bearer ${session.access_token}` }
        : {};

      const query = new URLSearchParams({
        locationId: connection.location_id,
        startDate: filters.startDate,
        endDate: filters.endDate,
        pipelineId: filters.pipelineId,
        userId: filters.userId
      });
      const res = await fetch(`/api/crm/opportunities?${query.toString()}`, { headers });
      if (!res.ok) throw new Error(`Error ${res.status}`);
      const data = await res.json();
      set({ opportunities: Array.isArray(data) ? data : [] });
    } catch (err) {
      console.error('Error fetching opportunities:', err);
      set({ opportunities: [] });
      useStore.getState().addToast('Error al cargar las oportunidades.', 'error');
    }
  },

  fetchMetrics: async () => {
    const { connection, filters } = get();
    if (!connection) return;
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const headers: Record<string, string> = session
        ? { Authorization: `Bearer ${session.access_token}` }
        : {};

      const query = new URLSearchParams({
        locationId: connection.location_id,
        startDate: filters.startDate,
        endDate: filters.endDate,
        pipelineId: filters.pipelineId,
        userId: filters.userId
      });
      const res = await fetch(`/api/metrics/overview?${query.toString()}`, { headers });
      if (!res.ok) throw new Error(`Error ${res.status}`);
      const data = await res.json();
      set({ metrics: data });
      if (data.totalInDb !== undefined) set({ totalOpps: data.totalInDb });
    } catch (err) {
      console.error('Error fetching metrics:', err);
      useStore.getState().addToast('Error al cargar las métricas. Intenta de nuevo.', 'error');
    }
  }
}));
