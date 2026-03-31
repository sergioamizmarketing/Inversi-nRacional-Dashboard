import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useStore } from '../../store/useStore';
import { supabase } from '../../lib/supabase';
import { XCircle, TrendingUp, ShieldCheck, Settings } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface SidebarItemProps {
    icon: any;
    label: string;
    to: string;
    collapsed: boolean;
}

const SidebarItem = ({ icon: Icon, label, to, collapsed }: SidebarItemProps) => {
    const location = useLocation();
    const active = location.pathname === to || (to === '/' && location.pathname === '/overview');

    return (
        <Link
            to={to}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-300 relative overflow-hidden ${active
                ? 'bg-indigo-600/90 text-white shadow-lg shadow-indigo-200 dark:shadow-indigo-900/20 backdrop-blur-sm'
                : 'text-slate-500 dark:text-slate-400 hover:bg-slate-100/50 dark:hover:bg-slate-700/50 hover:text-slate-900 dark:hover:text-white'
                } ${collapsed ? 'justify-center px-0' : ''}`}
            title={collapsed ? label : ''}
        >
            <Icon className={`w-5 h-5 flex-shrink-0 z-10 ${active ? 'animate-pulse' : ''}`} />
            {!collapsed && <span className="font-medium whitespace-nowrap z-10">{label}</span>}
            {active && <div className="absolute inset-0 bg-gradient-to-r from-indigo-500 to-indigo-600 opacity-50 blur-xl -z-0"></div>}
        </Link>
    );
};

export const Sidebar = ({ navigations }: { navigations: any[] }) => {
    const { sidebarOpen, toggleSidebar, user } = useStore();

    return (
        <>
            {/* Mobile Overlay */}
            <AnimatePresence>
                {sidebarOpen && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={toggleSidebar}
                        className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-30 lg:hidden"
                    />
                )}
            </AnimatePresence>

            <aside className={`
                ${sidebarOpen ? 'w-64 translate-x-0' : 'w-20 lg:translate-x-0 -translate-x-full lg:w-20'} 
                bg-white/80 dark:bg-slate-800/80 backdrop-blur-xl border-r border-slate-200/50 dark:border-slate-700/50 p-6 flex flex-col gap-8 
                transition-all duration-300 z-40 fixed h-full lg:relative
            `}>
                <div className="flex items-center justify-between px-2 overflow-hidden h-8">
                    <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 bg-gradient-to-br from-indigo-500 to-purple-600 shadow-md">
                            <TrendingUp className="w-5 h-5 text-white" />
                        </div>
                        {sidebarOpen && <span className="font-bold text-xl tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-indigo-600 to-purple-600 dark:from-indigo-400 dark:to-purple-400 whitespace-nowrap transition-opacity duration-300">SalesOps</span>}
                    </div>
                    {/* Collapsible toggle for mobile inside sidebar */}
                    <button onClick={toggleSidebar} className="lg:hidden p-1 text-slate-400">
                        <XCircle className="w-5 h-5" />
                    </button>
                </div>

            <nav className="flex-1 flex flex-col gap-2 mt-4">
                {navigations.map(nav => (
                    <SidebarItem key={nav.to} {...nav} collapsed={!sidebarOpen} />
                ))}
            </nav>

            <div className="pt-6 border-t border-slate-200/50 dark:border-slate-700/50">
                <button
                    onClick={() => supabase.auth.signOut()}
                    className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-rose-500 hover:bg-rose-50/80 dark:hover:bg-rose-900/20 transition-all ${!sidebarOpen ? 'justify-center px-0' : ''}`}
                    title={!sidebarOpen ? 'Cerrar Sesión' : ''}
                >
                    <XCircle className="w-5 h-5 flex-shrink-0" />
                    {sidebarOpen && <span className="font-medium whitespace-nowrap">Cerrar Sesión</span>}
                </button>
            </div>
        </aside>
        </>
    );
};
