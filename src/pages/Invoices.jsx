import { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { db } from '../firebase';
import { collection, query, orderBy, onSnapshot, addDoc, updateDoc, doc, serverTimestamp, where } from 'firebase/firestore';
import { Receipt, Plus, Search, X, Calculator, Calendar, User, Home, CheckCircle2, AlertCircle, Clock, ArrowRight, Save, History, Percent, MapPin, Building, ChevronRight, ExternalLink } from 'lucide-react';

const BOE_BASE_RATE_DEFAULT = 5.25; // Example BoE rate

const Invoices = () => {
    const [searchParams, setSearchParams] = useSearchParams();
    const navigate = useNavigate();

    // Data states
    const [invoices, setInvoices] = useState([]);
    const [projects, setProjects] = useState([]);
    const [builders, setBuilders] = useState([]);
    const [loading, setLoading] = useState(true);
    const [isInitialLoad, setIsInitialLoad] = useState(true);

    // Filter/UI states
    const [searchQuery, setSearchQuery] = useState('');
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [selectedInvoice, setSelectedInvoice] = useState(null);

    // Create Form states
    const [newInvoice, setNewInvoice] = useState({
        projectId: '',
        builderId: '',
        totalQuote: '',
        firstPaymentDate: '', // Date the builder got their first payment
        boeBaseRate: BOE_BASE_RATE_DEFAULT,
        additionalCosts: 0
    });

    // Payment recording states
    const [isRecordingPayment, setIsRecordingPayment] = useState(null); // 'p1', 'p2', or 'p3'
    const [paymentAmount, setPaymentAmount] = useState('');

    useEffect(() => {
        const unsubscribeInvoices = onSnapshot(query(collection(db, 'invoices'), orderBy('createdAt', 'desc')), (snapshot) => {
            setInvoices(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
            setLoading(false);
        });

        const unsubscribeProjects = onSnapshot(query(collection(db, 'projects'), orderBy('address', 'asc')), (snapshot) => {
            setProjects(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
        });

        const unsubscribeBuilders = onSnapshot(query(collection(db, 'builders'), orderBy('companyName', 'asc')), (snapshot) => {
            setBuilders(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
        });

        return () => {
            unsubscribeInvoices();
            unsubscribeProjects();
            unsubscribeBuilders();
        };
    }, []);

    // Handle deep linking and syncing selected invoice with URL
    useEffect(() => {
        const id = searchParams.get('id');
        if (id && invoices.length > 0) {
            const inv = invoices.find(i => i.id === id);
            if (inv) {
                setSelectedInvoice(inv);
            }
        } else if (!id) {
            setSelectedInvoice(null);
        }
    }, [searchParams, invoices]);

    const openInvoice = (invoice) => {
        setSearchParams({ id: invoice.id });
    };

    const closeInvoice = () => {
        setSearchParams({});
    };

    const calculateCommission = (quote) => {
        const total = parseFloat(quote) || 0;
        const commission = total * 0.03;
        return {
            total: commission,
            p1: commission * 0.40,
            p2: commission * 0.40,
            p3: commission * 0.20
        };
    };

    const handleCreateInvoice = async () => {
        if (!newInvoice.projectId || !newInvoice.builderId || !newInvoice.totalQuote || !newInvoice.firstPaymentDate) {
            alert("Please fill in all required fields.");
            return;
        }

        const comm = calculateCommission(newInvoice.totalQuote);
        const p1Date = new Date(newInvoice.firstPaymentDate);
        const p2Date = new Date(p1Date);
        p2Date.setDate(p2Date.getDate() + 60);

        try {
            await addDoc(collection(db, 'invoices'), {
                projectId: newInvoice.projectId,
                builderId: newInvoice.builderId,
                totalQuote: parseFloat(newInvoice.totalQuote),
                commissionTotal: comm.total,
                boeBaseRate: parseFloat(newInvoice.boeBaseRate),
                status: 'Pending',
                createdAt: serverTimestamp(),
                payments: {
                    p1: {
                        amount: comm.p1,
                        dueDate: p1Date.toISOString(),
                        status: 'Pending',
                        amountPaid: 0,
                        datePaid: null
                    },
                    p2: {
                        amount: comm.p2,
                        dueDate: p2Date.toISOString(),
                        status: 'Pending',
                        amountPaid: 0,
                        datePaid: null
                    },
                    p3: {
                        amount: comm.p3,
                        dueDate: null, // "Upon completion" - we'll set this later or keep as completion trigger
                        status: 'Pending',
                        amountPaid: 0,
                        datePaid: null,
                        additionalCosts: parseFloat(newInvoice.additionalCosts || 0)
                    }
                }
            });
            setShowCreateModal(false);
            setNewInvoice({
                projectId: '',
                builderId: '',
                totalQuote: '',
                firstPaymentDate: '',
                boeBaseRate: BOE_BASE_RATE_DEFAULT,
                additionalCosts: 0
            });
        } catch (error) {
            console.error("Error creating invoice:", error);
            alert("Failed to create invoice.");
        }
    };

    const calculateInterest = (payment, boeBaseRate) => {
        if (payment.status === 'Paid' || !payment.dueDate) return 0;

        const dueDate = new Date(payment.dueDate);
        const now = new Date();

        if (now <= dueDate) return 0;

        const daysOverdue = Math.floor((now - dueDate) / (1000 * 60 * 60 * 24));
        const annualRate = (boeBaseRate + 8) / 100;
        const remainingAmount = payment.amount + (payment.additionalCosts || 0) - payment.amountPaid;

        // Simple daily interest: Amount * (Rate / 365) * Days
        return remainingAmount * (annualRate / 365) * daysOverdue;
    };

    const handleRecordPayment = async () => {
        if (!selectedInvoice || !isRecordingPayment || !paymentAmount) return;

        const amount = parseFloat(paymentAmount);
        const pKey = isRecordingPayment;
        const currentP = selectedInvoice.payments[pKey];
        const targetAmount = currentP.amount + (currentP.additionalCosts || 0);

        const newAmountPaid = currentP.amountPaid + amount;
        let newStatus = 'Partial';
        if (newAmountPaid >= targetAmount) {
            newStatus = 'Paid';
        }

        try {
            const invoiceRef = doc(db, 'invoices', selectedInvoice.id);
            const updatedPayments = { ...selectedInvoice.payments };
            updatedPayments[pKey] = {
                ...currentP,
                amountPaid: newAmountPaid,
                status: newStatus,
                datePaid: new Date().toISOString()
            };

            // Check if all are paid
            let overallStatus = 'Partial';
            const allPaid = Object.values(updatedPayments).every(p => p.status === 'Paid');
            if (allPaid) overallStatus = 'Paid';

            await updateDoc(invoiceRef, {
                payments: updatedPayments,
                status: overallStatus
            });

            // Refresh selected invoice view
            setSelectedInvoice({ ...selectedInvoice, payments: updatedPayments, status: overallStatus });
            setIsRecordingPayment(null);
            setPaymentAmount('');
        } catch (error) {
            console.error("Error recording payment:", error);
            alert("Failed to record payment.");
        }
    };

    const getProjectAddress = (id) => projects.find(p => p.id === id)?.address || 'Unknown Project';
    const getBuilderName = (id) => builders.find(b => b.id === id)?.companyName || 'Unknown Builder';

    const filteredInvoices = invoices.filter(inv => {
        const search = searchQuery.toLowerCase();
        return getProjectAddress(inv.projectId).toLowerCase().includes(search) ||
            getBuilderName(inv.builderId).toLowerCase().includes(search) ||
            inv.status.toLowerCase().includes(search);
    });

    return (
        <div className="w-full relative flex flex-col h-full overflow-hidden">
            <header className="mb-6 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 shrink-0">
                <div>
                    <h1 className="text-3xl font-semibold tracking-tight">Invoices</h1>
                    <p className="mt-2 text-sm text-gray-500">Automated 40/40/20 splits and late commission tracking.</p>
                </div>
                <button
                    onClick={() => setShowCreateModal(true)}
                    className="flex items-center gap-2 rounded-lg bg-[#0f172a] px-4 py-2.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-black"
                >
                    <Plus className="h-4 w-4" />
                    New Invoice
                </button>
            </header>

            <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden flex flex-col min-h-0 flex-1">
                <div className="flex items-center gap-4 border-b border-gray-100 p-4 shrink-0">
                    <div className="relative flex-1 max-w-md">
                        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                        <input
                            type="text"
                            placeholder="Search by project or builder..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full rounded-lg border border-gray-300 py-2.5 pl-10 pr-4 text-sm focus:border-[#0f172a] focus:outline-none focus:ring-1 focus:ring-[#0f172a]"
                        />
                    </div>
                </div>

                <div className="overflow-auto flex-1">
                    <table className="w-full text-left text-sm text-gray-600">
                        <thead className="bg-gray-50 text-xs uppercase text-gray-500 sticky top-0 z-10 shadow-sm border-b border-gray-200">
                            <tr>
                                <th className="px-6 py-4 font-medium">Project / Builder</th>
                                <th className="px-6 py-4 font-medium text-right">Commission (3%)</th>
                                <th className="px-6 py-4 font-medium">Status</th>
                                <th className="px-6 py-4 font-medium">Next Due</th>
                                <th className="px-6 py-4 font-medium text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100 bg-white">
                            {loading ? (
                                <tr><td colSpan="5" className="px-6 py-8 text-center text-gray-500">Loading invoices...</td></tr>
                            ) : filteredInvoices.length === 0 ? (
                                <tr><td colSpan="5" className="px-6 py-8 text-center text-gray-500">No invoices found.</td></tr>
                            ) : (
                                filteredInvoices.map(inv => {
                                    const nextPayment = Object.entries(inv.payments).find(([k, v]) => v.status !== 'Paid');
                                    return (
                                        <tr key={inv.id} className="hover:bg-gray-50 cursor-pointer" onClick={() => openInvoice(inv)}>
                                            <td className="px-6 py-4">
                                                <div className="font-medium text-[#0f172a]">{getProjectAddress(inv.projectId)}</div>
                                                <div className="text-xs text-gray-500">{getBuilderName(inv.builderId)}</div>
                                            </td>
                                            <td className="px-6 py-4 text-right font-medium text-gray-900">
                                                £{inv.commissionTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                            </td>
                                            <td className="px-6 py-4">
                                                <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium border ${inv.status === 'Paid' ? 'border-green-200 bg-green-50 text-green-700' :
                                                    inv.status === 'Partial' ? 'border-blue-200 bg-blue-50 text-blue-700' :
                                                        'border-orange-200 bg-orange-50 text-orange-700'
                                                    }`}>
                                                    {inv.status}
                                                </span>
                                            </td>
                                            <td className="px-6 py-4 text-gray-500">
                                                {nextPayment ? (nextPayment[1].dueDate ? new Date(nextPayment[1].dueDate).toLocaleDateString() : 'On Completion') : 'Complete'}
                                            </td>
                                            <td className="px-6 py-4 text-right">
                                                <button className="text-[#0284c7] hover:text-[#0369a1] font-semibold text-sm">View Schedule</button>
                                            </td>
                                        </tr>
                                    );
                                })
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Create Invoice Modal */}
            {showCreateModal && (
                <div className="fixed inset-0 z-[80] overflow-y-auto">
                    <div className="flex min-h-screen items-center justify-center p-4">
                        <div className="fixed inset-0 bg-gray-800/60 backdrop-blur-sm transition-opacity" onClick={() => setShowCreateModal(false)}></div>
                        <div className="relative w-full max-w-2xl transform overflow-hidden rounded-xl bg-white shadow-2xl transition-all">
                            <div className="border-b border-gray-200 bg-gray-50 px-6 py-4 flex justify-between items-center">
                                <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                                    <Calculator className="h-5 w-5 text-[#0284c7]" /> Generate New Project Invoice
                                </h3>
                                <button onClick={() => setShowCreateModal(false)} className="text-gray-400 hover:text-gray-600"><X className="h-5 w-5" /></button>
                            </div>
                            <div className="px-6 py-6 overflow-y-auto max-h-[80vh]">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    <div className="col-span-full">
                                        <label className="block text-sm font-semibold text-gray-700 mb-2">Select Project</label>
                                        <select
                                            value={newInvoice.projectId}
                                            onChange={(e) => {
                                                const pid = e.target.value;
                                                const proj = projects.find(p => p.id === pid);
                                                setNewInvoice(prev => ({ ...prev, projectId: pid }));
                                            }}
                                            className="block w-full rounded-md border-gray-300 py-3 pl-3 pr-10 text-base focus:border-[#0f172a] focus:outline-none focus:ring-[#0f172a] sm:text-sm border shadow-sm"
                                        >
                                            <option value="">Choose a project...</option>
                                            {projects.map(p => <option key={p.id} value={p.id}>{p.address}</option>)}
                                        </select>
                                    </div>
                                    <div className="col-span-full">
                                        <label className="block text-sm font-semibold text-gray-700 mb-2">Select Builder</label>
                                        <select
                                            value={newInvoice.builderId}
                                            onChange={(e) => setNewInvoice(prev => ({ ...prev, builderId: e.target.value }))}
                                            className="block w-full rounded-md border-gray-300 py-3 pl-3 pr-10 text-base focus:border-[#0f172a] focus:outline-none focus:ring-[#0f172a] sm:text-sm border shadow-sm"
                                        >
                                            <option value="">Choose a builder...</option>
                                            {builders.map(b => <option key={b.id} value={b.id}>{b.companyName}</option>)}
                                        </select>
                                    </div>
                                    <div>
                                        <label className="block text-sm font-semibold text-gray-700 mb-2">Total Project Quote (£)</label>
                                        <div className="relative">
                                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 font-medium">£</span>
                                            <input
                                                type="number"
                                                value={newInvoice.totalQuote}
                                                onChange={(e) => setNewInvoice(prev => ({ ...prev, totalQuote: e.target.value }))}
                                                className="w-full rounded-md border border-gray-300 py-2.5 pl-8 pr-3 text-sm focus:border-[#0f172a] focus:outline-none focus:ring-[#0f172a]"
                                                placeholder="0.00"
                                            />
                                        </div>
                                        <p className="mt-1.5 text-xs text-gray-500 italic">Benchmark Commission (3%): £{((parseFloat(newInvoice.totalQuote) || 0) * 0.03).toFixed(2)}</p>
                                    </div>
                                    <div>
                                        <label className="block text-sm font-semibold text-gray-700 mb-2">Builder 1st Pmt Date</label>
                                        <input
                                            type="date"
                                            value={newInvoice.firstPaymentDate}
                                            onChange={(e) => setNewInvoice(prev => ({ ...prev, firstPaymentDate: e.target.value }))}
                                            className="w-full rounded-md border border-gray-300 py-2.5 px-3 text-sm focus:border-[#0f172a] focus:outline-none focus:ring-[#0f172a]"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-semibold text-gray-700 mb-2">BoE Base Rate (%)</label>
                                        <div className="relative">
                                            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 font-medium">%</span>
                                            <input
                                                type="number"
                                                step="0.01"
                                                value={newInvoice.boeBaseRate}
                                                onChange={(e) => setNewInvoice(prev => ({ ...prev, boeBaseRate: e.target.value }))}
                                                className="w-full rounded-md border border-gray-300 py-2.5 px-3 pr-8 text-sm focus:border-[#0f172a] focus:outline-none focus:ring-[#0f172a]"
                                            />
                                        </div>
                                    </div>
                                </div>
                                <div className="mt-8 p-4 bg-blue-50/50 rounded-xl border border-blue-100">
                                    <h4 className="text-sm font-semibold text-blue-900 mb-3 flex items-center gap-2"><History className="h-4 w-4" /> Generated Schedule Preview</h4>
                                    <div className="space-y-3">
                                        <div className="flex justify-between text-xs font-medium border-b border-blue-100 pb-2">
                                            <span className="text-blue-700">Payment 1 (40%)</span>
                                            <span className="text-blue-900">£{((parseFloat(newInvoice.totalQuote) || 0) * 0.03 * 0.4).toFixed(2)} — Due Date of 1st Pmt</span>
                                        </div>
                                        <div className="flex justify-between text-xs font-medium border-b border-blue-100 pb-2">
                                            <span className="text-blue-700">Payment 2 (40%)</span>
                                            <span className="text-blue-900">£{((parseFloat(newInvoice.totalQuote) || 0) * 0.03 * 0.4).toFixed(2)} — 60 Days After P1</span>
                                        </div>
                                        <div className="flex justify-between text-xs font-medium">
                                            <span className="text-blue-700">Final Payment (20%)</span>
                                            <span className="text-blue-900">£{((parseFloat(newInvoice.totalQuote) || 0) * 0.03 * 0.2).toFixed(2)} — Upon Completion</span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                            <div className="bg-gray-50 px-6 py-4 border-t border-gray-100 flex justify-end gap-3 rounded-b-xl">
                                <button onClick={() => setShowCreateModal(false)} className="rounded-md bg-white px-4 py-2.5 text-sm font-semibold text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 hover:bg-gray-50">Cancel</button>
                                <button onClick={handleCreateInvoice} className="rounded-md bg-[#0f172a] px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-black flex items-center gap-2">
                                    <Save className="h-4 w-4" /> Create & Issue Schedule
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Sidebar for Invoice Details / Payment Recording */}
            <div className={`fixed inset-0 z-[70] bg-black/30 backdrop-blur-sm flex justify-end transition-opacity duration-300 ${selectedInvoice ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`}>
                <div className={`w-full max-w-2xl bg-white h-full shadow-2xl flex flex-col transform transition-transform duration-500 ease-out ${selectedInvoice ? 'translate-x-0' : 'translate-x-full'}`}>
                    {selectedInvoice && (
                        <>
                            <div className="px-6 py-5 border-b border-gray-200 bg-gray-50 flex justify-between items-center shrink-0">
                                <div>
                                    <h2 className="text-xl font-bold text-[#0f172a]">Invoice Schedule</h2>
                                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs sm:text-sm mt-0.5">
                                        <button onClick={(e) => { e.stopPropagation(); navigate(`/projects?id=${selectedInvoice.projectId}`); }} className="text-[#0284c7] hover:underline flex items-center gap-1 font-medium">
                                            <MapPin className="h-3.5 w-3.5" /> Project: {getProjectAddress(selectedInvoice.projectId)}
                                        </button>
                                        <span className="text-gray-300">|</span>
                                        <button onClick={(e) => { e.stopPropagation(); navigate(`/builders?id=${selectedInvoice.builderId}`); }} className="text-[#0284c7] hover:underline flex items-center gap-1 font-medium">
                                            <Building className="h-3.5 w-3.5" /> Builder: {getBuilderName(selectedInvoice.builderId)}
                                        </button>
                                    </div>
                                </div>
                                <button onClick={closeInvoice} className="text-gray-400 hover:text-gray-600 focus:outline-none p-2 rounded-full hover:bg-gray-200 transition-colors">
                                    <X className="h-6 w-6" />
                                </button>
                            </div>
                            <div className="flex-1 overflow-y-auto p-6 space-y-8">
                                <div className="grid grid-cols-3 gap-6">
                                    <div className="bg-gray-50 p-4 rounded-xl border border-gray-100">
                                        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Commission</p>
                                        <p className="text-lg font-bold text-gray-900">£{selectedInvoice.commissionTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
                                    </div>
                                    <div className="bg-gray-50 p-4 rounded-xl border border-gray-100">
                                        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Base Rate</p>
                                        <p className="text-lg font-bold text-gray-900">{selectedInvoice.boeBaseRate}%</p>
                                    </div>
                                    <div className="bg-gray-50 p-4 rounded-xl border border-gray-100">
                                        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Interest Policy</p>
                                        <p className="text-lg font-bold text-blue-600">{selectedInvoice.boeBaseRate + 8}%</p>
                                    </div>
                                </div>

                                <div className="space-y-4">
                                    <h3 className="font-bold text-gray-900 flex items-center gap-2"><Calendar className="h-4 w-4" /> Payment Plan</h3>

                                    {Object.entries(selectedInvoice.payments).map(([id, p]) => {
                                        const interest = calculateInterest(p, selectedInvoice.boeBaseRate);
                                        const totalDue = p.amount + (p.additionalCosts || 0) + interest;
                                        const remaining = totalDue - p.amountPaid;

                                        return (
                                            <div key={id} className={`p-6 rounded-2xl border ${p.status === 'Paid' ? 'bg-green-50/30 border-green-100' : interest > 0 ? 'bg-red-50/30 border-red-200' : 'bg-white border-gray-200 shadow-sm'}`}>
                                                <div className="flex justify-between items-start mb-4">
                                                    <div>
                                                        <h4 className="font-bold text-gray-900 uppercase text-xs tracking-wider">
                                                            {id === 'p1' ? 'First Installment (40%)' : id === 'p2' ? 'Second Installment (40%)' : 'Final Installment (20%)'}
                                                        </h4>
                                                        <div className="mt-1 flex items-center gap-2">
                                                            <Calendar className="h-3.5 w-3.5 text-gray-400" />
                                                            <span className="text-sm font-medium text-gray-600">{p.dueDate ? new Date(p.dueDate).toLocaleDateString() : 'Upon Completion'}</span>
                                                        </div>
                                                    </div>
                                                    <div className="text-right">
                                                        <span className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-[10px] font-bold uppercase border ${p.status === 'Paid' ? 'border-green-200 bg-green-100 text-green-700' :
                                                            interest > 0 ? 'border-red-200 bg-red-100 text-red-600' :
                                                                'border-blue-100 bg-blue-50 text-blue-600'
                                                            }`}>
                                                            {interest > 0 && p.status !== 'Paid' ? 'Overdue' : p.status}
                                                        </span>
                                                    </div>
                                                </div>

                                                <div className="grid grid-cols-2 gap-4">
                                                    <div className="space-y-1">
                                                        <div className="flex justify-between text-xs text-gray-500"><span>Base Amount:</span> <span>£{p.amount.toFixed(2)}</span></div>
                                                        {p.additionalCosts > 0 && <div className="flex justify-between text-xs text-gray-500"><span>Additional Costs:</span> <span>£{p.additionalCosts.toFixed(2)}</span></div>}
                                                        {interest > 0 && <div className="flex justify-between text-xs text-red-600 font-medium"><span>Accrued Interest:</span> <span>£{interest.toFixed(2)}</span></div>}
                                                        <div className="flex justify-between text-sm font-bold border-t border-gray-100 pt-1 mt-1">
                                                            <span>Total Due:</span> <span>£{totalDue.toFixed(2)}</span>
                                                        </div>
                                                    </div>
                                                    <div className="flex flex-col justify-end items-end space-y-1">
                                                        <div className="text-[10px] font-bold text-gray-400 uppercase">Paid to Date</div>
                                                        <div className="text-2xl font-bold text-gray-900">£{p.amountPaid.toFixed(2)}</div>
                                                        <div className="text-xs text-gray-500 italic">Remaining: £{Math.max(0, remaining).toFixed(2)}</div>
                                                    </div>
                                                </div>

                                                {p.status !== 'Paid' && (
                                                    <div className="mt-6 flex justify-end">
                                                        {isRecordingPayment === id ? (
                                                            <div className="flex items-center gap-2 w-full max-w-xs animate-in slide-in-from-right-2 duration-200">
                                                                <div className="relative flex-1">
                                                                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 font-medium text-sm">£</span>
                                                                    <input
                                                                        type="number"
                                                                        value={paymentAmount}
                                                                        onChange={(e) => setPaymentAmount(e.target.value)}
                                                                        className="w-full rounded-lg border border-gray-300 py-2 pl-7 pr-3 text-sm focus:border-[#0f172a] focus:outline-none"
                                                                        placeholder="Amount..."
                                                                        autoFocus
                                                                    />
                                                                </div>
                                                                <button onClick={handleRecordPayment} className="bg-[#0f172a] text-white p-2 rounded-lg hover:bg-black transition-colors"><Save className="h-4 w-4" /></button>
                                                                <button onClick={() => setIsRecordingPayment(null)} className="text-gray-400 hover:text-gray-600 p-2"><X className="h-4 w-4" /></button>
                                                            </div>
                                                        ) : (
                                                            <button
                                                                onClick={() => { setIsRecordingPayment(id); setPaymentAmount(remaining.toFixed(2)); }}
                                                                className="flex items-center gap-2 text-sm font-bold text-[#0284c7] hover:bg-blue-50 px-4 py-2 rounded-xl transition-all"
                                                            >
                                                                <Plus className="h-3 w-3" /> Record Payment
                                                            </button>
                                                        )}
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                                <div className="p-4 bg-orange-50 border border-orange-100 rounded-xl flex gap-3">
                                    <AlertCircle className="h-5 w-5 text-orange-600 shrink-0 mt-0.5" />
                                    <div className="text-xs text-orange-800 space-y-1">
                                        <p className="font-bold uppercase tracking-tight">Interest Policy Reminder</p>
                                        <p>Commission overdue is subject to a <strong>{selectedInvoice.boeBaseRate + 8}%</strong> annual rate (per your agreement of BoE + 8%). This is calculated daily on the remaining balance from the due date until the date paid.</p>
                                    </div>
                                </div>
                            </div>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
};

export default Invoices;
