import { useState, useEffect } from 'react';
import { collection, query, onSnapshot, orderBy } from 'firebase/firestore';
import { db } from '../firebase';
import { Network, Activity, FileSignature, Receipt, Users, Home, Loader2 } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts';

// Format: 'YYYY-MM-DD'
const getDateFormat = (date) => {
    return date.toISOString().split('T')[0];
};

const Dashboard = () => {
    const [loading, setLoading] = useState(true);
    const [stats, setStats] = useState({
        totalProjects: 0,
        pendingContracts: 0,
        unpaidInvoices: 0,
        availableBuilders: 0,
        lastScrapeTime: null,
        statusCounts: { New: 0, Contacted: 0, Assigned: 0, Dead: 0 }
    });

    const [chartData, setChartData] = useState([]);

    useEffect(() => {
        let unsubscribeProjects;
        let unsubscribeBuilders;
        let unsubscribeContracts;
        let unsubscribeInvoices;

        const fetchData = () => {
            // Let's do parallel listeners
            const projectsQuery = query(collection(db, 'projects'), orderBy('timestamp', 'desc'));
            unsubscribeProjects = onSnapshot(projectsQuery, (snapshot) => {
                const projData = snapshot.docs.map(doc => doc.data());

                let newCount = 0; let contactedCount = 0; let assignedCount = 0; let deadCount = 0;
                const recentDatesCount = {};
                let latestTime = null;

                // For last 14 days chart
                const today = new Date();
                for (let i = 13; i >= 0; i--) {
                    const d = new Date(today);
                    d.setDate(d.getDate() - i);
                    recentDatesCount[getDateFormat(d)] = 0;
                }

                projData.forEach(p => {
                    // Status tallies
                    if (p.status === 'New') newCount++;
                    else if (p.status === 'Contacted') contactedCount++;
                    else if (p.status === 'Assigned') assignedCount++;
                    else if (p.status === 'Dead') deadCount++;

                    // Find latest scrape (assuming timestamp is serverTimestamp of scrape)
                    if (p.timestamp && p.timestamp.toDate) {
                        const pTime = p.timestamp.toDate();
                        if (!latestTime || pTime > latestTime) latestTime = pTime;
                    }

                    // Tally New Projects chart using dateDecided
                    if (p.dateDecided) {
                        const dTime = new Date(p.dateDecided);
                        if (!isNaN(dTime.getTime())) {
                            const dStr = getDateFormat(dTime);
                            if (recentDatesCount[dStr] !== undefined) {
                                recentDatesCount[dStr]++;
                            }
                        }
                    }
                });

                // Format chart data
                const cData = Object.keys(recentDatesCount).map(date => ({
                    date,
                    count: recentDatesCount[date]
                }));
                setChartData(cData);

                setStats(prev => ({
                    ...prev,
                    totalProjects: projData.length,
                    lastScrapeTime: latestTime,
                    statusCounts: {
                        New: newCount,
                        Contacted: contactedCount,
                        Assigned: assignedCount,
                        Dead: deadCount
                    }
                }));
            });

            const buildersQuery = query(collection(db, 'builders'));
            unsubscribeBuilders = onSnapshot(buildersQuery, (snapshot) => {
                let available = 0;
                snapshot.forEach(doc => {
                    if (doc.data().availability === true) available++;
                });
                setStats(prev => ({ ...prev, availableBuilders: available }));
            });

            const contractsQuery = query(collection(db, 'contracts'));
            unsubscribeContracts = onSnapshot(contractsQuery, (snapshot) => {
                let pending = 0;
                snapshot.forEach(doc => {
                    if (doc.data().status === 'Pending' || doc.data().status === 'pending') pending++;
                });
                setStats(prev => ({ ...prev, pendingContracts: pending }));
            });

            const invoicesQuery = query(collection(db, 'invoices'));
            unsubscribeInvoices = onSnapshot(invoicesQuery, (snapshot) => {
                let unpaid = 0;
                snapshot.forEach(doc => {
                    if (doc.data().status === 'Unpaid' || doc.data().status === 'unpaid') unpaid++;
                });
                setStats(prev => ({ ...prev, unpaidInvoices: unpaid }));
                setLoading(false);
            });
        };

        fetchData();

        return () => {
            if (unsubscribeProjects) unsubscribeProjects();
            if (unsubscribeBuilders) unsubscribeBuilders();
            if (unsubscribeContracts) unsubscribeContracts();
            if (unsubscribeInvoices) unsubscribeInvoices();
        };
    }, []);

    const COLORS = ['#3b82f6', '#eab308', '#22c55e', '#ef4444'];
    const pieData = [
        { name: 'New', value: stats.statusCounts.New },
        { name: 'Contacted', value: stats.statusCounts.Contacted },
        { name: 'Assigned', value: stats.statusCounts.Assigned },
        { name: 'Dead', value: stats.statusCounts.Dead }
    ];

    if (loading) {
        return (
            <div className="flex h-full items-center justify-center p-8">
                <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
            </div>
        );
    }

    return (
        <div className="w-full relative flex flex-col h-full overflow-hidden">
            <header className="mb-6 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 shrink-0">
                <div>
                    <h1 className="text-3xl font-semibold tracking-tight">Dashboard</h1>
                    <p className="mt-2 text-sm text-gray-500">Live overview and key metrics from the platform.</p>
                </div>
                {stats.lastScrapeTime && (
                    <div className="bg-blue-50 text-blue-800 text-xs font-medium px-3 py-1.5 rounded-full border border-blue-200 shadow-sm flex items-center gap-2">
                        <Activity className="h-3.5 w-3.5" />
                        Last Scrape: {stats.lastScrapeTime.toLocaleString()}
                    </div>
                )}
            </header>

            <div className="flex-1 overflow-auto pb-6 w-full">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8 w-full max-w-7xl">
                    {/* Stat Cards */}
                    <div className="bg-blue-50 p-6 rounded-xl border border-gray-200 shadow-sm flex items-center gap-4">
                        <div className="bg-blue-50 p-3 rounded-lg"><Home className="h-6 w-6 text-blue-600" /></div>
                        <div>
                            <p className="text-sm font-medium text-gray-500">New Projects</p>
                            <p className="text-2xl font-semibold text-gray-900">{stats.statusCounts.New}</p>
                        </div>
                    </div>
                    <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm flex items-center gap-4">
                        <div className="bg-green-50 p-3 rounded-lg"><Users className="h-6 w-6 text-green-600" /></div>
                        <div>
                            <p className="text-sm font-medium text-gray-500">Available Builders</p>
                            <p className="text-2xl font-semibold text-gray-900">{stats.availableBuilders}</p>
                        </div>
                    </div>
                    <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm flex items-center gap-4">
                        <div className="bg-orange-50 p-3 rounded-lg"><FileSignature className="h-6 w-6 text-orange-600" /></div>
                        <div>
                            <p className="text-sm font-medium text-gray-500">Pending Contracts</p>
                            <p className="text-2xl font-semibold text-gray-900">{stats.pendingContracts}</p>
                        </div>
                    </div>
                    <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm flex items-center gap-4">
                        <div className="bg-purple-50 p-3 rounded-lg"><Receipt className="h-6 w-6 text-purple-600" /></div>
                        <div>
                            <p className="text-sm font-medium text-gray-500">Unpaid Invoices</p>
                            <p className="text-2xl font-semibold text-gray-900">{stats.unpaidInvoices}</p>
                        </div>
                    </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 w-full max-w-7xl">
                    <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm min-h-[350px] flex flex-col">
                        <h3 className="text-sm font-semibold mb-6 uppercase tracking-wider text-gray-500">New Projects (Last 14 Days)</h3>
                        <div className="flex-1 w-full relative min-h-[250px]">
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={chartData} margin={{ top: 5, right: 5, left: -20, bottom: 5 }}>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" />
                                    <XAxis
                                        dataKey="date"
                                        tickFormatter={(val) => {
                                            const d = new Date(val);
                                            return `${d.getDate()}/${d.getMonth() + 1}`;
                                        }}
                                        axisLine={false}
                                        tickLine={false}
                                        tick={{ fill: '#6B7280', fontSize: 12 }}
                                        dy={10}
                                    />
                                    <YAxis axisLine={false} tickLine={false} tick={{ fill: '#6B7280', fontSize: 12 }} />
                                    <RechartsTooltip
                                        cursor={{ fill: '#F3F4F6' }}
                                        contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                                    />
                                    <Bar dataKey="count" fill="#0f172a" radius={[4, 4, 0, 0]} maxBarSize={40} />
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    </div>

                    <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm min-h-[350px] flex flex-col items-center">
                        <h3 className="text-sm font-semibold mb-2 uppercase tracking-wider text-gray-500 w-full text-left">Project Breakdown</h3>
                        <div className="flex-1 w-full relative flex items-center justify-center min-h-[250px]">
                            <ResponsiveContainer width="100%" height="100%">
                                <PieChart>
                                    <Pie
                                        data={pieData}
                                        cx="50%"
                                        cy="50%"
                                        innerRadius={60}
                                        outerRadius={100}
                                        paddingAngle={2}
                                        dataKey="value"
                                        stroke="none"
                                    >
                                        {pieData.map((entry, index) => (
                                            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                        ))}
                                    </Pie>
                                    <RechartsTooltip
                                        contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                                    />
                                    <Legend iconType="circle" wrapperStyle={{ fontSize: '12px' }} />
                                </PieChart>
                            </ResponsiveContainer>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default Dashboard;
