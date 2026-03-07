import Sidebar from './Sidebar';
import { Menu } from 'lucide-react';
import { useState } from 'react';

const Layout = ({ children }) => {
    const [sidebarOpen, setSidebarOpen] = useState(false);

    return (
        <div className="flex bg-gray-50 h-screen overflow-hidden font-sans text-[#0f172a]">
            {/* Mobile overlay */}
            {sidebarOpen && (
                <div
                    className="fixed inset-0 bg-gray-800/50 z-40 md:hidden"
                    onClick={() => setSidebarOpen(false)}
                />
            )}

            {/* Sidebar wrapper */}
            <div className={`fixed inset-y-0 left-0 z-50 transform ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'} md:relative md:translate-x-0 transition duration-200 ease-in-out`}>
                <Sidebar />
            </div>

            {/* Main content */}
            <main className="flex-1 overflow-auto w-full min-w-0">
                {/* Mobile header */}
                <div className="md:hidden flex items-center p-4 bg-white border-b border-gray-200">
                    <button onClick={() => setSidebarOpen(true)} className="p-2 -ml-2 mr-2 text-gray-600 hover:bg-gray-100 rounded-md">
                        <Menu className="h-6 w-6" />
                    </button>
                    <span className="font-semibold text-[17px] truncate">Benchmark Intelligence</span>
                </div>
                <div className="p-4 md:p-8">
                    {children}
                </div>
            </main>
        </div>
    );
};

export default Layout;
