import { useState, useEffect } from 'react';
import { collection, query, getDocs, orderBy, limit } from 'firebase/firestore';
import { db } from '../firebase';
import { Network, Activity, FileSignature, Receipt, Users, Home } from 'lucide-react';

const Dashboard = () => {
    const [stats, setStats] = useState({
        totalProjects: 0,
        pendingContracts: 0,
        unpaidInvoices: 0,
        availableBuilders: 0
    });

    return (
        <div className="w-full relative flex flex-col h-full overflow-hidden">
            <header className="mb-8 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 shrink-0">
                <div>
                    <h1 className="text-3xl font-semibold tracking-tight">Dashboard</h1>
                    <p className="mt-2 text-sm text-gray-500">Overview and key metrics.</p>
                </div>
            </header>

            <div className="flex-1 overflow-auto w-full">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8 w-full max-w-7xl mx-auto">
                    {/* Stat Cards */}
                    <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm flex items-center gap-4">
                        <div className="bg-blue-50 p-3 rounded-lg"><Home className="h-6 w-6 text-blue-600" /></div>
                        <div>
                            <p className="text-sm font-medium text-gray-500">Total Projects</p>
                            <p className="text-2xl font-semibold text-gray-900">--</p>
                        </div>
                    </div>
                    <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm flex items-center gap-4">
                        <div className="bg-green-50 p-3 rounded-lg"><Users className="h-6 w-6 text-green-600" /></div>
                        <div>
                            <p className="text-sm font-medium text-gray-500">Available Builders</p>
                            <p className="text-2xl font-semibold text-gray-900">--</p>
                        </div>
                    </div>
                    <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm flex items-center gap-4">
                        <div className="bg-orange-50 p-3 rounded-lg"><FileSignature className="h-6 w-6 text-orange-600" /></div>
                        <div>
                            <p className="text-sm font-medium text-gray-500">Pending Contracts</p>
                            <p className="text-2xl font-semibold text-gray-900">--</p>
                        </div>
                    </div>
                    <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm flex items-center gap-4">
                        <div className="bg-purple-50 p-3 rounded-lg"><Receipt className="h-6 w-6 text-purple-600" /></div>
                        <div>
                            <p className="text-sm font-medium text-gray-500">Unpaid Invoices</p>
                            <p className="text-2xl font-semibold text-gray-900">--</p>
                        </div>
                    </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 w-full max-w-7xl mx-auto">
                    <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm min-h-[300px]">
                        <h3 className="text-lg font-semibold mb-4">Recent Activity Placeholder</h3>
                        <p className="text-gray-500 text-sm">Integration with activity feed coming soon.</p>
                    </div>
                    <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm min-h-[300px]">
                        <h3 className="text-lg font-semibold mb-4">Project Charts Placeholder</h3>
                        <p className="text-gray-500 text-sm">Implementation of charts coming soon.</p>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default Dashboard;
