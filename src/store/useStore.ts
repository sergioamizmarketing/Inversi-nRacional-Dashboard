import { create } from 'zustand';
import { supabase } from '../lib/supabase';
import { format, subDays } from 'date-fns';

interface AppState {
  // Auth & Connection
  user: any | null;
  connection: any | null;
  pipelines: any[];
  ghlUsers: any[];
  isDark: boolean;
  sidebarOpen: boolean;

  // Data
  opportunities: any[];
  totalOpps: number;
  metrics: any | null;

  // Filters
  filters: {
    startDate: string;
    endDate: string;
    pipelineId: string;
    userId: string;
    period: string;
  };

  // Actions
  setUser: (user: any | null) => void;
  setConnection: (connection: any | null) => void;
  setPipelines: (pipelines: any[]) => void;
  setGhlUsers: (users: any[]) => void;
  toggleTheme: () => void;
  toggleSidebar: () => void;
  setOpportunities: (opps: any[]) => void;
  setTotalOpps: (total: number) => void;
  setMetrics: (metrics: any) => void;
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
  isDark: false,
  sidebarOpen: true,
  opportunities: [],
  totalOpps: 0,
  metrics: null,

  filters: {
    startDate: format(subDays(new Date(), 30), 'yyyy-MM-dd'),
    endDate: format(new Date(), 'yyyy-MM-dd'),
    pipelineId: '',
    userId: '',
    period: '30days'
  },

  setUser: (user) => set({ user }),
  setConnection: (connection) => set({ connection }),
  setPipelines: (pipelines) => set({ pipelines }),
  setGhlUsers: (ghlUsers) => set({ ghlUsers }),
  toggleTheme: () => set((state) => {
    const newIsDark = !state.isDark;
    if (newIsDark) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    return { isDark: newIsDark };
  }),
  toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),
  setOpportunities: (opportunities) => set({ opportunities }),
  setTotalOpps: (totalOpps) => set({ totalOpps }),
  setMetrics: (metrics) => set({ metrics }),

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
      case '7days':
        start = subDays(end, 7);
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
      const [pipeRes, userRes] = await Promise.all([
        fetch(`/api/crm/pipelines?locationId=${connection.location_id}`),
        fetch(`/api/crm/users?locationId=${connection.location_id}`)
      ]);

      if (pipeRes.ok) {
        const pipes = await pipeRes.json();
        set({ pipelines: Array.isArray(pipes) ? pipes : [] });
      }

      if (userRes.ok) {
        const users = await userRes.json();
        set({ ghlUsers: Array.isArray(users) ? users : [] });
      }
    } catch (err) {
      console.error('Error fetching metadata:', err);
    }
  },

  fetchOpportunities: async () => {
    const { connection, filters } = get();
    if (!connection) return;
    try {
      const query = new URLSearchParams({
        locationId: connection.location_id,
        startDate: filters.startDate,
        endDate: filters.endDate,
        pipelineId: filters.pipelineId,
        userId: filters.userId
      });
      const res = await fetch(`/api/crm/opportunities?${query.toString()}`);
      const data = await res.json();
      set({ opportunities: Array.isArray(data) ? data : [] });
    } catch (err) {
      console.error('Error fetching opportunities:', err);
      set({ opportunities: [] });
    }
  },

  fetchMetrics: async () => {
    const { connection, filters } = get();
    if (!connection) return;
    try {
      const query = new URLSearchParams({
        locationId: connection.location_id,
        startDate: filters.startDate,
        endDate: filters.endDate,
        pipelineId: filters.pipelineId,
        userId: filters.userId
      });
      const res = await fetch(`/api/metrics/overview?${query.toString()}`);
      const data = await res.json();
      set({ metrics: data });
      if (data.totalInDb !== undefined) set({ totalOpps: data.totalInDb });
    } catch (err) {
      console.error(err);
    }
  }
}));
