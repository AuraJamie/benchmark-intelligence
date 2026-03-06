import { useSearchParams } from 'react-router-dom';
import { useState } from 'react';
import { Network, CheckCircle2 } from 'lucide-react';

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

    const handleSubmit = (e) => {
        e.preventDefault();
        if (formData.consentGiven) {
            setSubmitted(true);
            // In Phase 4, we will submit to Firestore and update project status
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
                    {projectId && (
                        <p className="mt-2 text-sm text-gray-600 bg-gray-50 border border-gray-100 p-3 rounded-lg">
                            Regarding your approved extension at: <br />
                            <span className="font-semibold text-gray-900 mt-1 block">123 Fake Street, York</span>
                        </p>
                    )}
                    {!projectId && (
                        <p className="mt-2 text-sm text-gray-500">
                            Please enter your details to receive quotes from our curated network of contractors.
                        </p>
                    )}
                </div>

                <form onSubmit={handleSubmit} className="space-y-5">
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
                        className="w-full rounded-lg bg-[#0f172a] px-4 py-3.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-black focus:outline-none focus:ring-2 focus:ring-[#0f172a] focus:ring-offset-2 mt-2"
                    >
                        Submit Details
                    </button>
                </form>
            </div>
        </div>
    );
};

export default Capture;
