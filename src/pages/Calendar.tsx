import React, { useState } from 'react';
import { 
  ChevronLeft, 
  ChevronRight, 
  Calendar as CalendarIcon, 
  Clock, 
  User, 
  MapPin,
  Edit2,
  XCircle,
  Loader2,
  Search,
  Inbox,
  MessageSquare
} from 'lucide-react';
import { 
  format, 
  addMonths, 
  subMonths, 
  startOfMonth, 
  endOfMonth, 
  startOfWeek, 
  endOfWeek, 
  isSameMonth, 
  isSameDay, 
  eachDayOfInterval 
} from 'date-fns';
import { cn } from '../lib/utils';
import { Appointment } from '../types';
import { useAppointments } from '../hooks/useAppointments';
import AppointmentModal from '../components/AppointmentModal';
import { toast } from 'sonner';

export default function Calendar() {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState(new Date());
  const { appointments, loading, cancelAppointment } = useAppointments();
  const [editingAppointment, setEditingAppointment] = useState<Appointment | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState<string>('all');

  const monthStart = startOfMonth(currentDate);
  const monthEnd = endOfMonth(monthStart);
  const startDate = startOfWeek(monthStart);
  const endDate = endOfWeek(monthEnd);

  const calendarDays = eachDayOfInterval({
    start: startDate,
    end: endDate,
  });

  const nextMonth = () => setCurrentDate(addMonths(currentDate, 1));
  const prevMonth = () => setCurrentDate(subMonths(currentDate, 1));

  const handleCancel = async (id: string) => {
    if (!window.confirm('Are you sure you want to cancel this appointment?')) return;
    try {
      await cancelAppointment(id);
      toast.success('Appointment cancelled');
    } catch (error) {
      toast.error('Failed to cancel appointment');
    }
  };

  const filteredAppointments = appointments.filter(app => {
    const matchesSearch = app.leadName.toLowerCase().includes(searchTerm.toLowerCase()) || 
                         app.notes.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesFilter = filterType === 'all' || app.type === filterType;
    return matchesSearch && matchesFilter;
  });

  const selectedDayAppointments = filteredAppointments.filter(app => isSameDay(app.scheduledAt, selectedDate));

  return (
    <div className="space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900">Calendar & Scheduling</h1>
          <p className="text-zinc-500 mt-1">Manage your site visits and follow-up meetings.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
        <div className="lg:col-span-3 space-y-6">
          <div className="bg-white rounded-2xl border border-zinc-200 shadow-sm overflow-hidden">
            <div className="p-6 border-b border-zinc-200 flex items-center justify-between">
              <h2 className="text-lg font-bold text-zinc-900">
                {format(currentDate, 'MMMM yyyy')}
              </h2>
              <div className="flex items-center gap-2">
                <button onClick={prevMonth} className="p-2 hover:bg-zinc-100 rounded-lg transition-colors">
                  <ChevronLeft size={20} className="text-zinc-600" />
                </button>
                <button onClick={() => setCurrentDate(new Date())} className="px-3 py-1 text-xs font-bold text-zinc-600 hover:bg-zinc-100 rounded-lg transition-colors border border-zinc-200">
                  Today
                </button>
                <button onClick={nextMonth} className="p-2 hover:bg-zinc-100 rounded-lg transition-colors">
                  <ChevronRight size={20} className="text-zinc-600" />
                </button>
              </div>
            </div>

            <div className="grid grid-cols-7 border-b border-zinc-200">
              {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => (
                <div key={day} className="py-3 text-center text-xs font-bold text-zinc-500 uppercase tracking-wider">
                  {day}
                </div>
              ))}
            </div>

            <div className="grid grid-cols-7 auto-rows-[120px]">
              {loading ? (
                <div className="col-span-7 row-span-5 flex items-center justify-center">
                  <Loader2 className="animate-spin text-orange-500" size={32} />
                </div>
              ) : calendarDays.map((day, idx) => {
                const dayAppointments = filteredAppointments.filter(app => isSameDay(app.scheduledAt, day));
                return (
                  <div 
                    key={idx} 
                    onClick={() => setSelectedDate(day)}
                    className={cn(
                      "p-2 border-r border-b border-zinc-100 transition-colors cursor-pointer hover:bg-zinc-50/50",
                      !isSameMonth(day, monthStart) && "bg-zinc-50/30 text-zinc-300",
                      isSameDay(day, selectedDate) && "bg-orange-50/30"
                    )}
                  >
                    <div className="flex items-center justify-between">
                      <span className={cn(
                        "text-sm font-medium w-7 h-7 flex items-center justify-center rounded-full",
                        isSameDay(day, new Date()) && "bg-orange-500 text-white",
                        isSameDay(day, selectedDate) && !isSameDay(day, new Date()) && "bg-zinc-900 text-white"
                      )}>
                        {format(day, 'd')}
                      </span>
                    </div>
                    <div className="mt-2 space-y-1 overflow-y-auto max-h-[80px] custom-scrollbar">
                      {dayAppointments.map(app => (
                        <div 
                          key={app.id} 
                          className={cn(
                            "px-2 py-1 rounded text-[10px] font-bold truncate",
                            app.status === 'Cancelled' ? "bg-zinc-100 text-zinc-400 line-through" : "bg-orange-100 text-orange-700"
                          )}
                        >
                          {format(app.scheduledAt, 'HH:mm')} {app.type}
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-zinc-200 shadow-sm overflow-hidden">
            <div className="p-4 border-b border-zinc-200 flex items-center justify-between gap-4">
              <div className="relative flex-1 max-w-md">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" size={18} />
                <input 
                  type="text" 
                  placeholder="Search appointments..." 
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 bg-zinc-50 border-transparent rounded-lg text-sm focus:bg-white focus:border-orange-500 transition-all"
                />
              </div>
              <select 
                value={filterType}
                onChange={(e) => setFilterType(e.target.value)}
                className="px-3 py-2 bg-zinc-50 border border-zinc-200 rounded-lg text-sm outline-none"
              >
                <option value="all">All Types</option>
                <option value="Site Visit">Site Visit</option>
                <option value="Follow-up">Follow-up</option>
                <option value="Consultation">Consultation</option>
                <option value="Contract Signing">Contract Signing</option>
              </select>
            </div>
            
            <div className="divide-y divide-zinc-100">
              {selectedDayAppointments.length > 0 ? selectedDayAppointments.map(app => (
                <div key={app.id} className="p-4 flex items-center justify-between hover:bg-zinc-50 transition-colors group">
                  <div className="flex items-start gap-4">
                    <div className={cn(
                      "w-10 h-10 rounded-xl flex items-center justify-center",
                      app.status === 'Cancelled' ? "bg-zinc-100 text-zinc-400" : "bg-orange-50 text-orange-500"
                    )}>
                      <CalendarIcon size={20} />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h4 className={cn("text-sm font-bold text-zinc-900", app.status === 'Cancelled' && "line-through text-zinc-400")}>
                          {app.type} with {app.leadName}
                        </h4>
                        <span className={cn(
                          "px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide border",
                          app.status === 'Scheduled' ? "bg-blue-50 text-blue-600 border-blue-100" :
                          app.status === 'Completed' ? "bg-green-50 text-green-600 border-green-100" :
                          app.status === 'Cancelled' ? "bg-zinc-50 text-zinc-400 border-zinc-200" :
                          "bg-orange-50 text-orange-600 border-orange-100"
                        )}>
                          {app.status}
                        </span>
                        {app.smsAlertSent && (
                          <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide bg-blue-50 text-blue-600 border border-blue-100">
                            <MessageSquare size={10} />
                            SMS Sent
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-4 mt-1 text-xs text-zinc-500">
                        <span className="flex items-center gap-1"><Clock size={12} /> {format(app.scheduledAt, 'HH:mm')} ({app.duration} min)</span>
                        {app.location && <span className="flex items-center gap-1"><MapPin size={12} /> {app.location}</span>}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button 
                      onClick={() => setEditingAppointment(app)}
                      className="p-2 text-zinc-400 hover:text-orange-500 hover:bg-orange-50 rounded-lg transition-all"
                    >
                      <Edit2 size={16} />
                    </button>
                    {app.status !== 'Cancelled' && (
                      <button 
                        onClick={() => handleCancel(app.id)}
                        className="p-2 text-zinc-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all"
                      >
                        <XCircle size={16} />
                      </button>
                    )}
                  </div>
                </div>
              )) : (
                <div className="py-12 flex flex-col items-center justify-center text-zinc-400 gap-3">
                  <Inbox size={32} />
                  <p className="text-sm font-medium">No appointments for {format(selectedDate, 'MMMM do')}</p>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <div className="bg-white p-6 rounded-2xl border border-zinc-200 shadow-sm">
            <h3 className="text-lg font-bold text-zinc-900 mb-6 flex items-center gap-2">
              <Clock size={20} className="text-orange-500" />
              Upcoming Today
            </h3>
            <div className="space-y-6">
              {appointments
                .filter(app => isSameDay(app.scheduledAt, new Date()) && app.status !== 'Cancelled')
                .slice(0, 5)
                .map(app => (
                <div key={app.id} className="relative pl-4 border-l-2 border-orange-500">
                  <p className="text-xs font-bold text-orange-600 uppercase tracking-wide">
                    {format(app.scheduledAt, 'HH:mm')}
                  </p>
                  <h4 className="text-sm font-bold text-zinc-900 mt-1">{app.type}</h4>
                  <div className="flex flex-col gap-1 mt-2">
                    <div className="flex items-center gap-2 text-xs text-zinc-500">
                      <User size={12} />
                      {app.leadName}
                    </div>
                    {app.location && (
                      <div className="flex items-center gap-2 text-xs text-zinc-500">
                        <MapPin size={12} />
                        {app.location}
                      </div>
                    )}
                  </div>
                </div>
              ))}
              {appointments.filter(app => isSameDay(app.scheduledAt, new Date()) && app.status !== 'Cancelled').length === 0 && (
                <p className="text-sm text-zinc-500 text-center py-4 italic">No appointments for today.</p>
              )}
            </div>
          </div>

          <div className="bg-zinc-900 p-6 rounded-2xl text-white shadow-xl shadow-zinc-200">
            <h3 className="font-bold mb-2">Google Calendar Sync</h3>
            <p className="text-xs text-zinc-400 leading-relaxed">
              Keep your appointments in sync with your personal calendar.
            </p>
            <button className="w-full mt-6 py-2.5 bg-white text-zinc-900 rounded-xl text-sm font-bold hover:bg-zinc-100 transition-colors">
              Connect Calendar
            </button>
          </div>
        </div>
      </div>

      {editingAppointment && (
        <AppointmentModal 
          appointment={editingAppointment} 
          onClose={() => setEditingAppointment(null)} 
        />
      )}
    </div>
  );
}
