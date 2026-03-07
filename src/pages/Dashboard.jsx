import { Search, Filter, Loader2, Link, MapPin, ExternalLink, X, Save, Map as MapIcon, List, Users, CheckCircle2 } from 'lucide-react';
import { useState, useEffect } from 'react';
import { db } from '../firebase';
import { collection, query, orderBy, onSnapshot, doc, updateDoc, addDoc, serverTimestamp, where, getDocs, writeBatch } from 'firebase/firestore';
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

const Dashboard = () => {
    const [loading, setLoading] = useState(true);
    const [projects, setProjects] = useState([]);
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedProject, setSelectedProject] = useState(null);
    const [editNotes, setEditNotes] = useState('');
    const [editStatus, setEditStatus] = useState('');
    const [viewMode, setViewMode] = useState('list'); // 'list' or 'map'
    const [syncing, setSyncing] = useState(false);
    const [syncStatus, setSyncStatus] = useState(null); // null | 'success' | 'error'
    const [builders, setBuilders] = useState([]);
    const [projectAssignments, setProjectAssignments] = useState([]);
    const [selectedBuilderToAssign, setSelectedBuilderToAssign] = useState('');

    // Multi-select and collections logic
    const [selectedRowIds, setSelectedRowIds] = useState([]);
    const [batchCollectionName, setBatchCollectionName] = useState('');

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

            // Map assignment to builder details for display
            // For real-time complexity we might just fetch straight, but let's map it since builders list is already in memory
            setProjectAssignments(assignmentData);
        });

        return () => unsubscribe();
    }, [selectedProject]);

    const filteredProjects = projects.filter(p => {
        const matchesSearch = p.address?.toLowerCase().includes(searchQuery.toLowerCase()) ||
            p.description?.toLowerCase().includes(searchQuery.toLowerCase()) ||
            p.collectionId?.toLowerCase().includes(searchQuery.toLowerCase());
        return matchesSearch;
    });

    const openProject = (project) => {
        setSelectedProject(project);
        setEditNotes(project.notes || '');
        setEditStatus(project.status || 'New');
    };

    const saveProjectDetails = async () => {
        if (!selectedProject) return;
        try {
            const projectRef = doc(db, 'projects', selectedProject.id);
            await updateDoc(projectRef, {
                notes: editNotes,
                status: editStatus
            });
            setSelectedProject(null);
        } catch (error) {
            console.error("Error updating project:", error);
            alert("Failed to save project details.");
        }
    };

    const assignLead = async () => {
        if (!selectedProject || !selectedBuilderToAssign) return;

        // Prevent duplicate assignments
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
            setEditStatus('Assigned'); // Auto-update status
        } catch (error) {
            console.error("Error assigning lead:", error);
            alert("Failed to assign lead.");
        }
    };

    const triggerSync = async () => {
        let token = localStorage.getItem('github_sync_token');

        if (!token) {
            token = prompt("Please enter your GitHub Personal Access Token (with 'workflow' scope) to trigger the sync manually.\n\nIt will be saved securely in your browser:");
            if (!token) return;
            localStorage.setItem('github_sync_token', token);
        }

        const owner = 'AuraJamie';
        const repo = 'benchmark-intelligence';

        setSyncing(true);
        setSyncStatus(null);

        try {
            const response = await fetch(
                `https://api.github.com/repos/${owner}/${repo}/actions/workflows/scraper.yml/dispatches`,
                {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Accept': 'application/vnd.github+json',
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({ ref: 'main' }),
                }
            );

            if (response.status === 204) {
                setSyncStatus('success');
                setTimeout(() => setSyncStatus(null), 5000);
            } else {
                const err = await response.json();
                console.error('GitHub Actions error:', err);
                if (err.message === 'Bad credentials') {
                    // Token is invalid, clear it so they are prompted next time
                    localStorage.removeItem('github_sync_token');
                    alert("Invalid GitHub Token. Please generate a new one at https://github.com/settings/tokens/new with the 'workflow' scope and try again.");
                }
                setSyncStatus('error');
                setTimeout(() => setSyncStatus(null), 5000);
            }
        } catch (error) {
            console.error('Sync failed:', error);
            setSyncStatus('error');
            setTimeout(() => setSyncStatus(null), 5000);
        } finally {
            setSyncing(false);
        }
    };

    const toggleRowSelect = (e, id) => {
        e.stopPropagation();
        if (selectedRowIds.includes(id)) {
            setSelectedRowIds(selectedRowIds.filter(rowId => rowId !== id));
        } else {
            setSelectedRowIds([...selectedRowIds, id]);
        }
    };

    const toggleSelectAll = () => {
        if (selectedRowIds.length === filteredProjects.length) {
            setSelectedRowIds([]);
        } else {
            setSelectedRowIds(filteredProjects.map(p => p.id));
        }
    };

    const applyCollectionToSelected = async () => {
        if (!batchCollectionName.trim() || selectedRowIds.length === 0) return;

        try {
            const batch = writeBatch(db);
            selectedRowIds.forEach(id => {
                const projectRef = doc(db, 'projects', id);
                batch.update(projectRef, { collectionId: batchCollectionName.trim() });
            });
            await batch.commit();

            setSelectedRowIds([]);
            setBatchCollectionName('');
            alert('Collection assigned to selected projects.');
        } catch (error) {
            console.error('Error batch updating collections:', error);
            alert('Failed to update collections.');
        }
    };

    return (
        <div className="w-full relative">
            <header className="mb-6 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-semibold tracking-tight">Projects</h1>
                    <p className="mt-2 text-sm text-gray-500">Manage intercepted council planning applications.</p>
                </div>
                <div className="flex flex-col md:flex-row items-stretch md:items-center gap-3 w-full md:w-auto">
                    <div className="flex bg-gray-100 p-1 rounded-lg">
                        <button
                            onClick={() => setViewMode('list')}
                            className={`flex-1 md:flex-none justify-center items-center gap-2 px-3 py-1.5 text-sm font-medium rounded-md transition-all ${viewMode === 'list' ? 'bg-white shadow-sm text-[#0f172a]' : 'text-gray-500 hover:text-gray-700'}`}
                        >
                            <List className="h-4 w-4 inline-block" /> List
                        </button>
                        <button
                            onClick={() => setViewMode('map')}
                            className={`flex-1 md:flex-none justify-center items-center gap-2 px-3 py-1.5 text-sm font-medium rounded-md transition-all ${viewMode === 'map' ? 'bg-white shadow-sm text-[#0f172a]' : 'text-gray-500 hover:text-gray-700'}`}
                        >
                            <MapIcon className="h-4 w-4 inline-block" /> Map
                        </button>
                    </div>
                    <button
                        onClick={triggerSync}
                        disabled={syncing}
                        className="flex justify-center items-center gap-2 rounded-lg bg-[#0f172a] px-4 py-2.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-black focus:outline-none focus:ring-2 focus:ring-[#0f172a] focus:ring-offset-2 disabled:opacity-60 disabled:cursor-not-allowed w-full md:w-auto"
                    >
                        <Loader2 className={`h-4 w-4 ${syncing ? 'animate-spin' : ''}`} />
                        {syncing ? 'Triggering...' : 'Sync Now'}
                    </button>
                </div>
            </header>

            {syncStatus === 'success' && (
                <div className="mb-6 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
                    ✓ Scraper job triggered successfully on GitHub Actions! New data will appear in a few minutes.
                </div>
            )}
            {syncStatus === 'error' && (
                <div className="mb-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
                    ✗ Failed to trigger the scraper. Check your VITE_GITHUB_TOKEN in the .env file.
                </div>
            )}

            <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
                <div className="flex items-center gap-4 border-b border-gray-100 p-4">
                    <div className="relative flex-1 max-w-md">
                        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                        <input
                            type="text"
                            placeholder="Search addresses or descriptions..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full rounded-lg border border-gray-300 py-2.5 pl-10 pr-4 text-sm focus:border-[#0f172a] focus:outline-none focus:ring-1 focus:ring-[#0f172a]"
                        />
                    </div>
                    <button className="flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50">
                        <Filter className="h-4 w-4 text-gray-500" />
                        Filter
                    </button>
                </div>

                {selectedRowIds.length > 0 && viewMode === 'list' && (
                    <div className="bg-[#0f172a]/5 border-b border-gray-200 p-3 flex items-center justify-between">
                        <span className="text-sm font-medium text-[#0f172a]">{selectedRowIds.length} project(s) selected</span>
                        <div className="flex items-center gap-2">
                            <input
                                type="text"
                                placeholder="Collection Name..."
                                className="rounded-md border border-gray-300 py-1.5 px-3 text-sm focus:border-[#0f172a] focus:outline-none"
                                value={batchCollectionName}
                                onChange={(e) => setBatchCollectionName(e.target.value)}
                            />
                            <button
                                onClick={applyCollectionToSelected}
                                disabled={!batchCollectionName.trim()}
                                className="rounded-md bg-[#0f172a] px-3 py-1.5 text-sm font-medium text-white hover:bg-black disabled:opacity-50"
                            >
                                Add to Collection
                            </button>
                        </div>
                    </div>
                )}

                <div className="overflow-x-auto">
                    {viewMode === 'list' ? (
                        <table className="w-full text-left text-sm text-gray-600">
                            <thead className="bg-gray-50/50 text-xs uppercase text-gray-500">
                                <tr>
                                    <th className="px-6 py-4 font-medium border-b border-gray-200 w-12 text-center">
                                        <input
                                            type="checkbox"
                                            className="rounded border-gray-300 text-[#0f172a] focus:ring-[#0f172a]"
                                            checked={filteredProjects.length > 0 && selectedRowIds.length === filteredProjects.length}
                                            onChange={toggleSelectAll}
                                        />
                                    </th>
                                    <th className="px-6 py-4 font-medium border-b border-gray-200">Address / Collection</th>
                                    <th className="px-6 py-4 font-medium border-b border-gray-200">Description</th>
                                    <th className="px-6 py-4 font-medium border-b border-gray-200">Status</th>
                                    <th className="px-6 py-4 font-medium border-b border-gray-200">Decided</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100 bg-white">
                                {loading ? (
                                    <tr>
                                        <td colSpan="5" className="px-6 py-8 text-center text-sm text-gray-500">
                                            <Loader2 className="h-6 w-6 animate-spin mx-auto mb-2 text-gray-400" />
                                            Loading projects...
                                        </td>
                                    </tr>
                                ) : filteredProjects.length === 0 ? (
                                    <tr>
                                        <td colSpan="5" className="px-6 py-8 text-center text-sm text-gray-500">
                                            No projects found matching your criteria.
                                        </td>
                                    </tr>
                                ) : (
                                    filteredProjects.map((project) => (
                                        <tr key={project.id} onClick={() => openProject(project)} className={`hover:bg-gray-50/50 cursor-pointer transition-colors ${selectedRowIds.includes(project.id) ? 'bg-blue-50/30' : ''}`}>
                                            <td className="px-6 py-4 text-center">
                                                <input
                                                    type="checkbox"
                                                    className="rounded border-gray-300 text-[#0f172a] focus:ring-[#0f172a]"
                                                    checked={selectedRowIds.includes(project.id)}
                                                    onChange={(e) => toggleRowSelect(e, project.id)}
                                                />
                                            </td>
                                            <td className="px-6 py-4 font-medium text-[#0f172a]">
                                                {project.address}
                                                {project.collectionId && (
                                                    <div className="text-xs text-blue-600 font-normal mt-1 flex items-center gap-1">
                                                        <Filter className="h-3 w-3" /> {project.collectionId}
                                                    </div>
                                                )}
                                            </td>
                                            <td className="px-6 py-4 truncate max-w-xs" title={project.description}>
                                                {project.description}
                                            </td>
                                            <td className="px-6 py-4">
                                                <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium border ${project.status === 'New' ? 'border-blue-200 bg-blue-50 text-blue-700' :
                                                    project.status === 'Contacted' ? 'border-yellow-200 bg-yellow-50 text-yellow-700' :
                                                        project.status === 'Assigned' ? 'border-green-200 bg-green-50 text-green-700' :
                                                            project.status === 'Dead' ? 'border-red-200 bg-red-50 text-red-700' :
                                                                'border-gray-200 bg-gray-50 text-gray-700'
                                                    }`}>
                                                    {project.status || 'Unknown'}
                                                </span>
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap text-gray-500">
                                                {project.dateDecided ? new Date(project.dateDecided).toLocaleDateString() : 'N/A'}
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    ) : (
                        <div className="h-[600px] w-full relative z-0">
                            <MapContainer center={[53.9591, -1.0815]} zoom={13} style={{ height: '100%', width: '100%' }}>
                                <TileLayer
                                    attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                                    url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                                />
                                {filteredProjects
                                    .filter(p => p.coordinates?.lat && p.coordinates?.lng)
                                    .map(project => (
                                        <Marker
                                            key={project.id}
                                            position={[project.coordinates.lat, project.coordinates.lng]}
                                            eventHandlers={{
                                                click: () => openProject(project)
                                            }}
                                        >
                                            <Popup>
                                                <div className="p-1 space-y-1">
                                                    <p className="font-bold text-sm text-[#0f172a]">{project.address}</p>
                                                    {project.collectionId && <p className="text-xs text-blue-600 font-medium">{project.collectionId}</p>}
                                                    <p className="text-xs text-gray-600 line-clamp-2">{project.description}</p>
                                                    <p className="text-xs font-semibold mt-1">Status: {project.status}</p>
                                                </div>
                                            </Popup>
                                        </Marker>
                                    ))
                                }
                            </MapContainer>
                        </div>
                    )}
                </div>
            </div>

            {/* Slide-over Panel for Project Details */}
            {
                selectedProject && (
                    <div className="fixed inset-0 z-[60] overflow-hidden" aria-labelledby="slide-over-title" role="dialog" aria-modal="true">
                        <div className="absolute inset-0 overflow-hidden">
                            <div className="absolute inset-0 bg-gray-500 bg-opacity-75 transition-opacity" aria-hidden="true" onClick={() => setSelectedProject(null)}></div>
                            <div className="pointer-events-none fixed inset-y-0 right-0 flex max-w-full md:pl-10">
                                <div className="pointer-events-auto w-screen max-w-md transform transition-transform">
                                    <div className="flex h-full flex-col overflow-y-scroll bg-white shadow-xl">
                                        <div className="px-4 py-6 sm:px-6 bg-[#0f172a] text-white flex justify-between items-center">
                                            <div>
                                                <h2 className="text-lg font-semibold" id="slide-over-title">Project Details</h2>
                                                <p className="text-sm text-gray-300 mt-1">{selectedProject.id}</p>
                                            </div>
                                            <button onClick={() => setSelectedProject(null)} className="rounded-md text-gray-300 hover:text-white focus:outline-none">
                                                <span className="sr-only">Close panel</span>
                                                <X className="h-6 w-6" />
                                            </button>
                                        </div>
                                        <div className="relative flex-1 px-4 py-6 sm:px-6 space-y-6">

                                            <div>
                                                <h3 className="text-sm font-medium text-gray-500">Address</h3>
                                                <p className="mt-1 text-sm text-gray-900 flex items-start gap-2">
                                                    <MapPin className="h-4 w-4 mt-0.5 text-gray-400 shrink-0" />
                                                    {selectedProject.address}
                                                </p>
                                            </div>

                                            <div>
                                                <h3 className="text-sm font-medium text-gray-500">Description</h3>
                                                <p className="mt-1 text-sm text-gray-900">{selectedProject.description}</p>
                                            </div>

                                            <div>
                                                <h3 className="text-sm font-medium text-gray-500">Applicant</h3>
                                                <p className="mt-1 text-sm text-gray-900">{selectedProject.applicantName || 'Not recorded'}</p>
                                            </div>

                                            <div>
                                                <h3 className="text-sm font-medium text-gray-500">Council Link</h3>
                                                <a href={selectedProject.url} target="_blank" rel="noopener noreferrer" className="mt-1 text-sm text-blue-600 hover:text-blue-500 flex items-center gap-1">
                                                    View on Planning Portal <ExternalLink className="h-3 w-3" />
                                                </a>
                                            </div>

                                            <hr className="border-gray-200" />

                                            <div>
                                                <label htmlFor="status" className="block text-sm font-medium text-gray-700">Project Status</label>
                                                <select
                                                    id="status"
                                                    value={editStatus}
                                                    onChange={(e) => setEditStatus(e.target.value)}
                                                    className="mt-1 block w-full rounded-md border-gray-300 py-2 pl-3 pr-10 text-base focus:border-[#0f172a] focus:outline-none focus:ring-[#0f172a] sm:text-sm"
                                                >
                                                    <option value="New">New</option>
                                                    <option value="Contacted">Contacted</option>
                                                    <option value="Assigned">Assigned</option>
                                                    <option value="Dead">Dead</option>
                                                </select>
                                            </div>

                                            <div>
                                                <label htmlFor="notes" className="block text-sm font-medium text-gray-700">Internal Notes</label>
                                                <div className="mt-1">
                                                    <textarea
                                                        id="notes"
                                                        rows={4}
                                                        value={editNotes}
                                                        onChange={(e) => setEditNotes(e.target.value)}
                                                        className="block w-full rounded-md border-gray-300 shadow-sm focus:border-[#0f172a] focus:ring-[#0f172a] sm:text-sm p-3 border"
                                                        placeholder="Add important notes here..."
                                                    />
                                                </div>
                                            </div>

                                            <hr className="border-gray-200" />

                                            <div>
                                                <h3 className="text-sm font-medium text-gray-900 flex items-center gap-2 mb-3">
                                                    <Users className="h-4 w-4 text-gray-500" />
                                                    Assign Leads
                                                </h3>

                                                <div className="flex gap-2">
                                                    <select
                                                        value={selectedBuilderToAssign}
                                                        onChange={(e) => setSelectedBuilderToAssign(e.target.value)}
                                                        className="block w-full rounded-md border-gray-300 py-2 pl-3 pr-10 text-base focus:border-[#0f172a] focus:outline-none focus:ring-[#0f172a] sm:text-sm border"
                                                    >
                                                        <option value="" disabled>Select a builder...</option>
                                                        {builders.filter(b => b.availability).map(b => (
                                                            <option key={b.id} value={b.id}>{b.companyName} ({b.companyId})</option>
                                                        ))}
                                                    </select>
                                                    <button
                                                        type="button"
                                                        onClick={assignLead}
                                                        disabled={!selectedBuilderToAssign}
                                                        className="inline-flex justify-center rounded-md bg-blue-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-50"
                                                    >
                                                        Assign
                                                    </button>
                                                </div>

                                                {projectAssignments.length > 0 && (
                                                    <div className="mt-4">
                                                        <h4 className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">Currently Assigned</h4>
                                                        <ul className="space-y-2">
                                                            {projectAssignments.map(assignment => {
                                                                const bData = builders.find(b => b.id === assignment.builderId);
                                                                return (
                                                                    <li key={assignment.id} className="text-sm flex justify-between items-center bg-gray-50 p-2 rounded-md border border-gray-100">
                                                                        <span>{bData ? bData.companyName : 'Unknown Builder'}</span>
                                                                        <span className={`text-xs font-medium ${assignment.status === 'Accepted' ? 'text-green-600' : 'text-gray-500'}`}>
                                                                            {assignment.status}
                                                                        </span>
                                                                    </li>
                                                                );
                                                            })}
                                                        </ul>
                                                    </div>
                                                )}
                                            </div>

                                        </div>
                                        <div className="flex flex-shrink-0 justify-end px-4 py-4 bg-gray-50 border-t border-gray-200">
                                            <button
                                                type="button"
                                                onClick={() => setSelectedProject(null)}
                                                className="rounded-md bg-white px-3 py-2 text-sm font-semibold text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 hover:bg-gray-50"
                                            >
                                                Cancel
                                            </button>
                                            <button
                                                type="button"
                                                onClick={saveProjectDetails}
                                                className="ml-4 inline-flex justify-center rounded-md bg-[#0f172a] px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-black focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0f172a]"
                                            >
                                                <Save className="h-4 w-4 mr-2" />
                                                Save Changes
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
            )}
                    </div>
                );
    };

            export default Dashboard;
