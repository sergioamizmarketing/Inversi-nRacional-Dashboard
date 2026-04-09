import React, { useState } from 'react';
import { Settings as SettingsIcon, Target } from 'lucide-react';
import { useStore } from '../store/useStore';

export const Settings = () => {
    const { addToast, connection } = useStore();
    const [confirmOpen, setConfirmOpen] = useState(false);
    const [syncing, setSyncing] = useState(false);

    const handleOAuthStart = () => {
        const width = 600;
        const height = 700;
        const left = window.screen.width / 2 - width / 2;
        const top = window.screen.height / 2 - height / 2;
        window.open('/api/crm/oauth/start', 'GHL_Auth', `width=${width},height=${height},top=${top},left=${left}`);
    };

    const handleReset = async () => {
        if (!connection) {
            addToast('No hay conexión activa con GoHighLevel.', 'error');
            return;
        }
        setSyncing(true);
        setConfirmOpen(false);
        try {
            const res = await fetch(`/api/crm/sync?locationId=${connection.location_id}&full=true`);
            const data = await res.json();
            if (res.ok) {
                await Promise.all([
                    useStore.getState().fetchMetrics(),
                    useStore.getState().fetchMetadata(),
                    useStore.getState().fetchOpportunities()
                ]);
                addToast(`Reinicio completado. ${data.count} oportunidades importadas.`, 'success');
            } else {
                const msg = typeof data.error === 'string' ? data.error : JSON.stringify(data.error);
                addToast(msg || 'Error en la sincronización', 'error');
            }
        } catch (err: any) {
            addToast('Error fatal al sincronizar: ' + err.message, 'error');
        } finally {
            setSyncing(false);
        }
    };

    return (
        <div className="bg-white/80 dark:bg-slate-800/80 backdrop-blur-xl p-8 rounded-3xl border border-white/50 dark:border-slate-700 text-center max-w-md mx-auto mt-12 shadow-xl">
            <div className="w-16 h-16 bg-gradient-to-br from-indigo-100 to-purple-100 dark:from-indigo-900/50 dark:to-purple-900/50 rounded-2xl flex items-center justify-center mx-auto mb-6 shadow-inner">
                <SettingsIcon className="w-8 h-8 text-indigo-600 dark:text-indigo-400" />
            </div>
            <h2 className="text-2xl font-bold mb-4">Ajustes de Integración</h2>
            <p className="text-slate-500 dark:text-slate-400 mb-8">Administra tus conexiones a fuentes de datos y CRM.</p>

            <button
                onClick={handleOAuthStart}
                className="inline-flex items-center justify-center gap-2 w-full px-8 py-4 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white rounded-xl font-bold shadow-lg shadow-blue-200 dark:shadow-blue-900/20 transition-all cursor-pointer mb-4"
            >
                <Target className="w-5 h-5" />
                Vincular / Actualizar GoHighLevel
            </button>

            <hr className="border-slate-200 dark:border-slate-700 my-6" />

            <h3 className="text-lg font-bold text-rose-500 mb-2">Zona de Peligro</h3>
            <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">
                Si los datos del Dashboard no coinciden con GHL, usa este botón para borrar la base de datos local y traer todo de nuevo.
            </p>

            <button
                onClick={() => setConfirmOpen(true)}
                disabled={syncing}
                className="inline-flex items-center justify-center gap-2 w-full px-8 py-4 bg-rose-50 hover:bg-rose-100 text-rose-600 dark:bg-rose-500/10 dark:hover:bg-rose-500/20 dark:text-rose-400 rounded-xl font-bold border border-rose-200 dark:border-rose-500/30 transition-all cursor-pointer disabled:opacity-50"
            >
                {syncing ? 'Sincronizando...' : 'Reiniciar Base de Datos Local'}
            </button>

            {confirmOpen && (
                <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md flex items-center justify-center z-50 p-4">
                    <div className="bg-white dark:bg-slate-800 w-full max-w-sm p-8 rounded-3xl shadow-2xl border border-slate-100 dark:border-slate-700">
                        <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-3">¿Confirmar reinicio?</h3>
                        <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">
                            Esto borrará los registros actuales y traerá todo de nuevo desde GoHighLevel.
                        </p>
                        <div className="flex gap-3">
                            <button
                                onClick={() => setConfirmOpen(false)}
                                className="flex-1 px-4 py-3 rounded-xl font-bold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 transition-all"
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={handleReset}
                                className="flex-1 bg-rose-600 hover:bg-rose-700 text-white py-3 rounded-xl font-bold transition-all"
                            >
                                Sí, reiniciar
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
