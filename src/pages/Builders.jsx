import { Search, Plus, Loader2, Network, UserPlus, Phone, Mail, Building, Activity, X } from 'lucide-react';
import { useState, useEffect } from 'react';
import { db } from '../firebase';
import { collection, query, orderBy, onSnapshot, doc, updateDoc, addDoc, serverTimestamp, getDocs, where } from 'firebase/firestore';

const Builders = () => {
    const [loading, setLoading] = useState(true);
    const [builders, setBuilders] = useState([]);
    const [searchQuery, setSearchQuery] = useState('');
    const [isAdding, setIsAdding] = useState(false);
    const [selectedBuilder, setSelectedBuilder] = useState(null);
    const [assignedProjects, setAssignedProjects] = useState([]);

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

    // Load assigned projects when a builder is selected
    useEffect(() => {
        if (!selectedBuilder) {
            setAssignedProjects([]);
            return;
        }

        const fetchAssignments = async () => {
            const q = query(collection(db, 'assignments'), where('builderId', '==', selectedBuilder.id));
            const snapshot = await getDocs(q);
            const assignmentData = snapshot.docs.map(doc => doc.data());

            // Now fetch the actual projects
            const projects = [];
            for (const assignment of assignmentData) {
                const projectDoc = await getDocs(query(collection(db, 'projects'), where('__name__', '==', assignment.projectId)));
                if (!projectDoc.empty) {
                    projects.push({ ...projectDoc.docs[0].data(), id: projectDoc.docs[0].id, assignmentStatus: assignment.status });
                }
            }
            setAssignedProjects(projects);
        };

        fetchAssignments();
    }, [selectedBuilder]);

    const filteredBuilders = builders.filter(b =>
        b.companyName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        b.ownerName?.toLowerCase().includes(searchQuery.toLowerCase())
    );

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

    return (
        <div className="w-full relative flex flex-col h-full overflow-hidden">
            <header className="mb-8 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 shrink-0">
                <div>
                    <h1 className="text-3xl font-semibold tracking-tight">Builders</h1>
                    <p className="mt-2 text-sm text-gray-500">Manage your network of trusted tradespeople.</p>
                </div>
                <button
                    onClick={() => setIsAdding(true)}
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

                <div className="overflow-auto flex-1 relative">
                    <table className="w-full text-left text-sm text-gray-600">
                        <thead className="bg-gray-50/50 text-xs uppercase text-gray-500 sticky top-0 z-10 shadow-sm">
                            <tr>
                                <th className="px-6 py-4 font-medium border-b border-gray-200">Company ID</th>
                                <th className="px-6 py-4 font-medium border-b border-gray-200">Name & Owner</th>
                                <th className="px-6 py-4 font-medium border-b border-gray-200">Contact</th>
                                <th className="px-6 py-4 font-medium border-b border-gray-200">Availability</th>
                                <th className="px-6 py-4 font-medium border-b border-gray-200 text-right">Action</th>
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
                                    <tr key={builder.id} className="hover:bg-gray-50/50 transition-colors">
                                        <td className="px-6 py-4 font-mono text-xs font-semibold text-[#0f172a]">
                                            {builder.companyId}
                                        </td>
                                        <td className="px-6 py-4 cursor-pointer" onClick={() => setSelectedBuilder(builder)}>
                                            <div className="font-medium text-[#0f172a]">{builder.companyName}</div>
                                            <div className="text-gray-500 flex items-center gap-1 mt-0.5"><UserPlus className="h-3 w-3" /> {builder.ownerName}</div>
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
                                                onClick={() => toggleAvailability(builder.id, builder.availability)}
                                                className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium border ${builder.availability ? 'border-green-200 bg-green-50 text-green-700 hover:bg-green-100' : 'border-gray-200 bg-gray-50 text-gray-700 hover:bg-gray-100'}`}
                                            >
                                                {builder.availability ? 'Available' : 'Unavailable'}
                                            </button>
                                        </td>
                                        <td className="px-6 py-4 text-right">
                                            <button
                                                onClick={() => setSelectedBuilder(builder)}
                                                className="text-[#0284c7] hover:text-[#0369a1] font-medium text-sm"
                                            >
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

            {/* Add Builder Modal */}
            {isAdding && (
                <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-gray-500 bg-opacity-75">
                    <div className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden">
                        <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center bg-gray-50">
                            <h3 className="text-lg font-semibold text-[#0f172a]">Add New Builder</h3>
                            <button onClick={() => setIsAdding(false)} className="text-gray-400 hover:text-gray-600">
                                <X className="h-5 w-5" />
                            </button>
                        </div>
                        <form onSubmit={handleAddBuilder} className="p-6 space-y-4">
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Company ID (3-letter)</label>
                                    <input required type="text" maxLength={3} value={newBuilder.companyId} onChange={e => setNewBuilder({ ...newBuilder, companyId: e.target.value.toUpperCase() })} className="w-full rounded-md border-gray-300 shadow-sm focus:border-[#0f172a] focus:ring-[#0f172a] sm:text-sm uppercase p-2 border" placeholder="ABC" />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Company Name</label>
                                    <input required type="text" value={newBuilder.companyName} onChange={e => setNewBuilder({ ...newBuilder, companyName: e.target.value })} className="w-full rounded-md border-gray-300 shadow-sm focus:border-[#0f172a] focus:ring-[#0f172a] sm:text-sm p-2 border" />
                                </div>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Owner Name</label>
                                <input required type="text" value={newBuilder.ownerName} onChange={e => setNewBuilder({ ...newBuilder, ownerName: e.target.value })} className="w-full rounded-md border-gray-300 shadow-sm focus:border-[#0f172a] focus:ring-[#0f172a] sm:text-sm p-2 border" />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
                                    <input required type="tel" value={newBuilder.phone} onChange={e => setNewBuilder({ ...newBuilder, phone: e.target.value })} className="w-full rounded-md border-gray-300 shadow-sm focus:border-[#0f172a] focus:ring-[#0f172a] sm:text-sm p-2 border" />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                                    <input required type="email" value={newBuilder.email} onChange={e => setNewBuilder({ ...newBuilder, email: e.target.value })} className="w-full rounded-md border-gray-300 shadow-sm focus:border-[#0f172a] focus:ring-[#0f172a] sm:text-sm p-2 border" />
                                </div>
                            </div>
                            <div className="flex items-center gap-2 mt-4 pt-4 border-t border-gray-100">
                                <input type="checkbox" id="availability" checked={newBuilder.availability} onChange={e => setNewBuilder({ ...newBuilder, availability: e.target.checked })} className="rounded border-gray-300 text-[#0f172a] focus:ring-[#0f172a]" />
                                <label htmlFor="availability" className="text-sm font-medium text-gray-700">Currently Available</label>
                            </div>
                            <div className="mt-6 flex justify-end gap-3">
                                <button type="button" onClick={() => setIsAdding(false)} className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50">Cancel</button>
                                <button type="submit" className="px-4 py-2 text-sm font-medium text-white bg-[#0f172a] border border-transparent rounded-md hover:bg-black">Add Builder</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Slide-over Panel for Builder Profile */}
            {selectedBuilder && (
                <div className="fixed inset-0 z-[60] overflow-hidden" aria-labelledby="slide-over-title" role="dialog" aria-modal="true">
                    <div className="absolute inset-0 overflow-hidden">
                        <div className="absolute inset-0 bg-gray-500 bg-opacity-75 transition-opacity" aria-hidden="true" onClick={() => setSelectedBuilder(null)}></div>
                        <div className="pointer-events-none fixed inset-y-0 right-0 flex max-w-full md:pl-10">
                            <div className="pointer-events-auto w-screen max-w-md transform transition-transform">
                                <div className="flex h-full flex-col overflow-y-scroll bg-white shadow-xl">
                                    <div className="px-4 py-6 sm:px-6 bg-[#0f172a] text-white flex justify-between items-center">
                                        <div>
                                            <div className="flex items-center gap-2">
                                                <h2 className="text-lg font-semibold" id="slide-over-title">{selectedBuilder.companyName}</h2>
                                                <span className="bg-white/20 px-2 py-0.5 rounded text-xs font-mono">{selectedBuilder.companyId}</span>
                                            </div>
                                            <p className="text-sm text-gray-300 mt-1">{selectedBuilder.ownerName}</p>
                                        </div>
                                        <button onClick={() => setSelectedBuilder(null)} className="rounded-md text-gray-300 hover:text-white focus:outline-none">
                                            <span className="sr-only">Close panel</span>
                                            <X className="h-6 w-6" />
                                        </button>
                                    </div>
                                    <div className="relative flex-1 px-4 py-6 sm:px-6 space-y-6">
                                        <div>
                                            <h3 className="text-sm font-medium text-gray-500 mb-3">Contact Information</h3>
                                            <div className="space-y-3">
                                                <p className="text-sm text-gray-900 flex items-center gap-2">
                                                    <Phone className="h-4 w-4 text-gray-400" /> {selectedBuilder.phone}
                                                </p>
                                                <p className="text-sm text-gray-900 flex items-center gap-2">
                                                    <Mail className="h-4 w-4 text-gray-400" /> {selectedBuilder.email}
                                                </p>
                                            </div>
                                        </div>
                                        <hr className="border-gray-100" />
                                        <div>
                                            <h3 className="text-sm font-medium text-gray-500 mb-3">Assigned Projects</h3>
                                            {assignedProjects.length === 0 ? (
                                                <p className="text-sm text-gray-500 italic">No projects assigned yet.</p>
                                            ) : (
                                                <ul className="space-y-3">
                                                    {assignedProjects.map(project => (
                                                        <li key={project.id} className="bg-gray-50 p-3 rounded-lg border border-gray-100">
                                                            <div className="font-medium text-sm text-[#0f172a]">{project.address}</div>
                                                            <div className="text-xs text-gray-500 mt-1 flex justify-between">
                                                                <span>Status: {project.status}</span>
                                                                <span className={`font-medium ${project.assignmentStatus === 'Accepted' ? 'text-green-600' : project.assignmentStatus === 'Pending' ? 'text-yellow-600' : 'text-gray-600'}`}>
                                                                    {project.assignmentStatus}
                                                                </span>
                                                            </div>
                                                        </li>
                                                    ))}
                                                </ul>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default Builders;
