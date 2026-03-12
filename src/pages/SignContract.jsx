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

            // Call Cloud Function for Finalization
            const response = await fetch('https://europe-west2-benchmark-intelligence-a5b7c.cloudfunctions.net/signContract', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    agreementId: agreementId,
                    signatureData: signatureData
                })
            });

            if (!response.ok) {
                const errData = await response.json();
                throw new Error(errData.error || `Server responded with ${response.status}`);
            }

            const result = await response.json();
            console.log("Contract finalized successfully:", result);

            setSigned(true);
            setIsSubmitting(false);
        } catch (err) {
            console.error("Error signing agreement:", err);
            alert(`Failed to submit signature: ${err.message}`);
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
                <div className="bg-white p-10 rounded-2xl shadow-xl max-w-lg w-full text-center border border-green-100 animate-in fade-in zoom-in duration-500">
                    <div className="h-20 w-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
                        <CheckCircle2 className="h-12 w-12 text-green-600" />
                    </div>
                    <h1 className="text-3xl font-bold text-gray-900 mb-3">Contract Signed</h1>
                    <p className="text-gray-600 mb-4">
                        Thank you! Your signature has been securely recorded and the document is now finalized.
                    </p>
                    <div className="bg-blue-50 p-6 rounded-xl border border-blue-100 mb-8 space-y-3">
                        <div className="flex items-center gap-3 justify-center">
                            <ShieldCheck className="h-5 w-5 text-blue-600" />
                            <span className="text-sm font-semibold text-blue-800">Tamper-Sealed & Legally Binding</span>
                        </div>
                        <p className="text-xs text-blue-600 leading-relaxed">
                            A finalized, timestamped PDF of this agreement has been automatically emailed to <strong>{builder?.email}</strong> for your permanent records.
                        </p>
                    </div>
                    <div className="flex justify-between items-center px-4 py-2 bg-gray-50 rounded-lg text-[10px] text-gray-500 font-mono">
                        <span>REF ID: BRA-{agreementId.substring(0, 8).toUpperCase()}</span>
                        <span>{new Date().toISOString()}</span>
                    </div>
                </div>
            </div>
        );
    }

    // Passcode lock screen removed per user request

    const filledContent = autofillContract(version?.content, builder, null);

    return (
        <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
            <div className="w-full max-w-4xl bg-white rounded-2xl shadow-lg border border-gray-200 p-6 md:p-8">
                <header className="mb-6 border-b border-gray-200 pb-4">
                    <h1 className="text-2xl font-semibold text-gray-900">
                        {version?.title || 'Agreement'}
                    </h1>
                    <p className="mt-2 text-sm text-gray-600">
                        Please review the agreement below and provide your digital signature to confirm your acceptance.
                    </p>
                    <div className="mt-3 text-xs text-gray-500">
                        <div>Builder: <span className="font-medium">{builder?.companyName}</span></div>
                        <div>Issued: {agreement?.dateIssued ? new Date(agreement.dateIssued.toDate()).toLocaleDateString() : 'N/A'}</div>
                    </div>
                </header>

                <section className="mb-8">
                    <div
                        className="prose prose-sm max-w-none text-gray-800 contract-content break-words overflow-x-hidden border border-gray-200 rounded-lg p-4 bg-gray-50"
                        dangerouslySetInnerHTML={{ __html: filledContent }}
                    />
                </section>

                <section className="space-y-4">
                    <div className="flex items-center justify-between">
                        <h2 className="text-lg font-semibold text-gray-900">Digital Signature</h2>
                        <button
                            type="button"
                            onClick={() => sigPad.current.clear()}
                            className="text-xs font-medium text-blue-600 hover:text-blue-800"
                        >
                            Clear signature
                        </button>
                    </div>

                    <div className="border-2 border-gray-300 rounded-lg bg-white overflow-hidden">
                        <SignatureCanvas
                            penColor="black"
                            canvasProps={{
                                className: 'w-full h-48',
                                style: { width: '100%', height: '200px' }
                            }}
                            ref={sigPad}
                        />
                    </div>

                    <div className="flex items-start gap-3 p-3 bg-blue-50 rounded-lg border border-blue-100">
                        <input
                            id="consent-check"
                            type="checkbox"
                            checked={isConsentGiven}
                            onChange={(e) => setIsConsentGiven(e.target.checked)}
                            className="mt-1 h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                        />
                        <label
                            htmlFor="consent-check"
                            className="text-xs text-blue-900 leading-relaxed cursor-pointer"
                        >
                            By clicking 'Confirm intent & sign agreement', I acknowledge that I have read the terms
                            above and consent to use electronic records and signatures in place of paper documents.
                            I understand that my electronic signature is as legally binding as a handwritten one.
                        </label>
                    </div>

                    <button
                        type="button"
                        onClick={handleSign}
                        disabled={isSubmitting}
                        className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-[#0f172a] px-4 py-3 text-sm font-semibold text-white shadow-sm hover:bg-black disabled:opacity-60 disabled:cursor-not-allowed"
                    >
                        {isSubmitting ? (
                            <Loader2 className="h-5 w-5 animate-spin" />
                        ) : (
                            <>
                                <CheckCircle2 className="h-5 w-5 text-green-300" />
                                Confirm intent & sign agreement
                            </>
                        )}
                    </button>
                </section>
            </div>
        </div>
    );
};

export default SignContract;
