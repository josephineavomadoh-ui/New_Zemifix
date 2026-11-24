'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { KpiCard } from '@/src/components/dashboard/KpiCard';
import { useAuth } from '@/src/lib/auth-context';
import {
  Calendar,
  Plus,
  ClipboardList,
  Clock,
  AlertTriangle,
  Users,
  Wrench,
  CheckCircle2,
  RefreshCw,
  Search,
  ArrowUpRight,
  ShieldAlert,
  Building2,
  CalendarDays
} from 'lucide-react';

/**
 * Enterprise Planner / Dispatcher Dashboard View.
 * Provides comprehensive maintenance planning, dispatch queue management,
 * technician workload allocation, interactive calendar views, PM schedules, and request triage.
 */
export const PlannerDashboardView: React.FC = () => {
  const { user, loading, selectedBranch } = useAuth();
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadingData, setLoadingData] = useState(true);
  const [activeTab, setActiveTab] = useState<'dispatch' | 'calendar' | 'technicians' | 'pm' | 'requests'>('dispatch');

  // Dispatch queue filters
  const [searchQuery, setSearchQuery] = useState('');
  const [priorityFilter, setPriorityFilter] = useState('ALL');

  // Assignment Modal state
  const [assigningWo, setAssigningWo] = useState<any>(null);
  const [selectedTechId, setSelectedTechId] = useState('');
  const [assigningLoading, setAssigningLoading] = useState(false);

  const fetchData = async () => {
    try {
      setLoadingData(true);
      const resp = await fetch('/api/dashboard/planner/kpis');
      if (!resp.ok) throw new Error('Failed to load planner metrics');
      const json = await resp.json();
      setData(json);
      setError(null);
    } catch (e: any) {
      console.error(e);
      setError(e.message ?? 'Failed to load planner data');
    } finally {
      setLoadingData(false);
    }
  };

  useEffect(() => {
    if (loading || !user) return;
    fetchData();
  }, [loading, user]);

  const handleAssignTechnician = async () => {
    if (!assigningWo || !selectedTechId) return;
    try {
      setAssigningLoading(true);
      const resp = await fetch(`/api/work-orders/${assigningWo.id}/assign`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ assignedUserId: selectedTechId }),
      });
      if (!resp.ok) {
        const errJson = await resp.json();
        throw new Error(errJson.message ?? 'Failed to assign technician');
      }
      setAssigningWo(null);
      setSelectedTechId('');
      await fetchData();
    } catch (e: any) {
      alert(e.message);
    } finally {
      setAssigningLoading(false);
    }
  };

  if (loading || loadingData) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="h-32 bg-slate-200 rounded-xl" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-32 bg-slate-200 rounded-xl" />
          ))}
        </div>
        <div className="h-96 bg-slate-200 rounded-xl" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-center text-red-700">
        <AlertTriangle className="mx-auto h-8 w-8 mb-2 text-red-500" />
        <h3 className="text-sm font-bold">Planner Dashboard Error</h3>
        <p className="mt-1 text-xs">{error}</p>
        <button onClick={fetchData} className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-red-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-red-700">
          <RefreshCw className="h-3.5 w-3.5" /> Retry
        </button>
      </div>
    );
  }

  if (!data) return null;

  const filteredUnassigned = (data.unassignedWorkOrders ?? []).filter((wo: any) => {
    const matchesSearch = wo.number?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      wo.title?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      wo.asset?.name?.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesPriority = priorityFilter === 'ALL' || wo.priority === priorityFilter;
    return matchesSearch && matchesPriority;
  });

  return (
    <div className="space-y-6 pb-12">
      {/* Enterprise Header */}
      <section className="relative overflow-hidden rounded-xl bg-[#080E29] px-6 py-6 text-white sm:px-8 sm:py-7 shadow-sm">
        <div className="pointer-events-none absolute -right-10 -top-20 h-56 w-56 rounded-full border border-white/10" />
        <div className="relative flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0">
            <div className="mb-2 inline-flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-[#FF5B00]">
              <Calendar className="h-4 w-4" /> Planner & Dispatch Command Center
            </div>
            <h1 className="text-2xl font-bold tracking-tight sm:text-3xl text-white">
              Maintenance Planning & Dispatch
            </h1>
            <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-xs text-slate-300">
              <span className="inline-flex items-center gap-1.5">
                <CalendarDays className="h-3.5 w-3.5 text-[#FF5B00]" />
                {new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Building2 className="h-3.5 w-3.5 text-[#FF5B00]" />
                {selectedBranch ?? 'All Branches'}
              </span>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2.5">
            <button onClick={fetchData} className="inline-flex items-center gap-1.5 rounded-lg border border-white/15 bg-white/10 px-3 py-2 text-xs font-semibold text-white shadow-sm hover:bg-white/20 transition">
              <RefreshCw className="h-3.5 w-3.5 text-[#FF5B00]" /> Refresh
            </button>
            <Link href="/work-orders/new" className="inline-flex items-center gap-1.5 rounded-lg bg-[#FF5B00] px-4 py-2 text-xs font-bold text-white shadow-md hover:bg-[#E65200] transition">
              <Plus className="h-4 w-4" /> New Work Order
            </Link>
          </div>
        </div>
      </section>

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard title="Backlog" value={data.backlog} icon={ClipboardList} tone={data.backlog > 20 ? 'amber' : 'navy'} href="/work-orders" footerText="View all open backlogs" />
        <KpiCard title="Unassigned" value={data.unassigned} icon={Users} tone={data.unassigned > 5 ? 'rose' : 'navy'} href="/work-orders" footerText="Awaiting technician dispatch" />
        <KpiCard title="Overdue" value={data.overdue} icon={ShieldAlert} tone={data.overdue > 0 ? 'rose' : 'emerald'} href="/work-orders" footerText="Require immediate schedule adjustment" />
        <KpiCard title="Due Soon (48h)" value={data.dueSoon} icon={Clock} tone="amber" href="/work-orders" footerText="Due within next 48 hours" />
        <KpiCard title="Scheduled Today" value={data.scheduledToday} icon={Calendar} tone="orange" href="/work-orders" footerText="Planned for execution today" />
        <KpiCard title="Pending Requests" value={data.pendingRequests} icon={AlertTriangle} tone="amber" href="/work-orders" footerText="Awaiting planner triage" />
        <KpiCard title="Active PM Plans" value={data.upcomingPmCount} icon={Wrench} tone="emerald" href="/work-orders" footerText="Recurring maintenance schedules" />
        <KpiCard title="Available Techs" value={data.techniciansWorkload?.length ?? 0} icon={Users} tone="navy" href="/work-orders" footerText="Active team members" />
      </div>

      {/* Navigation Tabs */}
      <div className="flex border-b border-slate-200 bg-white px-4 rounded-t-xl shadow-sm">
        <button
          onClick={() => setActiveTab('dispatch')}
          className={`px-4 py-3 text-xs font-bold border-b-2 transition-colors ${activeTab === 'dispatch' ? 'border-[#FF5B00] text-[#FF5B00]' : 'border-transparent text-slate-600 hover:text-slate-900'}`}
        >
          Dispatch Queue ({data.unassigned ?? 0})
        </button>
        <button
          onClick={() => setActiveTab('calendar')}
          className={`px-4 py-3 text-xs font-bold border-b-2 transition-colors ${activeTab === 'calendar' ? 'border-[#FF5B00] text-[#FF5B00]' : 'border-transparent text-slate-600 hover:text-slate-900'}`}
        >
          Planning Calendar
        </button>
        <button
          onClick={() => setActiveTab('technicians')}
          className={`px-4 py-3 text-xs font-bold border-b-2 transition-colors ${activeTab === 'technicians' ? 'border-[#FF5B00] text-[#FF5B00]' : 'border-transparent text-slate-600 hover:text-slate-900'}`}
        >
          Technician Workload ({data.techniciansWorkload?.length ?? 0})
        </button>
        <button
          onClick={() => setActiveTab('pm')}
          className={`px-4 py-3 text-xs font-bold border-b-2 transition-colors ${activeTab === 'pm' ? 'border-[#FF5B00] text-[#FF5B00]' : 'border-transparent text-slate-600 hover:text-slate-900'}`}
        >
          Preventive Maintenance ({data.maintenancePlans?.length ?? 0})
        </button>
        <button
          onClick={() => setActiveTab('requests')}
          className={`px-4 py-3 text-xs font-bold border-b-2 transition-colors ${activeTab === 'requests' ? 'border-[#FF5B00] text-[#FF5B00]' : 'border-transparent text-slate-600 hover:text-slate-900'}`}
        >
          Request Triage ({data.maintenanceRequests?.length ?? 0})
        </button>
      </div>

      {/* Tab Content: Dispatch Queue */}
      {activeTab === 'dispatch' && (
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <h3 className="text-sm font-bold text-[#0B1336]">Unassigned Work Order Dispatch Queue</h3>
              <p className="text-xs text-slate-500">Review backlogs and assign qualified technicians to open work orders.</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative">
                <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search work orders..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="rounded-lg border border-slate-200 bg-slate-50 pl-9 pr-3 py-1.5 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#FF5B00]/20"
                />
              </div>
              <select
                value={priorityFilter}
                onChange={(e) => setPriorityFilter(e.target.value)}
                className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs text-slate-800 focus:outline-none"
              >
                <option value="ALL">All Priorities</option>
                <option value="EMERGENCY">Emergency</option>
                <option value="HIGH">High</option>
                <option value="MEDIUM">Medium</option>
                <option value="LOW">Low</option>
              </select>
            </div>
          </div>

          {filteredUnassigned.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-50 text-emerald-600 mb-3">
                <CheckCircle2 className="h-6 w-6" />
              </div>
              <h4 className="text-sm font-bold text-[#0B1336]">No Unassigned Work Orders</h4>
              <p className="mt-1 text-xs text-slate-500">All active work orders have been assigned to technicians.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-slate-200 bg-slate-50 text-[11px] font-semibold text-slate-600 uppercase">
                  <tr>
                    <th className="p-3">Work Order</th>
                    <th className="p-3">Title</th>
                    <th className="p-3">Asset</th>
                    <th className="p-3">Priority</th>
                    <th className="p-3">Branch</th>
                    <th className="p-3">Target Date</th>
                    <th className="p-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredUnassigned.map((wo: any) => (
                    <tr key={wo.id} className="hover:bg-slate-50/70 transition">
                      <td className="p-3 font-semibold text-[#0B1336]">
                        <Link href={`/work-orders/${wo.id}`} className="hover:text-[#FF5B00] inline-flex items-center gap-1">
                          {wo.number} <ArrowUpRight className="h-3 w-3" />
                        </Link>
                      </td>
                      <td className="p-3 font-medium text-slate-800 max-w-xs truncate">{wo.title}</td>
                      <td className="p-3 text-slate-600">{wo.asset?.name ?? '—'}</td>
                      <td className="p-3">
                        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold ${
                          wo.priority === 'EMERGENCY' || wo.priority === 'HIGH' ? 'bg-rose-50 text-rose-700' : 'bg-slate-100 text-slate-700'
                        }`}>
                          {wo.priority}
                        </span>
                      </td>
                      <td className="p-3 text-slate-600">{wo.branch?.name ?? 'HQ'}</td>
                      <td className="p-3 text-slate-600">{wo.plannedEnd ? new Date(wo.plannedEnd).toLocaleDateString() : 'Unscheduled'}</td>
                      <td className="p-3 text-right">
                        <button
                          onClick={() => setAssigningWo(wo)}
                          className="inline-flex items-center gap-1 rounded-md bg-[#FF5B00] px-3 py-1.5 text-[11px] font-bold text-white shadow-sm hover:bg-[#E65200] transition"
                        >
                          Assign Tech
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Tab Content: Planning Calendar */}
      {activeTab === 'calendar' && (
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-[#0B1336]">Maintenance Schedule Calendar</h3>
              <p className="text-xs text-slate-500">Visual timeline of corrective work orders and preventive maintenance tasks.</p>
            </div>
            <div className="flex items-center gap-2">
              <Link href="/work-orders" className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50">
                Full Calendar View &rarr;
              </Link>
            </div>
          </div>
          <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-12 text-center">
            <CalendarDays className="mx-auto h-10 w-10 text-slate-400 mb-3" />
            <h4 className="text-sm font-bold text-slate-700">Interactive Maintenance Calendar Grid</h4>
            <p className="mt-1 text-xs text-slate-500 max-w-md mx-auto">
              Schedule, reschedule, and track overlapping maintenance activities across all assets and technicians.
            </p>
            <Link href="/work-orders" className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-[#FF5B00] px-4 py-2 text-xs font-bold text-white shadow-sm hover:bg-[#E65200]">
              Open Work Orders Calendar
            </Link>
          </div>
        </div>
      )}

      {/* Tab Content: Technician Workload */}
      {activeTab === 'technicians' && (
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm space-y-4">
          <div>
            <h3 className="text-sm font-bold text-[#0B1336]">Technician Workload & Capacity</h3>
            <p className="text-xs text-slate-500">Inspect active assignments and load distribution across technicians.</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {(data.techniciansWorkload ?? []).map((tech: any) => (
              <div key={tech.id} className="rounded-lg border border-slate-200 bg-slate-50 p-4 shadow-sm flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-bold text-[#0B1336]">{tech.name}</span>
                    <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-bold text-blue-700">
                      {tech.role}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-500">{tech.email}</p>
                </div>
                <div className="mt-4 pt-3 border-t border-slate-200 flex items-center justify-between">
                  <span className="text-xs font-medium text-slate-600">Active Work Orders:</span>
                  <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${
                    tech.activeWorkOrdersCount > 5 ? 'bg-rose-100 text-rose-800' : 'bg-emerald-100 text-emerald-800'
                  }`}>
                    {tech.activeWorkOrdersCount} jobs
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tab Content: Preventive Maintenance */}
      {activeTab === 'pm' && (
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm space-y-4">
          <div>
            <h3 className="text-sm font-bold text-[#0B1336]">Active Preventive Maintenance Plans</h3>
            <p className="text-xs text-slate-500">Upcoming servicing and recurring maintenance schedule templates.</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-200 bg-slate-50 text-[11px] font-semibold text-slate-600 uppercase">
                <tr>
                  <th className="p-3">Plan Title</th>
                  <th className="p-3">Asset</th>
                  <th className="p-3">Frequency</th>
                  <th className="p-3">Next Due</th>
                  <th className="p-3 text-right">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {(data.maintenancePlans ?? []).map((pm: any) => (
                  <tr key={pm.id} className="hover:bg-slate-50/70 transition">
                    <td className="p-3 font-bold text-[#0B1336]">{pm.title}</td>
                    <td className="p-3 text-slate-600">{pm.asset?.name ?? 'General Facility'}</td>
                    <td className="p-3 text-slate-600 font-medium">{pm.frequency}</td>
                    <td className="p-3 text-slate-600">{pm.nextDueDate ? new Date(pm.nextDueDate).toLocaleDateString() : 'N/A'}</td>
                    <td className="p-3 text-right">
                      <span className="inline-flex items-center rounded-full bg-emerald-50 px-2.5 py-0.5 text-[10px] font-bold text-emerald-700">
                        {pm.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab Content: Request Triage */}
      {activeTab === 'requests' && (
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm space-y-4">
          <div>
            <h3 className="text-sm font-bold text-[#0B1336]">Maintenance Requests Awaiting Review</h3>
            <p className="text-xs text-slate-500">Review incoming QR and portal work requests for conversion into work orders.</p>
          </div>
          {(data.maintenanceRequests ?? []).length === 0 ? (
            <div className="text-center py-12 text-slate-500 text-xs">No pending maintenance requests awaiting triage.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-slate-200 bg-slate-50 text-[11px] font-semibold text-slate-600 uppercase">
                  <tr>
                    <th className="p-3">Request #</th>
                    <th className="p-3">Description</th>
                    <th className="p-3">Asset</th>
                    <th className="p-3">Branch</th>
                    <th className="p-3">Submitted</th>
                    <th className="p-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {(data.maintenanceRequests ?? []).map((req: any) => (
                    <tr key={req.id} className="hover:bg-slate-50/70 transition">
                      <td className="p-3 font-semibold text-[#0B1336]">{req.requestNumber}</td>
                      <td className="p-3 font-medium text-slate-800 max-w-xs truncate">{req.description}</td>
                      <td className="p-3 text-slate-600">{req.asset?.name ?? 'General'}</td>
                      <td className="p-3 text-slate-600">{req.branch?.name ?? 'HQ'}</td>
                      <td className="p-3 text-slate-600">{new Date(req.createdAt).toLocaleDateString()}</td>
                      <td className="p-3 text-right">
                        <Link href={`/work-orders/new?requestId=${req.id}`} className="inline-flex items-center gap-1 rounded-md bg-[#FF5B00] px-3 py-1.5 text-[11px] font-bold text-white shadow-sm hover:bg-[#E65200]">
                          Convert to WO
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Assign Technician Modal */}
      {assigningWo && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-[#0B1336]">Assign Technician to {assigningWo.number}</h3>
              <button onClick={() => setAssigningWo(null)} className="text-slate-400 hover:text-slate-700 text-sm font-bold">×</button>
            </div>
            <p className="text-xs text-slate-600">Select an available technician for: <span className="font-semibold">{assigningWo.title}</span></p>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Select Technician</label>
              <select
                value={selectedTechId}
                onChange={(e) => setSelectedTechId(e.target.value)}
                className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#FF5B00]/20"
              >
                <option value="">-- Choose Technician --</option>
                {(data.techniciansWorkload ?? []).map((tech: any) => (
                  <option key={tech.id} value={tech.id}>
                    {tech.name} ({tech.activeWorkOrdersCount} active jobs)
                  </option>
                ))}
              </select>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
              <button
                onClick={() => setAssigningWo(null)}
                className="rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                disabled={!selectedTechId || assigningLoading}
                onClick={handleAssignTechnician}
                className="rounded-lg bg-[#FF5B00] px-4 py-2 text-xs font-bold text-white shadow-sm hover:bg-[#E65200] disabled:opacity-50 transition"
              >
                {assigningLoading ? 'Assigning...' : 'Confirm Assignment'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
