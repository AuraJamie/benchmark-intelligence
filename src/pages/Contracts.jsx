import { useState, useEffect, useRef } from 'react';
import { db } from '../firebase';
import { collection, query, orderBy, onSnapshot, addDoc, updateDoc, doc, serverTimestamp, setDoc } from 'firebase/firestore';
import { FileSignature, Plus, X, Search, CheckCircle2, XCircle, AlertCircle } from 'lucide-react';
import ReactQuill from 'react-quill-new';
import 'react-quill-new/dist/quill.snow.css';
import SignatureCanvas from 'react-signature-canvas';

const Contracts = () => {
    const [activeTab, setActiveTab] = useState('agreements'); // 'agreements' or 'versions'

    // Data states
    const [versions, setVersions] = useState([]);
    const [agreements, setAgreements] = useState([]);
    const [builders, setBuilders] = useState([]);

    // UI States
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');

    // Modals & Panels
    const [showNewVersion, setShowNewVersion] = useState(false);
    const [showNewAgreement, setShowNewAgreement] = useState(false);
    const [signingAgreement, setSigningAgreement] = useState(null);
    const [viewingAgreement, setViewingAgreement] = useState(null);

    // Form States
    const [newVersionTitle, setNewVersionTitle] = useState('');
    const [newVersionContent, setNewVersionContent] = useState('');
    const [selectedBuilderForAgreement, setSelectedBuilderForAgreement] = useState('');
    const [selectedVersionForAgreement, setSelectedVersionForAgreement] = useState('');

    const sigPad = useRef({});

    // Fetch Data
    useEffect(() => {
        const unsubscribeBuilders = onSnapshot(query(collection(db, 'builders'), orderBy('companyName', 'asc')), (snapshot) => {
            setBuilders(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
        });

        const unsubscribeVersions = onSnapshot(query(collection(db, 'contractVersions'), orderBy('createdAt', 'desc')), (snapshot) => {
            setVersions(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
        });

        const unsubscribeAgreements = onSnapshot(query(collection(db, 'agreements'), orderBy('dateIssued', 'desc')), (snapshot) => {
            setAgreements(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
            setLoading(false);
        });

        return () => {
            unsubscribeBuilders();
            unsubscribeVersions();
            unsubscribeAgreements();
        };
    }, []);

    // Actions
    const handleSaveVersion = async () => {
        if (!newVersionTitle.trim() || !newVersionContent.trim()) {
            alert("Title and content are required.");
            return;
        }

        try {
            await addDoc(collection(db, 'contractVersions'), {
                title: newVersionTitle,
                content: newVersionContent,
                createdAt: serverTimestamp()
            });
            setShowNewVersion(false);
            setNewVersionTitle('');
            setNewVersionContent('');
        } catch (error) {
            console.error("Error saving version:", error);
            alert("Failed to save contract version.");
        }
    };

    const handleIssueAgreement = async () => {
        if (!selectedBuilderForAgreement || !selectedVersionForAgreement) {
            alert("Please select a builder and a contract version.");
            return;
        }

        // Optional: Check if agreement already exists and is pending
        const existing = agreements.find(a => a.builderId === selectedBuilderForAgreement && a.versionId === selectedVersionForAgreement);
        if (existing) {
            alert("This builder already has an agreement for this contract version.");
            return;
        }

        try {
            await addDoc(collection(db, 'agreements'), {
                builderId: selectedBuilderForAgreement,
                versionId: selectedVersionForAgreement,
                status: 'Pending',
                dateIssued: serverTimestamp(),
                dateSigned: null,
                signatureData: null
            });
            setShowNewAgreement(false);
            setSelectedBuilderForAgreement('');
            setSelectedVersionForAgreement('');
            setActiveTab('agreements');
        } catch (error) {
            console.error("Error issuing agreement:", error);
            alert("Failed to issue agreement.");
        }
    };

    const handleSignAgreement = async () => {
        if (sigPad.current.isEmpty()) {
            alert("Please provide a signature first.");
            return;
        }

        const signatureData = sigPad.current.getTrimmedCanvas().toDataURL("image/png");

        try {
            const agreementRef = doc(db, 'agreements', signingAgreement.id);
            await updateDoc(agreementRef, {
                status: 'Signed',
                dateSigned: serverTimestamp(),
                signatureData: signatureData
            });
            setSigningAgreement(null);
        } catch (error) {
            console.error("Error signing agreement:", error);
            alert("Failed to sign the agreement.");
        }
    };

    const getBuilderName = (id) => {
        const builder = builders.find(b => b.id === id);
        return builder ? `${builder.companyName} (${builder.ownerName})` : 'Unknown Builder';
    };

    const getVersionTitle = (id) => {
        const ver = versions.find(v => v.id === id);
        return ver ? ver.title : 'Unknown Version';
    };

    const filteredAgreements = agreements.filter(a => {
        const search = searchQuery.toLowerCase();
        const bName = getBuilderName(a.builderId).toLowerCase();
        const vTitle = getVersionTitle(a.versionId).toLowerCase();
        return bName.includes(search) || vTitle.includes(search) || a.status.toLowerCase().includes(search);
    });

    return (
        <div className="w-full relative flex flex-col h-full overflow-hidden">
            <header className="mb-6 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 shrink-0">
                <div>
                    <h1 className="text-3xl font-semibold tracking-tight">Contracts</h1>
                    <p className="mt-2 text-sm text-gray-500">Manage contract versions and builder signatures.</p>
                </div>
                <div className="flex gap-3">
                    <button
                        onClick={() => setShowNewVersion(true)}
                        className="flex items-center gap-2 rounded-lg bg-white border border-gray-300 px-4 py-2.5 text-sm font-medium text-gray-700 shadow-sm transition-colors hover:bg-gray-50"
                    >
                        <Plus className="h-4 w-4" />
                        New Version
                    </button>
                    <button
                        onClick={() => {
                            if (versions.length === 0) {
                                alert("Please create a contract version first.");
                                return;
                            }
                            setShowNewAgreement(true);
                        }}
                        className="flex items-center gap-2 rounded-lg bg-[#0f172a] px-4 py-2.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-black"
                    >
                        <FileSignature className="h-4 w-4" />
                        Issue Agreement
                    </button>
                </div>
            </header>

            {/* Tabs */}
            <div className="flex space-x-4 border-b border-gray-200 mb-6 shrink-0">
                <button
                    onClick={() => setActiveTab('agreements')}
                    className={`pb-3 text-sm font-medium ${activeTab === 'agreements' ? 'border-b-2 border-[#0f172a] text-[#0f172a]' : 'text-gray-500 hover:text-gray-700 hover:border-gray-300'}`}
                >
                    Issued Agreements
                </button>
                <button
                    onClick={() => setActiveTab('versions')}
                    className={`pb-3 text-sm font-medium ${activeTab === 'versions' ? 'border-b-2 border-[#0f172a] text-[#0f172a]' : 'text-gray-500 hover:text-gray-700 hover:border-gray-300'}`}
                >
                    Contract Versions
                </button>
            </div>

            {/* Main Content Area */}
            {activeTab === 'agreements' && (
                <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden flex flex-col min-h-0 flex-1">
                    <div className="flex items-center gap-4 border-b border-gray-100 p-4 shrink-0">
                        <div className="relative flex-1 max-w-md">
                            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                            <input
                                type="text"
                                placeholder="Search agreements..."
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
                                    <th className="px-6 py-4 font-medium">Builder</th>
                                    <th className="px-6 py-4 font-medium">Version Issued</th>
                                    <th className="px-6 py-4 font-medium">Status</th>
                                    <th className="px-6 py-4 font-medium">Date Issued</th>
                                    <th className="px-6 py-4 font-medium text-right">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100 bg-white">
                                {loading ? (
                                    <tr>
                                        <td colSpan="5" className="px-6 py-8 text-center text-gray-500 text-sm">Loading agreements...</td>
                                    </tr>
                                ) : filteredAgreements.length === 0 ? (
                                    <tr>
                                        <td colSpan="5" className="px-6 py-8 text-center text-gray-500 text-sm">No agreements found.</td>
                                    </tr>
                                ) : (
                                    filteredAgreements.map(agreement => (
                                        <tr key={agreement.id} className="hover:bg-gray-50">
                                            <td className="px-6 py-4 font-medium text-[#0f172a]">
                                                {getBuilderName(agreement.builderId)}
                                            </td>
                                            <td className="px-6 py-4">
                                                {getVersionTitle(agreement.versionId)}
                                            </td>
                                            <td className="px-6 py-4">
                                                {agreement.status === 'Signed' ? (
                                                    <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium border border-green-200 bg-green-50 text-green-700">
                                                        <CheckCircle2 className="h-3.5 w-3.5" /> Signed
                                                    </span>
                                                ) : (
                                                    <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium border border-orange-200 bg-orange-50 text-orange-700">
                                                        <AlertCircle className="h-3.5 w-3.5" /> Pending
                                                    </span>
                                                )}
                                            </td>
                                            <td className="px-6 py-4 text-gray-500 whitespace-nowrap">
                                                {agreement.dateIssued ? new Date(agreement.dateIssued.toDate()).toLocaleDateString() : 'Just now'}
                                            </td>
                                            <td className="px-6 py-4 text-right">
                                                {agreement.status === 'Pending' ? (
                                                    <button onClick={() => setSigningAgreement(agreement)} className="text-[#0284c7] hover:text-[#0369a1] font-semibold text-sm">
                                                        Collect Signature
                                                    </button>
                                                ) : (
                                                    <button onClick={() => setViewingAgreement(agreement)} className="text-gray-600 hover:text-black font-semibold text-sm cursor-pointer">
                                                        View Details
                                                    </button>
                                                )}
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {activeTab === 'versions' && (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 overflow-auto pb-6">
                    {versions.length === 0 ? (
                        <div className="col-span-full py-12 text-center text-gray-500 text-sm bg-white rounded-xl border border-gray-200 border-dashed">
                            No contract versions exist. Create your first contract boilerplate!
                        </div>
                    ) : (
                        versions.map(version => (
                            <div key={version.id} className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 flex flex-col">
                                <h3 className="text-lg font-bold text-[#0f172a] mb-2">{version.title}</h3>
                                <p className="text-xs text-gray-400 mb-4 tracking-wide font-medium">CREATED: {version.createdAt ? new Date(version.createdAt.toDate()).toLocaleDateString() : 'Now'}</p>
                                <div className="border border-gray-100 bg-gray-50 rounded-lg p-4 mb-4 flex-1 text-sm text-gray-700 line-clamp-[8] prose prose-sm max-w-none" dangerouslySetInnerHTML={{ __html: version.content }}>
                                </div>
                                <div className="text-xs font-semibold text-gray-500">
                                    {agreements.filter(a => a.versionId === version.id).length} Accompanying Agreements
                                </div>
                            </div>
                        ))
                    )}
                </div>
            )}

            {/* Slide-over for collecting a signature */}
            <div className={`fixed inset-0 z-[70] bg-black/30 backdrop-blur-sm flex justify-end transition-opacity duration-300 ${signingAgreement ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`}>
                <div className={`w-full max-w-3xl bg-white h-full shadow-2xl flex flex-col transform transition-transform duration-500 ease-out ${signingAgreement ? 'translate-x-0' : 'translate-x-full'}`}>
                    {signingAgreement && (
                        <>
                            <div className="px-6 py-4 border-b border-gray-200 bg-gray-50 flex justify-between items-center shrink-0">
                                <div>
                                    <h2 className="text-lg font-semibold text-[#0f172a]">Collect Agreement Signature</h2>
                                    <p className="text-sm text-gray-500">For {getBuilderName(signingAgreement.builderId)}</p>
                                </div>
                                <button onClick={() => setSigningAgreement(null)} className="text-gray-400 hover:text-gray-600 focus:outline-none p-2 rounded-full hover:bg-gray-200 transition-colors">
                                    <X className="h-6 w-6" />
                                </button>
                            </div>
                            <div className="flex-1 overflow-y-auto p-8 relative">
                                <div className="max-w-2xl mx-auto space-y-8">
                                    <div className="prose prose-sm max-w-none p-8 bg-white border border-gray-200 rounded-xl shadow-sm text-gray-800" dangerouslySetInnerHTML={{ __html: versions.find(v => v.id === signingAgreement.versionId)?.content || 'Error loading content.' }}>
                                    </div>

                                    <div className="bg-gray-50 p-6 rounded-xl border border-gray-200">
                                        <div className="flex items-center justify-between mb-4">
                                            <h3 className="font-semibold text-gray-900">Builder Signature</h3>
                                            <button onClick={() => sigPad.current.clear()} className="text-xs font-medium text-blue-600 hover:text-blue-800 focus:outline-none">Clear Signature</button>
                                        </div>
                                        <div className="bg-white rounded border border-gray-300 shadow-inner">
                                            <SignatureCanvas
                                                penColor='black'
                                                canvasProps={{ className: 'w-full h-48 rounded', style: { width: '100%', height: '200px' } }}
                                                ref={sigPad}
                                            />
                                        </div>
                                        <p className="text-xs text-gray-500 mt-3 text-center">By signing above, I acknowledge that I've read and agree to the terms listed in the contract above representing {getBuilderName(signingAgreement.builderId)}.</p>
                                    </div>

                                </div>
                            </div>
                            <div className="p-4 border-t border-gray-200 bg-gray-50 flex justify-end gap-3 shrink-0">
                                <button
                                    onClick={() => setSigningAgreement(null)}
                                    className="px-4 py-2.5 rounded-lg border border-gray-300 bg-white text-sm font-semibold text-gray-700 hover:bg-gray-50"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={handleSignAgreement}
                                    className="px-4 py-2.5 rounded-lg bg-[#0f172a] text-white text-sm font-semibold hover:bg-black flex items-center gap-2"
                                >
                                    <CheckCircle2 className="h-4 w-4" />
                                    Accept terms & submit signature
                                </button>
                            </div>
                        </>
                    )}
                </div>
            </div>

            {/* Slide-over for viewing an executed agreement */}
            <div className={`fixed inset-0 z-[70] bg-black/30 backdrop-blur-sm flex justify-end transition-opacity duration-300 ${viewingAgreement ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`}>
                <div className={`w-full max-w-3xl bg-white h-full shadow-2xl flex flex-col transform transition-transform duration-500 ease-out ${viewingAgreement ? 'translate-x-0' : 'translate-x-full'}`}>
                    {viewingAgreement && (
                        <>
                            <div className="px-6 py-4 border-b border-gray-200 bg-gray-50 flex justify-between items-center shrink-0">
                                <div>
                                    <h2 className="text-lg font-semibold text-[#0f172a]">Executed Agreement</h2>
                                    <p className="text-sm text-green-600 font-medium">Signed by {getBuilderName(viewingAgreement.builderId)} on {viewingAgreement.dateSigned ? new Date(viewingAgreement.dateSigned.toDate()).toLocaleString() : 'N/A'}</p>
                                </div>
                                <button onClick={() => setViewingAgreement(null)} className="text-gray-400 hover:text-gray-600 focus:outline-none p-2 rounded-full hover:bg-gray-200 transition-colors">
                                    <X className="h-6 w-6" />
                                </button>
                            </div>
                            <div className="flex-1 overflow-y-auto p-8 relative">
                                <div className="max-w-2xl mx-auto space-y-8">
                                    <div className="prose prose-sm max-w-none p-8 bg-white border border-gray-200 rounded-xl shadow-sm text-gray-800" dangerouslySetInnerHTML={{ __html: versions.find(v => v.id === viewingAgreement.versionId)?.content || 'Error loading content.' }}>
                                    </div>

                                    <div className="bg-gray-50 p-6 rounded-xl border border-gray-200">
                                        <h3 className="font-semibold text-gray-900 mb-4">Executed Signature Record</h3>
                                        <div className="bg-white rounded border border-gray-300 border-dashed p-4 flex justify-center items-center h-32">
                                            {viewingAgreement.signatureData ? (
                                                <img src={viewingAgreement.signatureData} alt="Signature Record" className="max-h-full max-w-full" />
                                            ) : (
                                                <span className="text-gray-400 italic">No signature graphic data returned.</span>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </>
                    )}
                </div>
            </div>

            {/* Modal: New Version */}
            {showNewVersion && (
                <div className="fixed inset-0 z-[80] overflow-y-auto">
                    <div className="flex min-h-screen items-center justify-center p-4">
                        <div className="fixed inset-0 bg-gray-800/60 backdrop-blur-sm transition-opacity" onClick={() => setShowNewVersion(false)}></div>
                        <div className="relative w-full max-w-3xl transform overflow-hidden rounded-xl bg-white shadow-2xl transition-all">
                            <div className="border-b border-gray-200 bg-gray-50 px-6 py-4 flex justify-between items-center">
                                <h3 className="text-lg font-semibold text-gray-900">Create Contract Template</h3>
                                <button onClick={() => setShowNewVersion(false)} className="text-gray-400 hover:text-gray-600"><X className="h-5 w-5" /></button>
                            </div>
                            <div className="px-6 py-6 pb-12">
                                <div className="space-y-6">
                                    <div>
                                        <label className="block text-sm font-semibold text-gray-700 mb-2">Template Title / Version Name</label>
                                        <input
                                            type="text"
                                            value={newVersionTitle}
                                            onChange={(e) => setNewVersionTitle(e.target.value)}
                                            placeholder="e.g. Master Builder Agreement 2026 - Standard"
                                            className="w-full rounded-md border border-gray-300 py-2.5 px-3 text-sm focus:border-[#0f172a] focus:outline-none focus:ring-[#0f172a]"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-semibold text-gray-700 mb-2">Contract Body Content</label>
                                        <div className="bg-white border-gray-300 rounded-md">
                                            <ReactQuill
                                                theme="snow"
                                                value={newVersionContent}
                                                onChange={setNewVersionContent}
                                                className="h-[250px] mb-12"
                                                modules={{
                                                    toolbar: [
                                                        [{ 'header': [1, 2, 3, false] }],
                                                        ['bold', 'italic', 'underline', 'strike'],
                                                        [{ 'list': 'ordered' }, { 'list': 'bullet' }],
                                                        ['clean']
                                                    ]
                                                }}
                                            />
                                        </div>
                                    </div>
                                </div>
                            </div>
                            <div className="bg-gray-50 px-6 py-4 border-t border-gray-100 flex justify-end gap-3 z-20 relative">
                                <button
                                    onClick={() => setShowNewVersion(false)}
                                    className="rounded-md bg-white px-4 py-2.5 text-sm font-semibold text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 hover:bg-gray-50 mt-4 md:mt-0"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={handleSaveVersion}
                                    className="rounded-md bg-[#0f172a] px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-black focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0f172a] mt-4 md:mt-0"
                                >
                                    Publish Version
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Modal: Issue Agreement */}
            {showNewAgreement && (
                <div className="fixed inset-0 z-[80] overflow-y-auto">
                    <div className="flex min-h-screen items-center justify-center p-4">
                        <div className="fixed inset-0 bg-gray-800/60 backdrop-blur-sm transition-opacity" onClick={() => setShowNewAgreement(false)}></div>
                        <div className="relative w-full max-w-md transform overflow-hidden rounded-xl bg-white shadow-2xl transition-all">
                            <div className="border-b border-gray-200 bg-gray-50 px-6 py-4 flex justify-between items-center">
                                <h3 className="text-lg font-semibold text-gray-900">Issue Agreement</h3>
                                <button onClick={() => setShowNewAgreement(false)} className="text-gray-400 hover:text-gray-600"><X className="h-5 w-5" /></button>
                            </div>
                            <div className="px-6 py-6">
                                <div className="space-y-5">
                                    <div>
                                        <label className="block text-sm font-semibold text-gray-700 mb-2">Select Builder</label>
                                        <select
                                            value={selectedBuilderForAgreement}
                                            onChange={(e) => setSelectedBuilderForAgreement(e.target.value)}
                                            className="block w-full rounded-md border-gray-300 py-3 pl-3 pr-10 text-base focus:border-[#0f172a] focus:outline-none focus:ring-[#0f172a] sm:text-sm border shadow-sm"
                                        >
                                            <option value="" disabled>Choose a builder...</option>
                                            {builders.map(b => (
                                                <option key={b.id} value={b.id}>{b.companyName} ({b.ownerName})</option>
                                            ))}
                                        </select>
                                    </div>
                                    <div>
                                        <label className="block text-sm font-semibold text-gray-700 mb-2">Contract Version</label>
                                        <select
                                            value={selectedVersionForAgreement}
                                            onChange={(e) => setSelectedVersionForAgreement(e.target.value)}
                                            className="block w-full rounded-md border-gray-300 py-3 pl-3 pr-10 text-base focus:border-[#0f172a] focus:outline-none focus:ring-[#0f172a] sm:text-sm border shadow-sm"
                                        >
                                            <option value="" disabled>Choose a version template...</option>
                                            {versions.map(v => (
                                                <option key={v.id} value={v.id}>{v.title}</option>
                                            ))}
                                        </select>
                                    </div>
                                </div>
                            </div>
                            <div className="bg-gray-50 px-6 py-4 border-t border-gray-100 flex justify-end gap-3">
                                <button
                                    onClick={() => setShowNewAgreement(false)}
                                    className="rounded-md bg-white px-4 py-2.5 text-sm font-semibold text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 hover:bg-gray-50"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={handleIssueAgreement}
                                    className="rounded-md bg-[#0f172a] px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-black focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0f172a]"
                                >
                                    Issue Contract
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default Contracts;
