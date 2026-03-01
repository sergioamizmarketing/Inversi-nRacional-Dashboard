import React from 'react';
import { LogOut, Clock, ShieldAlert } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { motion } from 'motion/react';

export function PendingApproval() {
    const handleLogout = async () => {
        await supabase.auth.signOut();
    };

    return (
        <div className="min-h-screen bg-slate-50 dark:bg-slate-900 flex items-center justify-center p-4">
            <div className="absolute inset-0 z-0">
                <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-amber-500/20 rounded-full blur-3xl animate-pulse" />
                <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-orange-500/20 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '1s' }} />
            </div>

            <motion.div
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                className="w-full max-w-lg bg-white/80 dark:bg-slate-800/80 backdrop-blur-xl rounded-3xl p-10 shadow-2xl border border-slate-200 dark:border-slate-700 relative z-10 text-center"
            >
                <div className="w-20 h-20 bg-amber-100 dark:bg-amber-900/30 rounded-full flex items-center justify-center mx-auto mb-6 shadow-inner relative">
                    <ShieldAlert className="w-10 h-10 text-amber-600 dark:text-amber-500" />
                    <div className="absolute -bottom-1 -right-1 w-8 h-8 bg-white dark:bg-slate-800 rounded-full flex items-center justify-center shadow-md">
                        <Clock className="w-4 h-4 text-slate-400" />
                    </div>
                </div>

                <h2 className="text-3xl font-bold text-slate-900 dark:text-white mb-4">
                    Aprobación Pendiente
                </h2>

                <p className="text-slate-600 dark:text-slate-400 text-lg leading-relaxed mb-8">
                    Tu cuenta ha sido creada exitosamente, pero tu acceso se encuentra <strong>en revisión</strong>.
                    Un administrador debe asignar los permisos necesarios a tu perfil para que puedas visualizar el Dashboard.
                </p>

                <div className="p-4 bg-slate-100 dark:bg-slate-900/50 rounded-2xl mb-8 border border-slate-200 dark:border-slate-700">
                    <p className="text-sm text-slate-500 dark:text-slate-400">
                        Intenta recargar la página más tarde si ya han validado tu perfil.
                    </p>
                </div>

                <button
                    onClick={handleLogout}
                    className="w-full py-4 bg-slate-900 hover:bg-slate-800 dark:bg-slate-700 dark:hover:bg-slate-600 text-white rounded-xl font-semibold flex items-center justify-center gap-2 transition-all shadow-lg"
                >
                    <LogOut className="w-5 h-5" />
                    Cerrar Sesión
                </button>
            </motion.div>
        </div>
    );
}
