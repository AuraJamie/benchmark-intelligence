import { useState, useEffect } from 'react';
import { db } from '../firebase';
import { collection, query, orderBy, onSnapshot } from 'firebase/firestore';
import { Receipt, Plus } from 'lucide-react';

const Invoices = () => {
    const [invoices, setInvoices] = useState([]);
    const [loading, setLoading] = useState(true);

    return (
        <div className="w-full relative flex flex-col h-full overflow-hidden">
            <header className="mb-8 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 shrink-0">
                <div>
                    <h1 className="text-3xl font-semibold tracking-tight">Invoices</h1>
                    <p className="mt-2 text-sm text-gray-500">Manage builder payments, commission splits, and late fees.</p>
                </div>
                <button className="flex items-center gap-2 rounded-lg bg-[#0f172a] px-4 py-2.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-black">
                    <Plus className="h-4 w-4" />
                    Create Invoice
                </button>
            </header>

            <div className="flex-1 overflow-auto w-full">
                <div className="bg-white rounded-xl border border-gray-200 shadow-sm flex items-center justify-center min-h-[400px]">
                    <div className="text-center p-8">
                        <Receipt className="h-12 w-12 text-gray-300 mx-auto mb-4" />
                        <h3 className="text-lg font-medium text-gray-900 mb-1">Invoicing System</h3>
                        <p className="text-gray-500 text-sm max-w-sm mx-auto">The automated 40/40/20 invoice tracking, complete with late-fee calculations, is being built here.</p>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default Invoices;
