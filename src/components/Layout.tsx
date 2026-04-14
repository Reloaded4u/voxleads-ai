import React from 'react';
import Sidebar from './Sidebar';
import { Bell, Search, User as UserIcon } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';

interface LayoutProps {
  children: React.ReactNode;
}

export default function Layout({ children }: LayoutProps) {
  const { user, profile } = useAuth();

  return (
    <div className="flex min-h-screen bg-zinc-50">
      <Sidebar />
      <main className="flex-1 flex flex-col">
        <header className="h-16 bg-white border-b border-zinc-200 flex items-center justify-between px-8 sticky top-0 z-10">
          <div className="relative w-96">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" size={18} />
            <input 
              type="text" 
              placeholder="Search leads, calls, or appointments..." 
              className="w-full pl-10 pr-4 py-2 bg-zinc-100 border-transparent rounded-lg text-sm focus:bg-white focus:border-orange-500 focus:ring-0 transition-all"
            />
          </div>

          <div className="flex items-center gap-4">
            <button className="p-2 text-zinc-500 hover:bg-zinc-100 rounded-full relative">
              <Bell size={20} />
              <span className="absolute top-2 right-2 w-2 h-2 bg-orange-500 rounded-full border-2 border-white"></span>
            </button>
            <div className="h-8 w-px bg-zinc-200 mx-2"></div>
            <div className="flex items-center gap-3 pl-2">
              <div className="text-right hidden sm:block">
                <p className="text-sm font-semibold text-zinc-900 leading-none">{profile?.displayName || user?.displayName || 'User'}</p>
                <p className="text-xs text-zinc-500 mt-1">{profile?.email || user?.email}</p>
              </div>
              <div className="w-10 h-10 bg-zinc-200 rounded-full flex items-center justify-center overflow-hidden border border-zinc-300">
                {user?.photoURL ? (
                  <img src={user.photoURL} alt={user.displayName || ''} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                ) : (
                  <UserIcon size={24} className="text-zinc-500" />
                )}
              </div>
            </div>
          </div>
        </header>
        
        <div className="p-8 flex-1 overflow-auto">
          {children}
        </div>
      </main>
    </div>
  );
}
