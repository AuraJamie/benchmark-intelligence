import { useState, useEffect, useRef } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { db } from '../firebase';
import { collection, query, orderBy, onSnapshot, addDoc, updateDoc, doc, serverTimestamp, setDoc } from 'firebase/firestore';
import { FileSignature, Plus, X, Search, CheckCircle2, XCircle, AlertCircle } from 'lucide-react';
import ReactQuill from 'react-quill-new';
import 'react-quill-new/dist/quill.snow.css';
import SignatureCanvas from 'react-signature-canvas';
import { Copy, Download, Share2, Printer, MapPin, Building, Phone, Mail } from 'lucide-react';
import { autofillContract, generateAccessKey } from '../utils/contractUtils';
import html2pdf from 'html2pdf.js';

const Contracts = () => {
    const [searchParams, setSearchParams] = useSearchParams();
    const navigate = useNavigate();
    const [activeTab, setActiveTab] = useState('agreements'); // 'agreements' or 'versions'

    // Data states
    const [versions, setVersions] = useState([]);
    const [agreements, setAgreements] = useState([]);
    const [builders, setBuilders] = useState([]);
    const [projects, setProjects] = useState([]);

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

    // Handle URL param selection
    useEffect(() => {
        const id = searchParams.get('id');
        if (id && agreements.length > 0) {
            const agreement = agreements.find(a => a.id === id);
            if (agreement) {
                if (agreement.status === 'Pending') {
                    setSigningAgreement(agreement);
                } else {
                    setViewingAgreement(agreement);
                }
            }
        } else {
            setSigningAgreement(null);
            setViewingAgreement(null);
        }
    }, [searchParams, agreements]);

    const openAgreement = (id) => {
        setSearchParams({ id });
    };

    const closeAgreement = () => {
        setSearchParams({});
    };

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
            const accessKey = generateAccessKey();
            const passcode = Math.floor(100000 + Math.random() * 900000).toString(); // 6-digit OTP
            await addDoc(collection(db, 'agreements'), {
                builderId: selectedBuilderForAgreement,
                versionId: selectedVersionForAgreement,
                status: 'Pending',
                dateIssued: serverTimestamp(),
                dateSigned: null,
                signatureData: null,
                accessKey: accessKey,
                passcode: passcode
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

    const handleDownloadPDF = (agreement) => {
        const builder = builders.find(b => b.id === agreement.builderId);
        const project = projects.find(p => p.id === agreement.projectId);
        const version = versions.find(v => v.id === agreement.versionId);
        const content = autofillContract(version?.content, builder, project, agreement.dateSigned ? agreement.dateSigned.toDate() : agreement.dateIssued.toDate());

        const element = document.createElement('div');
        element.style.padding = '40px';
        element.style.fontFamily = 'Arial, sans-serif';
        element.innerHTML = `
            <div style="margin-bottom: 40px; border-bottom: 2px solid #0f172a; padding-bottom: 20px;">
                <h1 style="color: #0f172a; margin: 0;">Benchmark Intelligence</h1>
                <p style="color: #666; margin: 5px 0 0 0;">Licensed Contract Document - Executed</p>
            </div>
            
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 40px; margin-bottom: 40px;">
                <div>
                    <h3 style="color: #0f172a; font-size: 12px; text-transform: uppercase;">Builder Information</h3>
                    <p style="margin: 5px 0;"><strong>${builder?.companyName}</strong></p>
                    <p style="margin: 3px 0; font-size: 14px;">${builder?.ownerName}</p>
                    <p style="margin: 3px 0; font-size: 14px;">${builder?.email}</p>
                    <p style="margin: 3px 0; font-size: 14px;">${builder?.phone}</p>
                </div>
                <div>
                    <h3 style="color: #0f172a; font-size: 12px; text-transform: uppercase;">Contract Status</h3>
                    <p style="margin: 5px 0;">Status: <strong>${agreement.status}</strong></p>
                    <p style="margin: 3px 0; font-size: 14px;">Issued: ${agreement.dateIssued.toDate().toLocaleDateString()}</p>
                    ${agreement.dateSigned ? `<p style="margin: 3px 0; font-size: 14px;">Signed: ${agreement.dateSigned.toDate().toLocaleString()}</p>` : ''}
                </div>
            </div>

            <div style="margin-bottom: 60px; line-height: 1.6; font-size: 14px;">
                ${content}
            </div>

            ${agreement.status === 'Signed' ? `
            <div style="page-break-inside: avoid; border: 1px solid #eee; padding: 20px; background: #fafafa; border-radius: 8px;">
                <h3 style="margin-top: 0; font-size: 16px;">Executed Signature</h3>
                <img src="${agreement.signatureData}" style="max-height: 100px; margin: 10px 0;" />
                <p style="font-size: 12px; color: #666; margin: 0;"><strong>Signed by:</strong> ${builder?.ownerName} representing ${builder?.companyName}</p>
                <p style="font-size: 12px; color: #666; margin: 0;"><strong>Date:</strong> ${agreement.dateSigned.toDate().toLocaleString()}</p>
                <p style="font-size: 10px; color: #999; margin-top: 10px;">Audit ID: BRA-${agreement.id.substring(0,8).toUpperCase()}</p>
            </div>
            ` : ''}
        `;

        const opt = {
            margin:       1,
            filename:     `Contract_${builder?.companyName.replace(/\s+/g, '_')}_${agreement.id.substring(0,6)}.pdf`,
            image:        { type: 'jpeg', quality: 0.98 },
            html2canvas:  { scale: 2 },
            jsPDF:        { unit: 'in', format: 'letter', orientation: 'portrait' }
        };

        html2pdf().set(opt).from(element).save();
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
                                    <th className="px-6 py-4 font-medium">Passcode</th>
                                    <th className="px-6 py-4 font-medium">Status</th>
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
                                        <tr key={agreement.id} className="hover:bg-gray-50 cursor-pointer" onClick={() => openAgreement(agreement.id)}>
                                            <td className="px-6 py-4">
                                                {getBuilderName(agreement.builderId)}
                                            </td>
                                            <td className="px-6 py-4">
                                                {getVersionTitle(agreement.versionId)}
                                                <div className="text-[10px] text-gray-400 mt-0.5">Issued: {agreement.dateIssued ? new Date(agreement.dateIssued.toDate()).toLocaleDateString() : 'Just now'}</div>
                                            </td>
                                            <td className="px-6 py-4">
                                                <span className="font-mono bg-gray-100 px-2 py-1 rounded text-xs font-bold">{agreement.passcode}</span>
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
                                            <td className="px-6 py-4 text-right flex justify-end gap-2">
                                                {agreement.status === 'Pending' ? (
                                                    <>
                                                        <button 
                                                            onClick={(e) => { 
                                                                e.stopPropagation(); 
                                                                const link = `${window.location.origin}${window.location.pathname}#/sign/${agreement.id}/${agreement.accessKey}`;
                                                                navigator.clipboard.writeText(`Contract Link: ${link}\nYour Passcode: ${agreement.passcode}`);
                                                                alert("Copy link and passcode to clipboard!");
                                                            }} 
                                                            className="p-2 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                                                            title="Copy Signing Link"
                                                        >
                                                            <Copy className="h-4 w-4" />
                                                        </button>
                                                        <button 
                                                            onClick={(e) => { e.stopPropagation(); openAgreement(agreement.id); }} 
                                                            className="px-3 py-1.5 bg-[#0f172a] text-white rounded-lg text-xs font-bold hover:bg-black transition-colors"
                                                        >
                                                            Collect Signature
                                                        </button>
                                                    </>
                                                ) : (
                                                    <>
                                                        <button 
                                                            onClick={(e) => { 
                                                                e.stopPropagation(); 
                                                                handleDownloadPDF(agreement);
                                                            }} 
                                                            className="p-2 text-gray-500 hover:text-green-600 hover:bg-green-50 rounded-lg transition-colors"
                                                            title="Download PDF"
                                                        >
                                                            <Download className="h-4 w-4" />
                                                        </button>
                                                        <button 
                                                            onClick={(e) => { e.stopPropagation(); openAgreement(agreement.id); }} 
                                                            className="px-3 py-1.5 border border-gray-300 text-gray-700 rounded-lg text-xs font-bold hover:bg-gray-50 transition-colors"
                                                        >
                                                            View
                                                        </button>
                                                    </>
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
                                    <div className="flex items-center gap-2 text-sm text-gray-500">
                                        <span>For {getBuilderName(signingAgreement.builderId)}</span>
                                    </div>
                                </div>
                                <button onClick={closeAgreement} className="text-gray-400 hover:text-gray-600 focus:outline-none p-2 rounded-full hover:bg-gray-200 transition-colors">
                                    <X className="h-6 w-6" />
                                </button>
                            </div>
                            <div className="flex-1 overflow-y-auto p-8 relative">
                                <div className="max-w-2xl mx-auto space-y-8">
                                    <div className="prose prose-sm max-w-none p-8 bg-white border border-gray-200 rounded-xl shadow-sm text-gray-800" 
                                         dangerouslySetInnerHTML={{ __html: autofillContract(
                                             versions.find(v => v.id === signingAgreement.versionId)?.content,
                                             builders.find(b => b.id === signingAgreement.builderId)
                                         ) || 'Error loading content.' }}>
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
                                    onClick={closeAgreement}
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
                                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs sm:text-sm">
                                        <p className="text-green-600 font-medium">Signed by {getBuilderName(viewingAgreement.builderId)}</p>
                                        <span className="text-gray-300">|</span>
                                        <p className="text-gray-500">{viewingAgreement.dateSigned ? new Date(viewingAgreement.dateSigned.toDate()).toLocaleString() : 'N/A'}</p>
                                    </div>
                                </div>
                                <button onClick={closeAgreement} className="text-gray-400 hover:text-gray-600 focus:outline-none p-2 rounded-full hover:bg-gray-200 transition-colors">
                                    <X className="h-6 w-6" />
                                </button>
                            </div>
                            <div className="flex-1 overflow-y-auto p-8 relative">
                                <div className="max-w-2xl mx-auto space-y-8">
                                    <div className="prose prose-sm max-w-none p-8 bg-white border border-gray-200 rounded-xl shadow-sm text-gray-800" 
                                         dangerouslySetInnerHTML={{ __html: autofillContract(
                                             versions.find(v => v.id === viewingAgreement.versionId)?.content,
                                             builders.find(b => b.id === viewingAgreement.builderId),
                                             null,
                                             viewingAgreement.dateSigned ? viewingAgreement.dateSigned.toDate() : viewingAgreement.dateIssued.toDate()
                                         ) || 'Error loading content.' }}>
                                    </div>

                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="bg-gray-50 p-4 rounded-xl border border-gray-200">
                                            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Company</p>
                                            <p className="text-sm font-bold text-gray-900">{builders.find(b => b.id === viewingAgreement.builderId)?.companyName}</p>
                                        </div>
                                        <div className="bg-gray-50 p-4 rounded-xl border border-gray-200">
                                            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Signatory</p>
                                            <p className="text-sm font-bold text-gray-900">{builders.find(b => b.id === viewingAgreement.builderId)?.ownerName}</p>
                                        </div>
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
                                    <div className="bg-blue-50 p-4 rounded-lg border border-blue-100 flex gap-3 items-start mb-6">
                                        <AlertCircle className="h-5 w-5 text-blue-600 shrink-0 mt-0.5" />
                                        <div>
                                            <p className="text-xs font-bold text-blue-900 uppercase tracking-widest mb-1">Autofill Guide</p>
                                            <p className="text-xs text-blue-800 mb-2">Use the following tags in your contract body to automatically populate builder data:</p>
                                            <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                                                <code className="text-[10px] bg-white px-1.5 py-0.5 rounded border border-blue-200">{"{{companyName}}"}</code>
                                                <code className="text-[10px] bg-white px-1.5 py-0.5 rounded border border-blue-200">{"{{companyAddress}}"}</code>
                                                <code className="text-[10px] bg-white px-1.5 py-0.5 rounded border border-blue-200">{"{{builderName}}"}</code>
                                                <code className="text-[10px] bg-white px-1.5 py-0.5 rounded border border-blue-200">{"{{builderEmail}}"}</code>
                                                <code className="text-[10px] bg-white px-1.5 py-0.5 rounded border border-blue-200">{"{{builderPhone}}"}</code>
                                                <code className="text-[10px] bg-white px-1.5 py-0.5 rounded border border-blue-200">{"{{projectAddress}}"}</code>
                                            </div>
                                        </div>
                                    </div>
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
