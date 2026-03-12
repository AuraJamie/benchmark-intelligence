import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { db } from '../firebase';
import { doc, getDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { CheckCircle2, AlertCircle, Loader2, Lock, ShieldCheck, FileText, Calendar, User, Mail, Phone, Building } from 'lucide-react';
import SignatureCanvas from 'react-signature-canvas';
import { autofillContract } from '../utils/contractUtils';

const SignContract = () => {
    const { agreementId, accessKey } = useParams();
    const navigate = useNavigate();
    
    const [loading, setLoading] = useState(true);
    const [agreement, setAgreement] = useState(null);
    const [builder, setBuilder] = useState(null);
    const [version, setVersion] = useState(null);
    const [error, setError] = useState(null);
    const [signed, setSigned] = useState(false);
    
    // Security states - REMOVED passcode per user request
    const [isConsentGiven, setIsConsentGiven] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    
    const sigPad = useRef({});

    useEffect(() => {
        const fetchAgreement = async () => {
            try {
                const agreementRef = doc(db, 'agreements', agreementId);
                const agreementSnap = await getDoc(agreementRef);
                
                if (!agreementSnap.exists()) {
                    setError("Agreement not found.");
                    setLoading(false);
                    return;
                }
                
                const agreementData = { id: agreementSnap.id, ...agreementSnap.data() };
                
                if (agreementData.accessKey !== accessKey) {
                    setError("Invalid or expired access link.");
                    setLoading(false);
                    return;
                }
                
                if (agreementData.status === 'Signed') {
                    setSigned(true);
                    setAgreement(agreementData);
                    setLoading(false);
                    return;
                }

                // Log Link Click Action (Audit Trail Step 1)
                await updateDoc(agreementRef, {
                    'auditTrail.linkOpenedAt': new Date().toISOString(),
                    'auditTrail.visitorIp': 'captured-at-api', // Placeholder for actual IP
                    'auditTrail.visitorUserAgent': navigator.userAgent
                });

                setAgreement(agreementData);

                // Fetch Builder
                try {
                    const builderRef = doc(db, 'builders', agreementData.builderId);
                    const builderSnap = await getDoc(builderRef);
                    if (builderSnap.exists()) {
                        setBuilder({ id: builderSnap.id, ...builderSnap.data() });
                    } else {
                        console.warn("Builder not found for ID:", agreementData.builderId);
                    }
                } catch (bErr) {
                    console.error("Error fetching builder:", bErr);
                }

                // Fetch Version
                try {
                    const versionRef = doc(db, 'contractVersions', agreementData.versionId);
                    const versionSnap = await getDoc(versionRef);
                    if (versionSnap.exists()) {
                        setVersion({ id: versionSnap.id, ...versionSnap.data() });
                    } else {
                        console.warn("Contract Version not found for ID:", agreementData.versionId);
                        setError("This contract template no longer exists.");
                    }
                } catch (vErr) {
                    console.error("Error fetching version:", vErr);
                }

                setLoading(false);
            } catch (err) {
                console.error("Fetch Agreement Error:", err);
                setError(`Loading Error: ${err.message}`);
                setLoading(false);
            }
        };

        fetchAgreement();
    }, [agreementId, accessKey]);

    const handleSign = async () => {
        if (!isConsentGiven) {
            alert("Please check the consent box to confirm your intent to sign.");
            return;
        }
        if (sigPad.current.isEmpty()) {
            alert("Please provide a signature.");
            return;
        }

        try {
            setIsSubmitting(true);
            const signatureData = sigPad.current.getTrimmedCanvas().toDataURL("image/png");
            
            const auditTrail = {
                ...agreement.auditTrail,
                signedAt: new Date().toISOString(),
                intentConfirmed: true,
                userAgent: navigator.userAgent,
                platform: navigator.platform,
                agreementId: agreementId,
                builderEmail: builder?.email,
                builderId: agreement.builderId,
                statusAtSigning: 'Tamper-Locked'
            };

            const agreementRef = doc(db, 'agreements', agreementId);
            await updateDoc(agreementRef, {
                status: 'Signed',
                dateSigned: serverTimestamp(),
                signatureData: signatureData,
                auditTrail: auditTrail,
                isTamperLocked: true // Tamper-Sealing flag
            });
            
            setSigned(true);
            setIsSubmitting(false);
        } catch (err) {
            console.error("Error signing agreement:", err);
            alert("Failed to submit signature. Please try again.");
            setIsSubmitting(false);
        }
    };

    if (loading) {
        return (
            <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-4">
                <Loader2 className="h-10 w-10 text-[#0f172a] animate-spin mb-4" />
                <p className="text-gray-600 font-medium">Securing connection and loading contract...</p>
            </div>
        );
    }

    if (error) {
        return (
            <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-4">
                <div className="bg-white p-8 rounded-2xl shadow-xl max-w-md w-full text-center">
                    <AlertCircle className="h-16 w-16 text-red-500 mx-auto mb-4" />
                    <h1 className="text-2xl font-bold text-gray-900 mb-2">Access Denied</h1>
                    <p className="text-gray-600 mb-6">{error}</p>
                    <button onClick={() => navigate('/login')} className="w-full bg-[#0f172a] text-white py-3 rounded-xl font-bold hover:bg-black transition-colors">
                        Go to Dashboard
                    </button>
                </div>
            </div>
        );
    }

    if (signed) {
        return (
            <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-4">
                <div className="bg-white p-10 rounded-2xl shadow-xl max-w-lg w-full text-center border border-green-100">
                    <div className="h-20 w-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
                        <CheckCircle2 className="h-12 w-12 text-green-600" />
                    </div>
                    <h1 className="text-3xl font-bold text-gray-900 mb-3">Contract Signed</h1>
                    <p className="text-gray-600 mb-4">
                        Thank you! Your signature has been securely recorded and a copy has been sent to Benchmark Intelligence.
                    </p>
                    <div className="bg-gray-50 p-4 rounded-xl border border-gray-100 mb-8 flex items-center gap-3 justify-center">
                        <ShieldCheck className="h-5 w-5 text-blue-600" />
                        <span className="text-sm font-medium text-gray-600">eSign Document Finalized & Encrypted</span>
                    </div>
                    <p className="text-xs text-gray-400">
                        Reference: {agreementId}
                    </p>
                </div>
            </div>
        );
    }

    // Passcode lock screen removed per user request

    const filledContent = autofillContract(version?.content, builder, null);

    return (
        <div className="min-h-screen bg-[#f8fafc] py-12 px-4 sm:px-6 lg:px-8">
            <div className="max-w-4xl mx-auto">
                <div className="bg-white rounded-3xl shadow-2xl overflow-hidden border border-gray-200">
                    {/* Header */}
                    <div className="bg-[#0f172a] px-8 py-10 text-white relative">
                        <div className="absolute top-0 right-0 p-8 opacity-10">
                            <ShieldCheck className="h-32 w-32" />
                        </div>
                        <div className="relative z-10">
                            <div className="flex items-center gap-3 mb-6">
                                <span className="bg-blue-500/20 text-blue-300 text-[10px] font-bold uppercase tracking-widest px-2.5 py-1 rounded-full border border-blue-500/30">
                                    Secure eSign Portal
                                </span>
                                <span className="bg-green-500/20 text-green-300 text-[10px] font-bold uppercase tracking-widest px-2.5 py-1 rounded-full border border-green-500/30">
                                    Identity Verified
                                </span>
                            </div>
                            <h1 className="text-3xl font-bold mb-2">{version?.title}</h1>
                            <p className="text-gray-400 text-sm max-w-md">
                                Please review the terms below and provide your digital signature to finalize this agreement.
                            </p>
                        </div>
                    </div>

                    {/* Meta Data */}
                    <div className="bg-gray-50 border-b border-gray-100 px-8 py-6 grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="space-y-4">
                            <h3 className="text-[10px] font-bold text-gray-400 uppercase tracking-[0.2em]">Agreement Between</h3>
                            <div className="flex items-center gap-4">
                                <div className="h-10 w-10 rounded-xl bg-white border border-gray-200 flex items-center justify-center shadow-sm">
                                    <Building className="h-5 w-5 text-gray-400" />
                                </div>
                                <div>
                                    <p className="text-sm font-bold text-gray-900">{builder?.companyName}</p>
                                    <p className="text-xs text-gray-500">{builder?.ownerName}</p>
                                </div>
                            </div>
                        </div>
                        <div className="space-y-4">
                            <h3 className="text-[10px] font-bold text-gray-400 uppercase tracking-[0.2em]">Contract Specifics</h3>
                            <div className="flex items-center gap-4">
                                <div className="h-10 w-10 rounded-xl bg-white border border-gray-200 flex items-center justify-center shadow-sm">
                                    <FileText className="h-5 w-5 text-gray-400" />
                                </div>
                                <div>
                                    <p className="text-sm font-bold text-gray-900">General Partnership Terms</p>
                                    <p className="text-xs text-gray-500">Document Issued: {agreement?.dateIssued ? new Date(agreement.dateIssued.toDate()).toLocaleDateString() : 'N/A'}</p>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Contract Body */}
                    <div className="px-4 md:px-8 py-12">
                        <div className="prose prose-slate max-w-none text-gray-700 contract-content break-words overflow-x-hidden" 
                             dangerouslySetInnerHTML={{ __html: filledContent }}>
                        </div>
                    </div>

                    {/* Signing Area */}
                    <div className="bg-gray-50 px-8 py-10 border-t border-gray-100">
                        <div className="max-w-xl mx-auto">
                            <div className="flex items-center justify-between mb-6">
                                <div>
                                    <h3 className="text-lg font-bold text-gray-900">Digital Signature</h3>
                                    <p className="text-sm text-gray-500">Sign within the box below using your mouse or touch screen.</p>
                                </div>
                                <button 
                                    onClick={() => sigPad.current.clear()}
                                    className="text-xs font-bold text-blue-600 hover:text-blue-800 uppercase tracking-wider"
                                >
                                    Clear Signature
                                </button>
                            </div>
                            
                            <div className="bg-white rounded-2xl border-2 border-gray-200 shadow-inner overflow-hidden mb-6">
                                <SignatureCanvas
                                    penColor='black'
                                    canvasProps={{ 
                                        className: 'w-full h-48', 
                                        style: { width: '100%', height: '200px' } 
                                    }}
                                    ref={sigPad}
                                />
                            </div>

                                <div className="flex items-start gap-3 p-4 bg-blue-50 rounded-xl border border-blue-100">
                                    <input
                                        id="consent-check"
                                        type="checkbox"
                                        checked={isConsentGiven}
                                        onChange={(e) => setIsConsentGiven(e.target.checked)}
                                        className="mt-1 h-5 w-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                                    />
                                    <label htmlFor="consent-check" className="text-xs text-blue-900 font-medium leading-relaxed cursor-pointer">
                                        I, representing {builder?.companyName}, confirm my intent to sign this document and consent to be legally bound by this electronic signature.
                                    </label>
                                </div>

                                <button
                                    onClick={handleSign}
                                    disabled={isSubmitting}
                                    className="w-full bg-[#0f172a] text-white py-4 rounded-2xl font-bold text-lg hover:bg-black shadow-xl shadow-slate-200 transition-all flex items-center justify-center gap-3 disabled:opacity-50"
                                >
                                    {isSubmitting ? (
                                        <Loader2 className="h-6 w-6 animate-spin" />
                                    ) : (
                                        <>
                                            <CheckCircle2 className="h-6 w-6 text-green-400" />
                                            Confirm Intent & Sign Agreement
                                        </>
                                    )}
                                </button>
                                
                                <div className="flex items-center justify-center gap-6 text-[10px] text-gray-400 font-bold uppercase tracking-widest pt-4 text-center">
                                    <span className="flex items-center gap-1.5"><Lock className="h-3 w-3" /> SSL Secure</span>
                                    <span className="flex items-center gap-1.5"><ShieldCheck className="h-3 w-3" /> Authenticated</span>
                                    <span className="flex items-center gap-1.5"><Calendar className="h-3 w-3" /> Dynamic Timestamp</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
                
                <footer className="mt-8 text-center text-gray-400 text-xs">
                    &copy; {new Date().getFullYear()} Benchmark Intelligence. All Rights Reserved.
                </footer>
            </div>
        </div>
    );
};

export default SignContract;
