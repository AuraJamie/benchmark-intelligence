import { useSearchParams } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { Network, CheckCircle2, Loader2 } from 'lucide-react';
import { db } from '../firebase';
import { doc, getDoc, getDocs, addDoc, collection, updateDoc, serverTimestamp, query, where } from 'firebase/firestore';

const Capture = () => {
    const [searchParams] = useSearchParams();
    const projectId = searchParams.get('id');
    const [submitted, setSubmitted] = useState(false);
    const [formData, setFormData] = useState({
        fullName: '',
        phone: '',
        email: '',
        consentGiven: false,
    });

    const [loadingProject, setLoadingProject] = useState(false);
    const [projectData, setProjectData] = useState(null);
    const [allProjects, setAllProjects] = useState([]);
    const [selectedAddress, setSelectedAddress] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState(null);

    useEffect(() => {
        if (projectId) {
            const fetchProject = async () => {
                setLoadingProject(true);
                try {
                    const docRef = doc(db, 'projects', projectId);
                    const docSnap = await getDoc(docRef);
                    if (docSnap.exists()) {
                        setProjectData(docSnap.data());
                    } else {
                        setError("Project not found.");
                    }
                } catch (err) {
                    console.error("Error fetching project:", err);
                    setError("Failed to load project details.");
                } finally {
                    setLoadingProject(false);
                }
            };
            fetchProject();
        } else {
            const fetchAllProjects = async () => {
                try {
                    const q = query(collection(db, 'projects'));
                    const snapshot = await getDocs(q);
                    const projectsList = snapshot.docs.map(doc => ({ id: doc.id, address: doc.data().address }));
                    setAllProjects(projectsList);
                } catch (err) {
                    console.error("Error fetching projects for autocomplete", err);
                }
            };
            fetchAllProjects();
        }
    }, [projectId]);

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (formData.consentGiven) {
            setSubmitting(true);
            setError(null);
            try {
                let finalProjectId = projectId;

                if (!projectId && selectedAddress) {
                    const matchedProject = allProjects.find(p => p.address === selectedAddress);
                    if (matchedProject) {
                        finalProjectId = matchedProject.id;
                    }
                }

                // Add to homeowners collection
                await addDoc(collection(db, 'homeowners'), {
                    ...formData,
                    address: selectedAddress || (projectData ? projectData.address : ''),
                    projectId: finalProjectId || null,
                    timestamp: serverTimestamp()
                });

                // Update project status if finalProjectId exists
                if (finalProjectId) {
                    const projectRef = doc(db, 'projects', finalProjectId);
                    await updateDoc(projectRef, {
                        status: 'Contacted',
                        homeownerName: formData.fullName,
                        homeownerEmail: formData.email,
                        homeownerPhone: formData.phone,
                        homeownerSubmissionDate: new Date().toISOString()
                    });
                }

                setSubmitted(true);
            } catch (err) {
                console.error("Error submitting form:", err);
                setError("Failed to submit details. Please try again.");
            } finally {
                setSubmitting(false);
            }
        }
    };

    if (submitted) {
        return (
            <div className="flex min-h-screen flex-col items-center justify-center bg-[#f8fafc] px-4 font-sans text-[#0f172a]">
                <div className="w-full max-w-md rounded-xl border border-[#e2e8f0] bg-white p-8 text-center shadow-sm">
                    <CheckCircle2 className="mx-auto h-16 w-16 text-green-600 mb-6" />
                    <h2 className="text-2xl font-semibold mb-2">Thank You</h2>
                    <p className="text-gray-600 mb-8">
                        Your details have been received. Our vetted builders will be in touch shortly to provide quotes for your extension.
                    </p>
                    <button
                        onClick={() => window.location.reload()}
                        className="text-sm font-medium text-[#0284c7] hover:underline"
                    >
                        Submit another application
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="flex min-h-screen flex-col items-center justify-center bg-[#f8fafc] px-4 py-12 font-sans text-[#0f172a]">
            <div className="mb-8 flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#0f172a] text-white">
                    <Network className="h-6 w-6" />
                </div>
                <span className="text-xl font-semibold tracking-tight text-[#0f172a]">Benchmark Intelligence</span>
            </div>

            <div className="w-full max-w-md rounded-xl border border-[#e2e8f0] bg-white p-8 shadow-sm">
                <div className="mb-8">
                    <h1 className="text-2xl font-semibold tracking-tight">Request Builder Quotes</h1>

                    {loadingProject && (
                        <div className="mt-4 flex items-center justify-center text-sm text-gray-500 gap-2">
                            <Loader2 className="h-4 w-4 animate-spin" /> Loading project details...
                        </div>
                    )}

                    {error && !submitted && (
                        <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                            {error}
                        </div>
                    )}

                    {projectId && projectData && (
                        <p className="mt-4 text-sm text-gray-600 bg-gray-50 border border-gray-100 p-3 rounded-lg">
                            Regarding your approved extension at: <br />
                            <span className="font-semibold text-gray-900 mt-1 block">{projectData.address}</span>
                        </p>
                    )}

                    {!projectId && !loadingProject && (
                        <p className="mt-2 text-sm text-gray-500">
                            Please enter your details to receive quotes from our curated network of contractors.
                        </p>
                    )}
                </div>

                <form onSubmit={handleSubmit} className="space-y-5">
                    {!projectId && (
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1.5">
                                Property Address
                            </label>
                            <input
                                list="addresses"
                                required
                                value={selectedAddress}
                                onChange={(e) => setSelectedAddress(e.target.value)}
                                className="w-full rounded-lg border border-[#e2e8f0] px-4 py-3 text-sm focus:border-[#0f172a] focus:outline-none focus:ring-1 focus:ring-[#0f172a] transition-shadow"
                                placeholder="Start typing your address..."
                            />
                            <datalist id="addresses">
                                {allProjects.map(p => (
                                    <option key={p.id} value={p.address} />
                                ))}
                            </datalist>
                        </div>
                    )}

                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1.5">
                            Full Name
                        </label>
                        <input
                            type="text"
                            required
                            value={formData.fullName}
                            onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
                            className="w-full rounded-lg border border-[#e2e8f0] px-4 py-3 text-sm focus:border-[#0f172a] focus:outline-none focus:ring-1 focus:ring-[#0f172a] transition-shadow"
                            placeholder="John Doe"
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1.5">
                            Phone Number
                        </label>
                        <input
                            type="tel"
                            required
                            value={formData.phone}
                            onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                            className="w-full rounded-lg border border-[#e2e8f0] px-4 py-3 text-sm focus:border-[#0f172a] focus:outline-none focus:ring-1 focus:ring-[#0f172a] transition-shadow"
                            placeholder="07700 900000"
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1.5">
                            Email Address
                        </label>
                        <input
                            type="email"
                            required
                            value={formData.email}
                            onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                            className="w-full rounded-lg border border-[#e2e8f0] px-4 py-3 text-sm focus:border-[#0f172a] focus:outline-none focus:ring-1 focus:ring-[#0f172a] transition-shadow"
                            placeholder="john@example.com"
                        />
                    </div>

                    <div className="flex items-start pt-2">
                        <div className="flex h-5 items-center">
                            <input
                                id="consent"
                                type="checkbox"
                                required
                                checked={formData.consentGiven}
                                onChange={(e) => setFormData({ ...formData, consentGiven: e.target.checked })}
                                className="h-5 w-5 rounded border-[#e2e8f0] text-[#0f172a] focus:ring-[#0f172a]"
                            />
                        </div>
                        <div className="ml-3 text-sm">
                            <label htmlFor="consent" className="font-medium text-gray-700 cursor-pointer">
                                I consent to being contacted by Benchmark Intelligence's vetted network of builders for quotes.
                            </label>
                        </div>
                    </div>

                    <button
                        type="submit"
                        disabled={submitting}
                        className="w-full flex items-center justify-center gap-2 rounded-lg bg-[#0f172a] px-4 py-3.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-black focus:outline-none focus:ring-2 focus:ring-[#0f172a] focus:ring-offset-2 mt-2 disabled:opacity-70"
                    >
                        {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
                        {submitting ? 'Submitting...' : 'Submit Details'}
                    </button>
                </form>
            </div>
        </div>
    );
};

export default Capture;
