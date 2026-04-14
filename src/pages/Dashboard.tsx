import React, { useMemo } from 'react';
import { 
  Users, 
  PhoneCall, 
  CalendarCheck, 
  TrendingUp,
  ArrowUpRight,
  ArrowDownRight,
  MoreHorizontal,
  Loader2
} from 'lucide-react';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer
} from 'recharts';
import { format, subDays, isSameDay, startOfDay } from 'date-fns';
import { cn } from '../lib/utils';
import { useLeads } from '../hooks/useLeads';
import { useCalls } from '../hooks/useCalls';
import { useAppointments } from '../hooks/useAppointments';

export default function Dashboard() {
  const { leads, loading: leadsLoading } = useLeads();
  const { calls, loading: callsLoading } = useCalls();
  const { appointments, loading: appointmentsLoading } = useAppointments();

  const loading = leadsLoading || callsLoading || appointmentsLoading;

  const chartData = useMemo(() => {
    const last7Days = Array.from({ length: 7 }, (_, i) => subDays(new Date(), 6 - i));
    
    return last7Days.map(day => {
      const dayStart = startOfDay(day);
      const dayCalls = calls.filter(call => isSameDay(new Date(call.createdAt), dayStart)).length;
      const dayBookings = appointments.filter(app => isSameDay(new Date(app.createdAt), dayStart)).length;
      
      return {
        name: format(day, 'EEE'),
        calls: dayCalls,
        bookings: dayBookings,
      };
    });
  }, [calls, appointments]);

  const conversionRate = useMemo(() => {
    if (leads.length === 0) return 0;
    const bookedLeads = new Set(appointments.map(a => a.leadId)).size;
    return (bookedLeads / leads.length) * 100;
  }, [leads, appointments]);

  const stats = [
    { label: 'Total Leads', value: leads.length.toLocaleString(), icon: Users, change: '+12.5%', trend: 'up' },
    { label: 'Calls Made', value: calls.length.toLocaleString(), icon: PhoneCall, change: '+18.2%', trend: 'up' },
    { label: 'Booked Visits', value: appointments.length.toLocaleString(), icon: CalendarCheck, change: '+5.4%', trend: 'up' },
    { label: 'Conversion Rate', value: `${conversionRate.toFixed(1)}%`, icon: TrendingUp, change: '-2.1%', trend: 'down' },
  ];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-zinc-900">Dashboard Overview</h1>
        <p className="text-zinc-500 mt-1">Welcome back, here's what's happening today.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {stats.map((stat) => (
          <div key={stat.label} className="bg-white p-6 rounded-2xl border border-zinc-200 shadow-sm hover:shadow-md transition-shadow relative overflow-hidden">
            {loading && (
              <div className="absolute inset-0 bg-white/50 backdrop-blur-[1px] flex items-center justify-center z-10">
                <Loader2 className="animate-spin text-zinc-400" size={20} />
              </div>
            )}
            <div className="flex items-center justify-between mb-4">
              <div className="p-2 bg-zinc-50 rounded-lg text-zinc-600">
                <stat.icon size={24} />
              </div>
              <div className={cn(
                "flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-full",
                stat.trend === 'up' ? "bg-green-50 text-green-600" : "bg-red-50 text-red-600"
              )}>
                {stat.trend === 'up' ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}
                {stat.change}
              </div>
            </div>
            <p className="text-sm font-medium text-zinc-500">{stat.label}</p>
            <h3 className="text-3xl font-bold text-zinc-900 mt-1">{stat.value}</h3>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 bg-white p-8 rounded-2xl border border-zinc-200 shadow-sm">
          <div className="flex items-center justify-between mb-8">
            <div>
              <h3 className="text-lg font-bold text-zinc-900">Call Performance</h3>
              <p className="text-sm text-zinc-500">Weekly calls and bookings overview</p>
            </div>
            <select className="bg-zinc-50 border-zinc-200 rounded-lg text-sm px-3 py-2 outline-none focus:ring-2 focus:ring-orange-500/20">
              <option>Last 7 Days</option>
              <option>Last 30 Days</option>
            </select>
          </div>
          <div className="h-[300px] w-full relative">
            {loading && (
              <div className="absolute inset-0 bg-white/50 backdrop-blur-[1px] flex items-center justify-center z-10">
                <Loader2 className="animate-spin text-zinc-400" size={32} />
              </div>
            )}
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#71717a', fontSize: 12 }} dy={10} />
                <YAxis axisLine={false} tickLine={false} tick={{ fill: '#71717a', fontSize: 12 }} />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#18181b', border: 'none', borderRadius: '8px', color: '#fff' }}
                  itemStyle={{ color: '#fff' }}
                />
                <Bar dataKey="calls" fill="#f97316" radius={[4, 4, 0, 0]} barSize={32} />
                <Bar dataKey="bookings" fill="#fdba74" radius={[4, 4, 0, 0]} barSize={32} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-white p-8 rounded-2xl border border-zinc-200 shadow-sm">
          <div className="flex items-center justify-between mb-8">
            <h3 className="text-lg font-bold text-zinc-900">Recent Activity</h3>
            <button className="text-zinc-400 hover:text-zinc-600">
              <MoreHorizontal size={20} />
            </button>
          </div>
          <div className="space-y-6">
            {calls.slice(0, 5).map((call) => (
              <div key={call.id} className="flex gap-4">
                <div className="w-10 h-10 rounded-full bg-orange-100 flex items-center justify-center text-orange-600 flex-shrink-0">
                  <PhoneCall size={18} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-zinc-900 truncate">Call with Lead #{call.leadId.slice(0, 4)}</p>
                  <p className="text-xs text-zinc-500 mt-0.5">Status: {call.status} • {call.outcome}</p>
                </div>
                <div className="text-xs text-zinc-400">
                  {call.createdAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </div>
              </div>
            ))}
            {calls.length === 0 && (
              <p className="text-sm text-zinc-500 text-center py-8">No recent activity.</p>
            )}
          </div>
          <button className="w-full mt-8 py-3 text-sm font-semibold text-zinc-600 bg-zinc-50 rounded-xl hover:bg-zinc-100 transition-colors">
            View All Activity
          </button>
        </div>
      </div>
    </div>
  );
}
