import React from 'react';
import { NavLink } from 'react-router-dom';
import { 
  LayoutDashboard, 
  Users, 
  Calendar, 
  Phone, 
  BookOpen,
  Settings, 
  LogOut,
  TrendingUp,
  Clock
} from 'lucide-react';
import { cn } from '../lib/utils';
import { useAuth } from '../hooks/useAuth';
import { toast } from 'sonner';

const navItems = [
  { icon: LayoutDashboard, label: 'Dashboard', path: '/' },
  { icon: Users, label: 'Leads', path: '/leads' },
  { icon: Calendar, label: 'Calendar', path: '/calendar' },
  { icon: Phone, label: 'Calls', path: '/calls' },
  { icon: Clock, label: 'Queue', path: '/queue' },
  { icon: BookOpen, label: 'Knowledge Base', path: '/knowledge-base' },
  { icon: Settings, label: 'Settings', path: '/settings' },
];

export default function Sidebar() {
  const { signOut } = useAuth();

  const handleSignOut = async () => {
    try {
      await signOut();
      toast.success('Signed out successfully');
    } catch (error) {
      console.error('Sign out error:', error);
      toast.error('Failed to sign out');
    }
  };

  return (
    <aside className="w-64 bg-zinc-950 text-zinc-400 border-r border-zinc-800 flex flex-col h-screen sticky top-0">
      <div className="p-6 flex items-center gap-3">
        <div className="w-8 h-8 bg-orange-500 rounded-lg flex items-center justify-center text-white">
          <TrendingUp size={20} />
        </div>
        <span className="text-xl font-bold text-white tracking-tight">VoxLeads AI</span>
      </div>

      <nav className="flex-1 px-4 py-4 space-y-1">
        {navItems.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            className={({ isActive }) => cn(
              "flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 group",
              isActive 
                ? "bg-zinc-900 text-white shadow-sm" 
                : "hover:bg-zinc-900 hover:text-zinc-200"
            )}
          >
            <item.icon size={20} className={cn(
              "transition-colors",
              "group-hover:text-orange-500"
            )} />
            <span className="font-medium">{item.label}</span>
          </NavLink>
        ))}
      </nav>

      <div className="p-4 border-t border-zinc-800">
        <div className="px-4 py-2 mb-2">
          <div className="flex items-center gap-2 text-[10px] font-bold text-zinc-600 uppercase tracking-widest">
            <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
            Build v1.0.7-stable
          </div>
        </div>
        <button 
          onClick={handleSignOut}
          className="w-full flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-zinc-900 hover:text-zinc-200 transition-all text-left group"
        >
          <LogOut size={20} className="group-hover:text-red-500 transition-colors" />
          <span className="font-medium">Sign Out</span>
        </button>
      </div>
    </aside>
  );
}
