import { Search, Plus, Loader2, Network, UserPlus, Phone, Mail, Building, Activity, X, Receipt, FileText, ChevronRight, Calculator, Calendar, User } from 'lucide-react';
import { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { db } from '../firebase';
import { collection, query, orderBy, onSnapshot, doc, updateDoc, addDoc, serverTimestamp, getDocs, where } from 'firebase/firestore';

const Builders = () => {
    const [searchParams, setSearchParams] = useSearchParams();
    const navigate = useNavigate();
    const [loading, setLoading] = useState(true);
    const [builders, setBuilders] = useState([]);
    const [searchQuery, setSearchQuery] = useState('');
    const [isAdding, setIsAdding] = useState(false);
    const [isClosingAdd, setIsClosingAdd] = useState(false);
    const [selectedBuilder, setSelectedBuilder] = useState(null);
    const [closingBuilder, setClosingBuilder] = useState(null);
    const [assignedProjects, setAssignedProjects] = useState([]);
    const [relatedInvoices, setRelatedInvoices] = useState([]);
    const [relatedContracts, setRelatedContracts] = useState([]);
    const [loadingRelated, setLoadingRelated] = useState(false);

    // Derived state for animations
    const activeBuilder = selectedBuilder || closingBuilder;
    const showAddForm = isAdding || isClosingAdd;

    // New builder form state
    const [newBuilder, setNewBuilder] = useState({
        companyId: '',
        companyName: '',
        ownerName: '',
        phone: '',
        email: '',
        availability: true,
    });

    useEffect(() => {
        const q = query(collection(db, 'builders'), orderBy('companyName', 'asc'));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const builderData = snapshot.docs.map(doc => ({
                ...doc.data(),
                id: doc.id
            }));
            setBuilders(builderData);
            setLoading(false);
        });

        return () => unsubscribe();
    }, []);

    // Sync state with URL params
    useEffect(() => {
        const id = searchParams.get('id');
        if (id && builders.length > 0) {
            const builder = builders.find(b => b.id === id);
            if (builder) {
                setClosingBuilder(null);
                setSelectedBuilder(builder);
                fetchRelatedData(id);
            }
        } else {
            if (selectedBuilder) {
                setClosingBuilder(selectedBuilder);
                setSelectedBuilder(null);
                setTimeout(() => setClosingBuilder(null), 500);
            }
        }
    }, [searchParams, builders]);

    const fetchRelatedData = async (builderId) => {
        setLoadingRelated(true);
        try {
            // Fetch Assignments
            const asgnQ = query(collection(db, 'assignments'), where('builderId', '==', builderId));
            const asgnSnapshot = await getDocs(asgnQ);
            const assignmentData = asgnSnapshot.docs.map(doc => doc.data());

            // Fetch actual projects for these assignments
            const projects = [];
            for (const assignment of assignmentData) {
                const projectDoc = await getDocs(query(collection(db, 'projects'), where('__name__', '==', assignment.projectId)));
                if (!projectDoc.empty) {
                    projects.push({ ...projectDoc.docs[0].data(), id: projectDoc.docs[0].id, assignmentStatus: assignment.status });
                }
            }
            setAssignedProjects(projects);

            // Fetch Invoices
            const invQ = query(collection(db, 'invoices'), where('builderId', '==', builderId));
            const invSnapshot = await getDocs(invQ);
            setRelatedInvoices(invSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));

            // Fetch Contracts (agreements)
            const conQ = query(collection(db, 'agreements'), where('builderId', '==', builderId));
            const conSnapshot = await getDocs(conQ);
            setRelatedContracts(conSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
        } catch (error) {
            console.error("Error fetching related data for builder:", error);
        } finally {
            setLoadingRelated(false);
        }
    };

    const handleAddBuilder = async (e) => {
        e.preventDefault();
        try {
            await addDoc(collection(db, 'builders'), {
                ...newBuilder,
                createdAt: serverTimestamp()
            });
            setIsAdding(false);
            setNewBuilder({ companyId: '', companyName: '', ownerName: '', phone: '', email: '', availability: true });
        } catch (error) {
            console.error("Error adding builder:", error);
            alert("Failed to add builder");
        }
    };

    const toggleAvailability = async (builderId, currentAvailability) => {
        try {
            const builderRef = doc(db, 'builders', builderId);
            await updateDoc(builderRef, {
                availability: !currentAvailability
            });
        } catch (error) {
            console.error("Error updating availability:", error);
        }
    };

    const openAddBuilder = () => {
        setIsClosingAdd(false);
        setIsAdding(true);
    };

    const closeAddBuilder = () => {
        setIsClosingAdd(true);
        setIsAdding(false);
        setTimeout(() => setIsClosingAdd(false), 500);
    };

    const openBuilder = (builder) => {
        setSearchParams({ id: builder.id });
    };

    const closeBuilder = () => {
        setSearchParams({});
    };

    const filteredBuilders = builders.filter(b =>
        b.companyName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        b.ownerName?.toLowerCase().includes(searchQuery.toLowerCase())
    );

    return (
        <div className="w-full relative flex flex-col h-full overflow-hidden">
            <header className="mb-8 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 shrink-0">
                <div>
                    <h1 className="text-3xl font-semibold tracking-tight">Builders</h1>
                    <p className="mt-2 text-sm text-gray-500">Manage your network of trusted tradespeople.</p>
                </div>
                <button
                    onClick={openAddBuilder}
                    className="flex items-center gap-2 rounded-lg bg-[#0f172a] px-4 py-2.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-black"
                >
                    <UserPlus className="h-4 w-4" />
                    Add Builder
                </button>
            </header>

            <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden flex flex-col min-h-0 flex-1">
                <div className="flex items-center gap-4 border-b border-gray-100 p-4 shrink-0">
                    <div className="relative flex-1 max-w-md">
                        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                        <input
                            type="text"
                            placeholder="Search builders..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full rounded-lg border border-gray-300 py-2.5 pl-10 pr-4 text-sm focus:border-[#0f172a] focus:outline-none focus:ring-1 focus:ring-[#0f172a]"
                        />
                    </div>
                </div>

                <div className="overflow-auto flex-1 relative mini-scroll">
                    <table className="w-full text-left text-sm text-gray-600">
                        <thead className="bg-gray-50 text-xs uppercase text-gray-500 sticky top-0 z-10 shadow-sm border-b border-gray-200">
                            <tr>
                                <th className="px-6 py-4 font-medium">Company ID</th>
                                <th className="px-6 py-4 font-medium">Name & Owner</th>
                                <th className="px-6 py-4 font-medium">Contact</th>
                                <th className="px-6 py-4 font-medium">Availability</th>
                                <th className="px-6 py-4 font-medium text-right">Action</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100 bg-white">
                            {loading ? (
                                <tr>
                                    <td colSpan="5" className="px-6 py-8 text-center text-sm text-gray-500">
                                        <Loader2 className="h-6 w-6 animate-spin mx-auto mb-2 text-gray-400" />
                                        Loading builders...
                                    </td>
                                </tr>
                            ) : filteredBuilders.length === 0 ? (
                                <tr>
                                    <td colSpan="5" className="px-6 py-8 text-center text-sm text-gray-500">
                                        No builders found.
                                    </td>
                                </tr>
                            ) : (
                                filteredBuilders.map((builder) => (
                                    <tr key={builder.id} onClick={() => openBuilder(builder)} className="hover:bg-gray-50/50 cursor-pointer transition-colors group">
                                        <td className="px-6 py-4 font-mono text-xs font-semibold text-[#0f172a]">
                                            {builder.companyId}
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="font-medium text-[#0f172a]">{builder.companyName}</div>
                                            <div className="text-gray-500 flex items-center gap-1 mt-0.5"><User className="h-3 w-3" /> {builder.ownerName}</div>
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="flex items-center gap-2 text-gray-600 mb-1">
                                                <Phone className="h-3 w-3" /> {builder.phone}
                                            </div>
                                            <div className="flex items-center gap-2 text-gray-600">
                                                <Mail className="h-3 w-3" /> {builder.email}
                                            </div>
                                        </td>
                                        <td className="px-6 py-4">
                                            <button
                                                onClick={(e) => { e.stopPropagation(); toggleAvailability(builder.id, builder.availability); }}
                                                className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium border ${builder.availability ? 'border-green-200 bg-green-50 text-green-700 hover:bg-green-100' : 'border-gray-200 bg-gray-50 text-gray-700 hover:bg-gray-100'}`}
                                            >
                                                {builder.availability ? 'Available' : 'Unavailable'}
                                            </button>
                                        </td>
                                        <td className="px-6 py-4 text-right">
                                            <button onClick={(e) => { e.stopPropagation(); openBuilder(builder); }} className="text-[#0284c7] hover:text-[#0369a1] font-semibold text-sm">
                                                View Details
                                            </button>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Slide-over for Builder Details */}
            <div className={`absolute inset-0 z-[60] bg-white flex flex-col transform transition-transform duration-500 ease-out shadow-2xl ${selectedBuilder ? 'translate-x-0' : 'translate-x-full'}`}>
                {activeBuilder && (
                    <>
                        <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center bg-gray-50 shrink-0">
                            <div>
                                <h3 className="text-xl font-semibold text-[#0f172a]">{activeBuilder.companyName}</h3>
                                <p className="text-sm text-gray-500">Builder Profile & Relational View</p>
                            </div>
                            <button onClick={closeBuilder} className="text-gray-400 hover:text-gray-600 focus:outline-none p-2 rounded-full hover:bg-gray-200 transition-colors">
                                <X className="h-6 w-6" />
                            </button>
                        </div>
                        <div className="flex-1 overflow-y-auto px-6 py-8 mini-scroll">
                            <div className="max-w-4xl mx-auto space-y-10 pb-12">
                                <section>
                                    <h4 className="text-sm font-bold text-gray-400 uppercase tracking-widest mb-6">Contact Information</h4>
                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                        <div className="bg-gray-50 p-4 rounded-xl border border-gray-100 flex items-start gap-4">
                                            <div className="h-10 w-10 rounded-full bg-white flex items-center justify-center border border-gray-200 text-blue-600 shadow-sm"><User className="h-5 w-5" /></div>
                                            <div><p className="text-xs font-medium text-gray-500">Contact Person</p><p className="text-sm font-bold text-gray-900">{activeBuilder.ownerName}</p></div>
                                        </div>
                                        <div className="bg-gray-50 p-4 rounded-xl border border-gray-100 flex items-start gap-4">
                                            <div className="h-10 w-10 rounded-full bg-white flex items-center justify-center border border-gray-200 text-green-600 shadow-sm"><Phone className="h-5 w-5" /></div>
                                            <div><p className="text-xs font-medium text-gray-500">Phone</p><a href={`tel:${activeBuilder.phone}`} className="text-sm font-bold text-gray-900 hover:text-blue-600">{activeBuilder.phone}</a></div>
                                        </div>
                                        <div className="bg-gray-50 p-4 rounded-xl border border-gray-100 flex items-start gap-4">
                                            <div className="h-10 w-10 rounded-full bg-white flex items-center justify-center border border-gray-200 text-purple-600 shadow-sm"><Mail className="h-5 w-5" /></div>
                                            <div><p className="text-xs font-medium text-gray-500">Email</p><a href={`mailto:${activeBuilder.email}`} className="text-sm font-bold text-gray-900 hover:text-blue-600 break-all">{activeBuilder.email}</a></div>
                                        </div>
                                    </div>
                                </section>

                                <section className="space-y-6">
                                    <h4 className="text-sm font-bold text-gray-400 uppercase tracking-widest border-b border-gray-100 pb-2">Business Activity & Relationships</h4>
                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                        {/* Projects */}
                                        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
                                            <div className="bg-gray-50 px-4 py-3 border-b border-gray-200 flex items-center justify-between"><span className="text-xs font-bold text-gray-500 uppercase flex items-center gap-2"><Network className="h-3.5 w-3.5" /> Assigned Projects</span><span className="text-xs bg-gray-200 px-2 py-0.5 rounded-full font-bold">{assignedProjects.length}</span></div>
                                            <div className="p-2 space-y-1">
                                                {assignedProjects.length === 0 ? <p className="text-xs text-gray-400 p-4 text-center italic">No projects assigned.</p> : assignedProjects.map(proj => (
                                                    <button key={proj.id} onClick={() => navigate(`/projects?id=${proj.id}`)} className="w-full text-left p-2.5 hover:bg-blue-50 rounded-lg group transition-colors flex items-center justify-between">
                                                        <div className="truncate flex-1"><p className="text-sm font-bold text-gray-900 group-hover:text-blue-700 truncate">{proj.address}</p><p className="text-[10px] text-gray-500 uppercase">{proj.assignmentStatus}</p></div>
                                                        <ChevronRight className="h-4 w-4 text-gray-300 group-hover:text-blue-400" />
                                                    </button>
                                                ))}
                                            </div>
                                        </div>

                                        {/* Invoices */}
                                        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
                                            <div className="bg-gray-50 px-4 py-3 border-b border-gray-200 flex items-center justify-between"><span className="text-xs font-bold text-gray-500 uppercase flex items-center gap-2"><Receipt className="h-3.5 w-3.5" /> Recent Invoices</span><span className="text-xs bg-gray-200 px-2 py-0.5 rounded-full font-bold">{relatedInvoices.length}</span></div>
                                            <div className="p-2 space-y-1">
                                                {relatedInvoices.length === 0 ? <p className="text-xs text-gray-400 p-4 text-center italic">No invoices issued.</p> : relatedInvoices.map(inv => (
                                                    <button key={inv.id} onClick={() => navigate(`/invoices?id=${inv.id}`)} className="w-full text-left p-2.5 hover:bg-blue-50 rounded-lg group transition-colors flex items-center justify-between">
                                                        <div className="truncate flex-1"><p className="text-sm font-bold text-gray-900 group-hover:text-blue-700">£{inv.commissionTotal.toFixed(2)}</p><p className="text-[10px] text-gray-500 uppercase">{inv.status}</p></div>
                                                        <ChevronRight className="h-4 w-4 text-gray-300 group-hover:text-blue-400" />
                                                    </button>
                                                ))}
                                            </div>
                                        </div>

                                        {/* Contracts */}
                                        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
                                            <div className="bg-gray-50 px-4 py-3 border-b border-gray-200 flex items-center justify-between"><span className="text-xs font-bold text-gray-500 uppercase flex items-center gap-2"><FileText className="h-3.5 w-3.5" /> Recent Contracts</span><span className="text-xs bg-gray-200 px-2 py-0.5 rounded-full font-bold">{relatedContracts.length}</span></div>
                                            <div className="p-2 space-y-1">
                                                {relatedContracts.length === 0 ? <p className="text-xs text-gray-400 p-4 text-center italic">No contracts issued.</p> : relatedContracts.map(con => (
                                                    <button key={con.id} onClick={() => navigate(`/contracts?id=${con.id}`)} className="w-full text-left p-2.5 hover:bg-blue-50 rounded-lg group transition-colors flex items-center justify-between">
                                                        <div className="truncate flex-1"><p className="text-sm font-bold text-gray-900 group-hover:text-blue-700">{con.status === 'Signed' ? 'SIGNED' : 'PENDING'}</p><p className="text-[10px] text-gray-500 uppercase">{con.dateIssued ? new Date(con.dateIssued.toDate()).toLocaleDateString() : 'N/A'}</p></div>
                                                        <ChevronRight className="h-4 w-4 text-gray-300 group-hover:text-blue-400" />
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                    </div>
                                </section>
                            </div>
                        </div>
                    </>
                )}
            </div>

            {/* Slide-over for Add Builder */}
            <div className={`absolute inset-0 z-[60] bg-white flex flex-col transform transition-transform duration-500 ease-out shadow-2xl ${isAdding ? 'translate-x-0' : 'translate-x-full'}`}>
                <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center bg-gray-50 shrink-0">
                    <h3 className="text-xl font-semibold text-[#0f172a]">Add New Builder</h3>
                    <button onClick={closeAddBuilder} className="text-gray-400 hover:text-gray-600 focus:outline-none p-2 rounded-full hover:bg-gray-200 transition-colors">
                        <X className="h-6 w-6" />
                    </button>
                </div>
                <div className="flex-1 overflow-y-auto px-6 py-8">
                    <form onSubmit={handleAddBuilder} className="max-w-2xl mx-auto space-y-8 pb-12">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div><label className="block text-sm font-bold text-gray-700 mb-2">Company ID (CRO/UTR)</label><input type="text" required value={newBuilder.companyId} onChange={(e) => setNewBuilder({ ...newBuilder, companyId: e.target.value })} className="w-full rounded-lg border border-gray-300 py-3 px-4 text-sm focus:border-[#0f172a] focus:ring-[#0f172a]" placeholder="e.g. 12345678" /></div>
                            <div><label className="block text-sm font-bold text-gray-700 mb-2">Company Name</label><input type="text" required value={newBuilder.companyName} onChange={(e) => setNewBuilder({ ...newBuilder, companyName: e.target.value })} className="w-full rounded-lg border border-gray-300 py-3 px-4 text-sm focus:border-[#0f172a] focus:ring-[#0f172a]" placeholder="e.g. Acme Construction Ltd" /></div>
                            <div><label className="block text-sm font-bold text-gray-700 mb-2">Contact Person Name</label><input type="text" required value={newBuilder.ownerName} onChange={(e) => setNewBuilder({ ...newBuilder, ownerName: e.target.value })} className="w-full rounded-lg border border-gray-300 py-3 px-4 text-sm focus:border-[#0f172a] focus:ring-[#0f172a]" placeholder="e.g. John Doe" /></div>
                            <div><label className="block text-sm font-bold text-gray-700 mb-2">Phone Number</label><input type="tel" required value={newBuilder.phone} onChange={(e) => setNewBuilder({ ...newBuilder, phone: e.target.value })} className="w-full rounded-lg border border-gray-300 py-3 px-4 text-sm focus:border-[#0f172a] focus:ring-[#0f172a]" placeholder="e.g. +44 20 1234 5678" /></div>
                            <div className="md:col-span-2"><label className="block text-sm font-bold text-gray-700 mb-2">Email Address</label><input type="email" required value={newBuilder.email} onChange={(e) => setNewBuilder({ ...newBuilder, email: e.target.value })} className="w-full rounded-lg border border-gray-300 py-3 px-4 text-sm focus:border-[#0f172a] focus:ring-[#0f172a]" placeholder="e.g. billing@acme.com" /></div>
                        </div>
                        <div className="bg-gray-50 p-6 rounded-xl border border-gray-100 flex items-center justify-between"><div><h4 className="text-sm font-bold text-gray-900">Current Availability</h4><p className="text-xs text-gray-500">Is this builder currently looking for new projects?</p></div><button type="button" onClick={() => setNewBuilder({ ...newBuilder, availability: !newBuilder.availability })} className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${newBuilder.availability ? 'bg-green-600' : 'bg-gray-200'}`}><span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${newBuilder.availability ? 'translate-x-5' : 'translate-x-0'}`} /></button></div>
                        <div className="pt-6 border-t border-gray-100 flex justify-end gap-3"><button type="button" onClick={closeAddBuilder} className="px-6 py-2.5 text-sm font-semibold border rounded-lg hover:bg-gray-50">Cancel</button><button type="submit" className="bg-[#0f172a] text-white px-10 py-2.5 rounded-lg text-sm font-bold hover:bg-black">Add Builder</button></div>
                    </form>
                </div>
            </div>
        </div>
    );
};

export default Builders;
