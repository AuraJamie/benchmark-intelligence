import { Link, useLocation } from 'react-router-dom';
import { Home, Map as MapIcon, Users, LogOut, Loader2, Network } from 'lucide-react';
import { auth } from '../firebase';
import { signOut } from 'firebase/auth';

const Sidebar = () => {
    const location = useLocation();

    const handleLogout = () => {
        signOut(auth);
    };

    const navItems = [
        { label: 'Projects', icon: Home, path: '/' },
        { label: 'Builders', icon: Users, path: '/builders' },
    ];

    return (
        <div className="flex w-64 flex-col border-r border-gray-200 bg-white min-h-screen">
            <div className="flex h-16 items-center border-b border-gray-100 px-6 mt-4 mb-4 gap-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#0f172a] text-white">
                    <Network className="h-5 w-5" />
                </div>
                <span className="text-[17px] font-semibold tracking-tight text-[#0f172a]">Benchmark<br />Intelligence</span>
            </div>

            <nav className="flex-1 space-y-1.5 p-4">
                {navItems.map((item) => {
                    const isActive = location.pathname === item.path;
                    return (
                        <Link
                            key={item.label}
                            to={item.path}
                            className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${isActive
                                ? 'bg-blue-50 text-[#0284c7]'
                                : 'text-gray-600 hover:bg-gray-100 hover:text-[#0f172a]'
                                }`}
                        >
                            <item.icon className={`h-5 w-5 ${isActive ? 'text-[#0284c7]' : 'text-gray-400'}`} />
                            {item.label}
                        </Link>
                    );
                })}
            </nav>

            <div className="border-t border-gray-100 p-4">
                <button
                    onClick={handleLogout}
                    className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-gray-600 hover:bg-red-50 hover:text-red-700 transition-colors"
                >
                    <LogOut className="h-5 w-5 text-gray-400" />
                    Sign Out
                </button>
            </div>
        </div>
    );
};

export default Sidebar;
