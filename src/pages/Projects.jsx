import { Search, Plus, Loader2, Network, UserPlus, Phone, Mail, Building, Activity, X, MapPin, ExternalLink, ClipboardList, ChevronLeft, ChevronRight, Filter, Receipt, FileText, User, Map as MapIcon, List, Users, Save, CheckCircle2, ArrowUpDown, Archive } from 'lucide-react';
import { useState, useEffect } from 'react';
import { useSearchParams, useNavigate, useLocation } from 'react-router-dom';
import { db } from '../firebase';
import { collection, query, orderBy, onSnapshot, doc, updateDoc, addDoc, serverTimestamp, where, writeBatch, limit, getDocs } from 'firebase/firestore';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';

// Fix for default marker icons in React Leaflet
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
    iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
    iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
    shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

const generateWBDates = (weeksBack = 52) => {
    const dates = [];
    const now = new Date();
    const day = now.getDay();
    const diffToAdd = day === 0 ? -6 : 1 - day;
    const currentMonday = new Date(now.getTime() + diffToAdd * 24 * 60 * 60 * 1000);

    const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

    for (let i = 0; i < weeksBack; i++) {
        const monday = new Date(currentMonday.getTime() - (i * 7 * 24 * 60 * 60 * 1000));
        const dayStr = String(monday.getDate()).padStart(2, '0');
        const monthStr = monthNames[monday.getMonth()];
        const yearStr = monday.getFullYear();
        dates.push(`${dayStr} ${monthStr} ${yearStr}`);
    }
    return dates;
};

const Projects = () => {
    const [searchParams, setSearchParams] = useSearchParams();
    const navigate = useNavigate();
    const location = useLocation();

    const [loading, setLoading] = useState(true);
    const [projects, setProjects] = useState([]);
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedProject, setSelectedProject] = useState(null);
    const [closingProject, setClosingProject] = useState(null);
    const activeProject = selectedProject || closingProject;

    const [editNotes, setEditNotes] = useState('');
    const [editStatus, setEditStatus] = useState('');

    // Related data for active project
    const [relatedInvoices, setRelatedInvoices] = useState([]);
    const [relatedContracts, setRelatedContracts] = useState([]);
    const [loadingRelated, setLoadingRelated] = useState(false);

    // Auto-detect viewMode from routing
    const initialViewMode = location.pathname === '/map' ? 'map' : 'list';
    const [viewMode, setViewMode] = useState(initialViewMode);

    const [syncing, setSyncing] = useState(false);
    const [syncStatus, setSyncStatus] = useState(null);
    const [syncReport, setSyncReport] = useState(null);

    const [showSyncModal, setShowSyncModal] = useState(false);
    const [selectedSyncDate, setSelectedSyncDate] = useState('current');
    const syncDates = generateWBDates(52);

    const [builders, setBuilders] = useState([]);
    const [projectAssignments, setProjectAssignments] = useState([]);
    const [selectedBuilderToAssign, setSelectedBuilderToAssign] = useState('');

    const [sortBy, setSortBy] = useState('dateDecidedDesc');
    const STATUS_OPTIONS = ['New', 'Pack Required', 'Pack Created', 'Pack Sent', 'Quoted', 'Won', 'Paid', 'Revisit', 'Archive'];
    const [filterStatus, setFilterStatus] = useState('All');
    const [showArchive, setShowArchive] = useState(false);
    const [currentPage, setCurrentPage] = useState(1);
    const itemsPerPage = 20;

    const [selectedRowIds, setSelectedRowIds] = useState([]);
    const [batchCollectionName, setBatchCollectionName] = useState('');

    useEffect(() => {
        setViewMode(location.pathname === '/map' ? 'map' : 'list');
    }, [location.pathname]);

    useEffect(() => {
        const q = query(collection(db, 'projects'), orderBy('timestamp', 'desc'));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const projectData = snapshot.docs.map(doc => ({
                ...doc.data(),
                id: doc.id
            }));
            setProjects(projectData);
            setLoading(false);
        });

        return () => unsubscribe();
    }, []);

    // Sync state with URL params
    useEffect(() => {
        const id = searchParams.get('id');
        if (id && projects.length > 0) {
            const project = projects.find(p => p.id === id);
            if (project) {
                setClosingProject(null);
                setSelectedProject(project);
                setEditNotes(project.notes || '');
                setEditStatus(project.status || 'New');
                fetchRelatedData(id);
            }
        } else {
            if (setSelectedProject) {
                setClosingProject(selectedProject);
                setSelectedProject(null);
                setTimeout(() => setClosingProject(null), 500);
            }
        }
    }, [searchParams, projects]);

    const fetchRelatedData = async (projectId) => {
        setLoadingRelated(true);
        try {
            const invQ = query(collection(db, 'invoices'), where('projectId', '==', projectId));
            const invSnapshot = await getDocs(invQ);
            setRelatedInvoices(invSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));

            const conQ = query(collection(db, 'agreements'), where('projectId', '==', projectId));
            const conSnapshot = await getDocs(conQ);
            setRelatedContracts(conSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
        } catch (error) {
            console.error("Error fetching related data:", error);
        } finally {
            setLoadingRelated(false);
        }
    };

    const openProject = (project) => {
        setSearchParams({ id: project.id });
    };

    const closeProject = () => {
        setSearchParams({});
    };

    // Fetch all builders for assignments
    useEffect(() => {
        const q = query(collection(db, 'builders'), orderBy('companyName', 'asc'));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const builderData = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id }));
            setBuilders(builderData);
        });
        return () => unsubscribe();
    }, []);

    // Fetch assignments when a project is selected
    useEffect(() => {
        if (!selectedProject) {
            setProjectAssignments([]);
            return;
        }

        const q = query(collection(db, 'assignments'), where('projectId', '==', selectedProject.id));
        const unsubscribe = onSnapshot(q, async (snapshot) => {
            const assignmentData = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id }));
            setProjectAssignments(assignmentData);
        });

        return () => unsubscribe();
    }, [selectedProject]);

    useEffect(() => {
        setCurrentPage(1);
    }, [searchQuery, filterStatus, sortBy]);

    let filteredProjects = projects.filter(p => {
        const searchTerms = searchQuery.toLowerCase();
        const matchesSearch = p.address?.toLowerCase().includes(searchTerms) ||
            p.description?.toLowerCase().includes(searchTerms) ||
            p.collectionId?.toLowerCase().includes(searchTerms) ||
            p.homeownerName?.toLowerCase().includes(searchTerms) ||
            p.reference?.toLowerCase().includes(searchTerms) ||
            p.applicationStatus?.toLowerCase().includes(searchTerms) ||
            p.homeownerEmail?.toLowerCase().includes(searchTerms);

        const matchesStatus = filterStatus === 'All'
            ? (showArchive ? true : p.status !== 'Archive')
            : p.status === filterStatus;
        return matchesSearch && matchesStatus;
    });

    filteredProjects.sort((a, b) => {
        if (sortBy === 'dateDecidedDesc') {
            return new Date(b.dateDecided || 0) - new Date(a.dateDecided || 0);
        } else if (sortBy === 'dateDecidedAsc') {
            return new Date(a.dateDecided || 0) - new Date(b.dateDecided || 0);
        } else if (sortBy === 'status') {
            return (a.status || '').localeCompare(b.status || '');
        }
        return 0;
    });

    const totalPages = Math.ceil(filteredProjects.length / itemsPerPage);
    const paginatedProjects = viewMode === 'list'
        ? filteredProjects.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage)
        : filteredProjects;

    const saveProjectDetails = async () => {
        if (!selectedProject) return;
        try {
            const projectRef = doc(db, 'projects', selectedProject.id);
            await updateDoc(projectRef, {
                notes: editNotes,
                status: editStatus
            });
            closeProject();
        } catch (error) {
            console.error("Error updating project:", error);
            alert("Failed to save project details.");
        }
    };

    const assignLead = async () => {
        if (!selectedProject || !selectedBuilderToAssign) return;

        if (projectAssignments.some(assign => assign.builderId === selectedBuilderToAssign)) {
            alert("This project is already assigned to that builder.");
            return;
        }

        try {
            await addDoc(collection(db, 'assignments'), {
                projectId: selectedProject.id,
                builderId: selectedBuilderToAssign,
                dateAssigned: serverTimestamp(),
                status: 'Pending'
            });
            setSelectedBuilderToAssign('');
            setEditStatus('Assigned');
        } catch (error) {
            console.error("Error assigning lead:", error);
            alert("Failed to assign lead.");
        }
    };

    const toggleRowSelect = (e, id) => {
        if (selectedRowIds.includes(id)) {
            setSelectedRowIds(selectedRowIds.filter(rid => rid !== id));
        } else {
            setSelectedRowIds([...selectedRowIds, id]);
        }
    };

    const handleBatchCollect = async () => {
        if (selectedRowIds.length === 0 || !batchCollectionName.trim()) return;
        try {
            const batch = writeBatch(db);
            selectedRowIds.forEach(id => {
                const ref = doc(db, 'projects', id);
                batch.update(ref, { collectionId: batchCollectionName });
            });
            await batch.commit();
            setSelectedRowIds([]);
            setBatchCollectionName('');
        } catch (error) {
            console.error("Batch collection update error:", error);
            alert("Failed to update collection.");
        }
    };

    const handleBatchStatusUpdate = async (status) => {
        if (selectedRowIds.length === 0 || !status) return;
        try {
            const batch = writeBatch(db);
            selectedRowIds.forEach(id => {
                const ref = doc(db, 'projects', id);
                batch.update(ref, { status: status });
            });
            await batch.commit();
            setSelectedRowIds([]);
        } catch (error) {
            console.error("Batch status update error:", error);
            alert("Failed to update status.");
        }
    };

    const triggerSync = async () => {
        setSyncing(true);
        setSyncStatus('waiting');
        setSyncReport(null);
        setShowSyncModal(false);
        try {
            const response = await fetch('https://europe-west2-benchmark-intelligence-a5b7c.cloudfunctions.net/scraper', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    targetWeek: selectedSyncDate === 'current' ? null : selectedSyncDate
                })
            });

            if (!response.ok) throw new Error(`Network response was not ok: ${response.statusText}`);

            const result = await response.json();
            if (result.success) {
                setSyncReport(result.data);
                setSyncStatus('success');
            } else {
                throw new Error(result.error || 'Unknown error');
            }
        } catch (error) {
            console.error("Sync error:", error);
            setSyncStatus('error');
        } finally {
            setSyncing(false);
        }
    };

    return (
        <div className="w-full relative flex flex-col h-full overflow-hidden">
            <header className="mb-6 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 shrink-0">
                <div>
                    <h1 className="text-3xl font-semibold tracking-tight text-[#0f172a]">Projects</h1>
                    <p className="mt-1.5 text-sm text-gray-500">Track and manage planning application leads.</p>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                    <div className="flex rounded-lg border border-gray-200 p-1 bg-gray-50/50 mr-2">
                        <button onClick={() => navigate('/projects')} className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-md transition-all ${viewMode === 'list' ? 'bg-white text-[#0f172a] shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
                            <List className="h-3.5 w-3.5" /> List
                        </button>
                        <button onClick={() => navigate('/map')} className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-md transition-all ${viewMode === 'map' ? 'bg-white text-[#0f172a] shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
                            <MapIcon className="h-3.5 w-3.5" /> Map
                        </button>
                    </div>
                    <button
                        onClick={() => setShowArchive(!showArchive)}
                        className={`flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium transition-all border ${showArchive ? 'bg-amber-50 border-amber-200 text-amber-700 shadow-inner' : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50 shadow-sm'}`}
                    >
                        <Archive className={`h-4 w-4 ${showArchive ? 'text-amber-500' : 'text-gray-400'}`} />
                        {showArchive ? 'Showing Archive' : 'View Archive'}
                    </button>
                    <button onClick={() => setShowSyncModal(true)} disabled={syncing} className="flex items-center gap-2 rounded-lg bg-[#0f172a] px-4 py-2.5 text-sm font-medium text-white shadow-sm transition-all hover:bg-black disabled:opacity-50">
                        {syncing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Activity className="h-4 w-4 text-blue-400" />}
                        {syncing ? 'Scraping...' : 'Sync Data'}
                    </button>
                </div>
            </header>

            {syncStatus && (
                <div className={`mb-6 p-4 rounded-xl border flex items-center justify-between animate-in fade-in slide-in-from-top-2 duration-300 ${syncStatus === 'success' ? 'bg-green-50 border-green-100 text-green-800' : syncStatus === 'error' ? 'bg-red-50 border-red-100 text-red-800' : 'bg-blue-50 border-blue-100 text-blue-800'}`}>
                    <div className="flex items-center gap-3">
                        {syncStatus === 'success' ? <CheckCircle2 className="h-5 w-5 text-green-500" /> : <Activity className="h-5 w-5 animate-pulse text-blue-500" />}
                        <div>
                            <p className="text-sm font-bold">{syncStatus === 'success' ? 'Sync Complete' : syncStatus === 'error' ? 'Sync Failed' : 'Sync in progress...'}</p>
                            {syncReport && <p className="text-xs mt-0.5 opacity-90">Added {syncReport.added} new projects, skipped {syncReport.skipped} existing.</p>}
                        </div>
                    </div>
                    <button onClick={() => setSyncStatus(null)} className="p-1 hover:bg-black/5 rounded-full"><X className="h-4 w-4" /></button>
                </div>
            )}

            <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden flex flex-col flex-1 min-h-0 relative z-0">
                <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 border-b border-gray-100 p-4 bg-white shrink-0">
                    <div className="relative flex-1 w-full max-w-sm">
                        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                        <input
                            type="text"
                            placeholder="Search by address, description, name..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full rounded-lg border border-gray-300 py-2.5 pl-10 pr-4 text-sm focus:border-[#0f172a] focus:outline-none focus:ring-1 focus:ring-[#0f172a]"
                        />
                    </div>
                    <div className="flex items-center gap-3 w-full sm:w-auto">
                        <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} className="rounded-lg border border-gray-300 py-2.5 px-3 text-sm focus:border-[#0f172a] focus:outline-none bg-white">
                            <option value="All">All Statuses</option>
                            {STATUS_OPTIONS.map(status => (
                                <option key={status} value={status}>{status}</option>
                            ))}
                        </select>
                        <select value={sortBy} onChange={(e) => setSortBy(e.target.value)} className="rounded-lg border border-gray-300 py-2.5 px-3 text-sm focus:border-[#0f172a] focus:outline-none bg-white">
                            <option value="dateDecidedDesc">Decided (Newest)</option>
                            <option value="dateDecidedAsc">Decided (Oldest)</option>
                            <option value="status">Status</option>
                        </select>
                    </div>
                </div>

                {selectedRowIds.length > 0 && (
                    <div className="bg-blue-50/50 px-4 py-3 border-b border-blue-100 flex items-center justify-between animate-in slide-in-from-left-2 duration-200">
                        <div className="flex items-center gap-3">
                            <span className="text-sm font-bold text-blue-900">{selectedRowIds.length} projects selected</span>
                            <div className="flex gap-4">
                                <div className="flex gap-2 items-center">
                                    <input
                                        type="text"
                                        placeholder="Collection..."
                                        value={batchCollectionName}
                                        onChange={(e) => setBatchCollectionName(e.target.value)}
                                        className="rounded border border-blue-200 px-3 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-blue-400 w-32"
                                    />
                                    <button onClick={handleBatchCollect} className="bg-blue-600 text-white px-3 py-1.5 rounded text-xs font-bold hover:bg-blue-700">Apply</button>
                                </div>
                                <div className="h-6 w-px bg-blue-200"></div>
                                <div className="flex gap-2 items-center">
                                    <select
                                        onChange={(e) => handleBatchStatusUpdate(e.target.value)}
                                        className="rounded border border-blue-200 px-3 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-blue-400 bg-white"
                                        defaultValue=""
                                    >
                                        <option value="" disabled>Update Status...</option>
                                        {STATUS_OPTIONS.map(status => (
                                            <option key={status} value={status}>{status}</option>
                                        ))}
                                    </select>
                                </div>
                            </div>
                        </div>
                        <button onClick={() => setSelectedRowIds([])} className="text-blue-600 font-bold text-xs hover:underline">Clear Selection</button>
                    </div>
                )}

                {viewMode === 'list' ? (
                    <>
                        <div className="flex-1 overflow-auto mini-scroll">
                            <table className="w-full text-left text-sm text-gray-600">
                                <thead className="bg-gray-50 text-xs uppercase text-gray-500 sticky top-0 z-10 shadow-sm border-b border-gray-200">
                                    <tr>
                                        <th className="px-6 py-4 w-10 text-center"><input type="checkbox" onChange={(e) => e.target.checked ? setSelectedRowIds(filteredProjects.map(p => p.id)) : setSelectedRowIds([])} checked={selectedRowIds.length === filteredProjects.length && filteredProjects.length > 0} className="rounded border-gray-300 text-[#0f172a] focus:ring-[#0f172a]" /></th>
                                        <th className="px-6 py-4 font-medium">Address</th>
                                        <th className="px-6 py-4 font-medium">Description</th>
                                        <th className="px-6 py-4 font-medium w-32">Status</th>
                                        <th className="px-6 py-4 font-medium w-32">Decided</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100 bg-white">
                                    {loading ? (
                                        <tr><td colSpan="5" className="px-6 py-8 text-center text-sm text-gray-500"><Loader2 className="h-6 w-6 animate-spin mx-auto mb-2 text-gray-400" />Loading projects...</td></tr>
                                    ) : filteredProjects.length === 0 ? (
                                        <tr><td colSpan="5" className="px-6 py-8 text-center text-sm text-gray-500">No projects found matching your criteria.</td></tr>
                                    ) : (
                                        paginatedProjects.map((project) => (
                                            <tr key={project.id} onClick={() => openProject(project)} className={`hover:bg-gray-50/50 cursor-pointer transition-colors ${selectedRowIds.includes(project.id) ? 'bg-blue-50/30' : ''}`}>
                                                <td className="px-6 py-4 text-center" onClick={(e) => { e.stopPropagation(); toggleRowSelect(e, project.id); }}>
                                                    <input type="checkbox" className="rounded border-gray-300 text-[#0f172a] focus:ring-[#0f172a]" checked={selectedRowIds.includes(project.id)} onChange={e => { }} />
                                                </td>
                                                <td className="px-6 py-4 font-medium text-[#0f172a]">
                                                    {project.address}
                                                    {project.collectionId && <div className="text-xs text-blue-600 font-normal mt-1 flex items-center gap-1"><Filter className="h-3 w-3" /> {project.collectionId}</div>}
                                                </td>
                                                <td className="px-6 py-4 truncate max-w-xs" title={project.description}>{project.description}</td>
                                                <td className="px-6 py-4">
                                                    <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium border ${project.status === 'Won' ? 'border-green-200 bg-green-50 text-green-700' :
                                                        project.status === 'Archive' ? 'border-gray-200 bg-gray-50 text-gray-700' :
                                                            project.status === 'Paid' ? 'border-purple-200 bg-purple-50 text-purple-700' :
                                                                project.status === 'Quoted' ? 'border-blue-200 bg-blue-50 text-blue-700' :
                                                                    'border-yellow-200 bg-yellow-50 text-yellow-700'
                                                        }`}>{project.status || 'New'}</span>
                                                </td>
                                                <td className="px-6 py-4 whitespace-nowrap text-gray-500">{project.dateDecided ? new Date(project.dateDecided).toLocaleDateString() : 'N/A'}</td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>

                        {totalPages > 1 && (
                            <div className="flex items-center justify-between border-t border-gray-200 bg-gray-50 px-4 py-3 sm:px-6 shrink-0">
                                <span className="text-sm text-gray-700">Showing <span className="font-medium">{(currentPage - 1) * itemsPerPage + 1}</span> to <span className="font-medium">{Math.min(currentPage * itemsPerPage, filteredProjects.length)}</span> of <span className="font-medium">{filteredProjects.length}</span> results</span>
                                <div className="flex gap-2">
                                    <button onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1} className="relative inline-flex items-center rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 disabled:opacity-50"><ChevronLeft className="h-4 w-4 mr-1" /> Prev</button>
                                    <button onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages} className="relative inline-flex items-center rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 disabled:opacity-50">Next <ChevronRight className="h-4 w-4 ml-1" /></button>
                                </div>
                            </div>
                        )}
                    </>
                ) : (
                    <div className="flex-1 w-full relative z-0 min-h-0">
                        <MapContainer
                            center={selectedProject?.coordinates?.lat ? [selectedProject.coordinates.lat, selectedProject.coordinates.lng] : [53.9591, -1.0815]}
                            zoom={selectedProject ? 16 : 13}
                            style={{ height: '100%', width: '100%' }}
                        >
                            <TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
                            {filteredProjects.filter(p => p.coordinates?.lat && p.coordinates?.lng).map(project => (
                                <Marker key={project.id} position={[project.coordinates.lat, project.coordinates.lng]} eventHandlers={{ click: () => openProject(project) }}>
                                    <Popup>
                                        <div className="p-1 space-y-1">
                                            <p className="font-bold text-sm text-[#0f172a]">{project.address}</p>
                                            {project.collectionId && <p className="text-xs text-blue-600 font-medium">{project.collectionId}</p>}
                                            <p className="text-xs text-gray-600 line-clamp-2">{project.description}</p>
                                            <p className="text-xs font-semibold mt-1">Status: {project.status}</p>
                                        </div>
                                    </Popup>
                                </Marker>
                            ))}
                        </MapContainer>
                    </div>
                )}
            </div>

            <div className={`absolute inset-0 z-[60] bg-white flex flex-col transform transition-transform duration-500 ease-out shadow-2xl ${selectedProject ? 'translate-x-0' : 'translate-x-full'}`}>
                {activeProject && (
                    <>
                        <div className="px-6 py-4 border-b border-gray-200 bg-gray-50 flex justify-between items-center shrink-0">
                            <div>
                                <h2 className="text-xl font-semibold text-[#0f172a]">Project Details</h2>
                                <p className="text-sm text-gray-500 mt-0.5">{activeProject.id}</p>
                            </div>
                            <button onClick={closeProject} className="text-gray-400 hover:text-gray-600 focus:outline-none p-2 rounded-full hover:bg-gray-200 transition-colors"><X className="h-6 w-6" /></button>
                        </div>
                        <div className="flex-1 overflow-y-auto px-4 sm:px-8 py-8 bg-white mini-scroll">
                            <div className="max-w-4xl mx-auto space-y-8 pb-12">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                    <div>
                                        <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wider">Address</h3>
                                        <p className="mt-2 text-base text-gray-900 flex items-start gap-2 font-medium"><MapPin className="h-5 w-5 mt-0.5 text-[#0284c7] shrink-0" />{activeProject.address}</p>
                                    </div>
                                    <div>
                                        <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wider">Description</h3>
                                        <p className="mt-2 text-base text-gray-900 leading-relaxed">{activeProject.description}</p>
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 md:grid-cols-3 gap-6 bg-gray-50 p-6 rounded-xl border border-gray-100 relative">
                                    <div className="absolute top-4 right-4 flex gap-2">
                                        <button
                                            onClick={() => {
                                                setViewMode('map');
                                                // The map will auto-center because of our change to MapContainer
                                            }}
                                            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold bg-white border border-gray-200 rounded-lg text-[#0f172a] hover:bg-gray-50 shadow-sm"
                                        >
                                            <MapIcon className="h-3.5 w-3.5 text-blue-500" /> View on Map
                                        </button>
                                        <a href={activeProject.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold bg-white border border-gray-200 rounded-lg text-[#0f172a] hover:bg-gray-50 shadow-sm">
                                            Portal <ExternalLink className="h-3.5 w-3.5 text-gray-400" />
                                        </a>
                                    </div>
                                    <div className="md:col-span-3 pb-2 border-b border-gray-200 mb-2">
                                        <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                                            <div><h3 className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Reference</h3><p className="mt-1 text-sm font-semibold text-gray-900">{activeProject.reference || 'N/A'}</p></div>
                                            <div><h3 className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">App Status</h3><p className="mt-1 text-sm font-semibold text-gray-900">{activeProject.applicationStatus || 'N/A'}</p></div>
                                            <div className="md:col-span-2"><h3 className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Applicant</h3><p className="mt-1 text-sm font-semibold text-gray-900">{activeProject.applicantName || 'N/A'}</p></div>
                                        </div>
                                    </div>
                                    <div><h3 className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Received</h3><p className="mt-1 text-sm font-medium text-gray-700">{activeProject.dateReceived ? new Date(activeProject.dateReceived).toLocaleDateString() : 'N/A'}</p></div>
                                    <div><h3 className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Validated</h3><p className="mt-1 text-sm font-medium text-gray-700">{activeProject.dateValidated ? new Date(activeProject.dateValidated).toLocaleDateString() : 'N/A'}</p></div>
                                    <div><h3 className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Decided</h3><p className="mt-1 text-sm font-medium text-gray-700">{activeProject.dateDecided ? new Date(activeProject.dateDecided).toLocaleDateString() : 'N/A'}</p></div>
                                </div>

                                <div className="bg-blue-50/50 p-6 border border-blue-100 rounded-xl space-y-4">
                                    <h3 className="text-sm font-semibold text-blue-900 flex items-center justify-between">
                                        <span className="flex items-center gap-2"><ClipboardList className="h-4 w-4" /> Homeowner Details</span>
                                        {!activeProject.homeownerName && (
                                            <a
                                                href={`#/capture?id=${activeProject.id}`}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="text-xs bg-blue-600 text-white px-3 py-1.5 rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-1.5 shadow-sm"
                                            >
                                                <ExternalLink className="h-3 w-3" /> Open Capture Form
                                            </a>
                                        )}
                                    </h3>
                                    {activeProject.homeownerName ? (
                                        <div className="grid grid-cols-2 md:grid-cols-3 gap-6">
                                            <div><h4 className="text-xs font-medium text-blue-700 uppercase tracking-widest">Name</h4><p className="mt-1 text-sm font-medium text-blue-900">{activeProject.homeownerName}</p></div>
                                            <div><h4 className="text-xs font-medium text-blue-700 uppercase tracking-widest">Email</h4><a href={`mailto:${activeProject.homeownerEmail}`} className="mt-1 text-sm text-blue-600 hover:underline font-medium">{activeProject.homeownerEmail}</a></div>
                                            <div><h4 className="text-xs font-medium text-blue-700 uppercase tracking-widest">Phone</h4><a href={`tel:${activeProject.homeownerPhone}`} className="mt-1 text-sm text-blue-600 hover:underline font-medium">{activeProject.homeownerPhone}</a></div>
                                        </div>
                                    ) : (
                                        <div className="text-center py-4">
                                            <p className="text-sm text-blue-700/60 italic">No homeowner details captured yet.</p>
                                        </div>
                                    )}
                                </div>

                                <div className="space-y-6">
                                    <h3 className="text-lg font-bold text-gray-900 border-b border-gray-100 pb-2 flex items-center gap-2"><Network className="h-5 w-5 text-gray-400" /> Linked Entities</h3>
                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
                                            <div className="bg-gray-50 px-4 py-2 border-b border-gray-200 flex items-center justify-between"><span className="text-xs font-bold text-gray-500 uppercase flex items-center gap-1.5"><User className="h-3.5 w-3.5" /> Builders</span><span className="text-[10px] bg-gray-200 px-1.5 py-0.5 rounded text-gray-600 font-bold">{projectAssignments.length}</span></div>
                                            <div className="p-2 space-y-1">
                                                {projectAssignments.length === 0 ? <p className="text-xs text-gray-400 p-2 italic text-center">No builders assigned.</p> : projectAssignments.map(asgn => (
                                                    <button key={asgn.builderId} onClick={() => navigate(`/builders?id=${asgn.builderId}`)} className="w-full text-left p-2 hover:bg-blue-50 rounded-lg group transition-colors flex items-center justify-between">
                                                        <div className="truncate flex-1"><div className="text-sm font-semibold text-gray-900 group-hover:text-blue-700 truncate">{builders.find(b => b.id === asgn.builderId)?.companyName || 'Unknown'}</div><div className="text-[10px] text-gray-500 uppercase">{asgn.status}</div></div><ChevronRight className="h-4 w-4 text-gray-300 group-hover:text-blue-400" />
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
                                            <div className="bg-gray-50 px-4 py-2 border-b border-gray-200 flex items-center justify-between"><span className="text-xs font-bold text-gray-500 uppercase flex items-center gap-1.5"><Receipt className="h-3.5 w-3.5" /> Invoices</span><span className="text-[10px] bg-gray-200 px-1.5 py-0.5 rounded text-gray-600 font-bold">{relatedInvoices.length}</span></div>
                                            <div className="p-2 space-y-1">
                                                {relatedInvoices.length === 0 ? <p className="text-xs text-gray-400 p-2 italic text-center">No invoices.</p> : relatedInvoices.map(inv => (
                                                    <button key={inv.id} onClick={() => navigate(`/invoices?id=${inv.id}`)} className="w-full text-left p-2 hover:bg-blue-50 rounded-lg group transition-colors flex items-center justify-between">
                                                        <div className="truncate flex-1"><div className="text-sm font-semibold text-gray-900 group-hover:text-blue-700">£{inv.commissionTotal.toFixed(2)}</div><div className="text-[10px] text-gray-500 uppercase">{inv.status}</div></div><ChevronRight className="h-4 w-4 text-gray-300 group-hover:text-blue-400" />
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
                                            <div className="bg-gray-50 px-4 py-2 border-b border-gray-200 flex items-center justify-between"><span className="text-xs font-bold text-gray-500 uppercase flex items-center gap-1.5"><FileText className="h-3.5 w-3.5" /> Contracts</span><span className="text-[10px] bg-gray-200 px-1.5 py-0.5 rounded text-gray-600 font-bold">{relatedContracts.length}</span></div>
                                            <div className="p-2 space-y-1">
                                                {relatedContracts.length === 0 ? <p className="text-xs text-gray-400 p-2 italic text-center">No contracts.</p> : relatedContracts.map(con => (
                                                    <button key={con.id} onClick={() => navigate(`/contracts?id=${con.id}`)} className="w-full text-left p-2 hover:bg-blue-50 rounded-lg group transition-colors flex items-center justify-between">
                                                        <div className="truncate flex-1"><div className="text-sm font-semibold text-gray-900 group-hover:text-blue-700">{con.status === 'Signed' ? 'SIGNED' : 'PENDING'}</div><div className="text-[10px] text-gray-500 uppercase">{con.dateIssued ? new Date(con.dateIssued.toDate()).toLocaleDateString() : 'Now'}</div></div><ChevronRight className="h-4 w-4 text-gray-300 group-hover:text-blue-400" />
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-8 pt-8">
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-2">Project Status</label>
                                        <select
                                            value={editStatus}
                                            onChange={(e) => setEditStatus(e.target.value)}
                                            className="block w-full rounded-md border-gray-300 py-2.5 pl-3 pr-10 text-sm focus:border-[#0f172a] focus:ring-[#0f172a] border"
                                        >
                                            {STATUS_OPTIONS.map(status => (
                                                <option key={status} value={status}>{status}</option>
                                            ))}
                                        </select>
                                    </div>
                                    <div><label className="block text-sm font-medium text-gray-700 mb-2">Internal Notes</label><textarea rows={4} value={editNotes} onChange={(e) => setEditNotes(e.target.value)} className="block w-full rounded-md border-gray-300 shadow-sm focus:border-[#0f172a] focus:ring-[#0f172a] text-sm p-3 border" placeholder="Add notes..." /></div>
                                </div>

                                <div className="bg-gray-50 p-6 rounded-xl border border-gray-100">
                                    <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2 mb-4">
                                        <Users className="h-4 w-4 text-gray-500" /> Assign Builders
                                    </h3>
                                    <div className="space-y-4">
                                        <div className="flex gap-3">
                                            <select
                                                value={selectedBuilderToAssign}
                                                onChange={(e) => setSelectedBuilderToAssign(e.target.value)}
                                                className="block w-full rounded-md border-gray-300 text-sm focus:border-[#0f172a] focus:ring-[#0f172a] border"
                                            >
                                                <option value="" disabled>Select builder to add...</option>
                                                {builders.filter(b => b.availability).map(b => (
                                                    <option key={b.id} value={b.id}>{b.companyName}</option>
                                                ))}
                                            </select>
                                            <button
                                                onClick={assignLead}
                                                disabled={!selectedBuilderToAssign}
                                                className="bg-[#0f172a] px-6 py-2 rounded-md text-sm font-semibold text-white hover:bg-black disabled:opacity-50 whitespace-nowrap"
                                            >
                                                Add to Project
                                            </button>
                                        </div>

                                        {projectAssignments.length > 0 && (
                                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-4">
                                                {projectAssignments.map(asgn => {
                                                    const builder = builders.find(b => b.id === asgn.builderId);
                                                    return (
                                                        <div key={asgn.id} className="flex items-center justify-between bg-white p-3 rounded-lg border border-gray-200 shadow-sm">
                                                            <div className="flex items-center gap-3">
                                                                <div className="h-8 w-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 text-xs font-bold">
                                                                    {builder?.companyName?.charAt(0) || '?'}
                                                                </div>
                                                                <div className="text-sm font-medium text-gray-900 truncate max-w-[120px]">
                                                                    {builder?.companyName || 'Unknown'}
                                                                </div>
                                                            </div>
                                                            <div className="text-[10px] font-bold text-blue-600 uppercase bg-blue-50 px-2 py-1 rounded">
                                                                {asgn.status}
                                                            </div>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>
                        <div className="flex shrink-0 justify-end px-6 py-4 bg-gray-50 border-t border-gray-200 gap-3"><button onClick={closeProject} className="rounded-md bg-white px-4 py-2 text-sm font-semibold text-gray-900 border border-gray-300 hover:bg-gray-50">Cancel</button><button onClick={saveProjectDetails} className="rounded-md bg-[#0f172a] px-4 py-2 text-sm font-semibold text-white hover:bg-black flex items-center gap-2"><Save className="h-4 w-4" />Save Changes</button></div>
                    </>
                )}
            </div>

            {showSyncModal && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
                    <div className="fixed inset-0 bg-gray-900/40 backdrop-blur-sm" onClick={() => setShowSyncModal(false)}></div>
                    <div className="bg-white rounded-xl shadow-2xl relative w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200">
                        <div className="bg-gray-50 px-6 py-4 border-b border-gray-200 flex justify-between items-center"><h3 className="text-lg font-bold">Select Sync Week</h3><button onClick={() => setShowSyncModal(false)}><X className="h-5 w-5" /></button></div>
                        <div className="p-6"><select value={selectedSyncDate} onChange={(e) => setSelectedSyncDate(e.target.value)} className="w-full border rounded-lg p-3 text-sm focus:border-[#0f172a] focus:ring-[#0f172a] outline-none" size="8"><option value="current">Current Week</option>{syncDates.map(date => <option key={date} value={date}>{date}</option>)}</select></div>
                        <div className="bg-gray-50 p-4 border-t border-gray-200 flex justify-end gap-3"><button onClick={() => setShowSyncModal(false)} className="px-4 py-2 text-sm font-semibold border rounded-lg">Cancel</button><button onClick={triggerSync} className="bg-[#0f172a] text-white px-6 py-2 rounded-lg text-sm font-bold">Start Scraper</button></div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default Projects;
