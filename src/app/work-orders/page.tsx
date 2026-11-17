'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  Search, Plus, Filter, ClipboardList, MapPin, Wrench, User, Calendar,
  Download, RefreshCw, X, PlayCircle, PauseCircle, CheckCircle2, AlertTriangle,
  LayoutList, LayoutGrid, Clock, ShieldAlert, ArrowUpRight, ChevronLeft, ChevronRight,
  FolderOpen, UserCheck, Activity, Layers, Boxes, FileText, ExternalLink, Check
} from 'lucide-react';
import { WorkOrderStatusBadge } from '@/src/components/work-orders/WorkOrderStatusBadge';
import { WorkOrderPriorityBadge } from '@/src/components/work-orders/WorkOrderPriorityBadge';
import { AssetThumbnail } from '@/src/components/assets/AssetThumbnail';

// Helper for safe JSON fetching (prevents SyntaxError on HTML / non-JSON error responses)
async function safeFetchJson(url: string, options?: RequestInit) {
  const res = await fetch(url, options);
  const contentType = res.headers.get('content-type');
  const isJson = contentType && contentType.includes('application/json');

  if (!res.ok) {
    if (isJson) {
      const data = await res.json();
      throw new Error(data?.message || data?.error || `Request failed (HTTP ${res.status})`);
    } else {
      const text = await res.text();
      throw new Error(text ? text.slice(0, 120) : `Request failed (HTTP ${res.status})`);
    }
  }

  if (!isJson) {
    const text = await res.text();
    throw new Error(`Expected JSON response, got: ${text.slice(0, 100)}`);
  }

  return res.json();
}

export default function WorkOrdersListPage() {
  const [workOrders, setWorkOrders] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [branches, setBranches] = useState<any[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // View Mode
  const [viewMode, setViewMode] = useState<'list' | 'board'>('list');

  // Search & Filters
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [typeFilter, setTypeFilter] = useState<string>('');
  const [priorityFilter, setPriorityFilter] = useState<string>('');
  const [branchFilter, setBranchFilter] = useState<string>('');
  const [techFilter, setTechFilter] = useState<string>('');
  const [overdueOnly, setOverdueOnly] = useState<boolean>(false);

  // Pagination & Quick Actions
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(10);
  const [transitioningId, setTransitioningId] = useState<string | null>(null);

  // Split-View Master-Detail State (Persistent Right Panel)
  const [selectedWoId, setSelectedWoId] = useState<string | null>(null);
  const [selectedWo, setSelectedWo] = useState<any | null>(null);
  const [detailLoading, setDetailLoading] = useState<boolean>(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [detailTab, setDetailTab] = useState<'overview' | 'tasks' | 'labor' | 'parts' | 'history'>('overview');
  const [assigningTechId, setAssigningTechId] = useState<string>('');

  const fetchWorkOrders = useCallback(async (isBackground = false) => {
    if (isBackground) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    try {
      const data = await safeFetchJson('/api/work-orders');
      setWorkOrders(data.workOrders ?? []);
      setError(null);
    } catch (err) {
      if (!isBackground) setWorkOrders([]);
      setError(err instanceof Error ? err.message : 'Unable to load work orders.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void fetchWorkOrders(false);

    Promise.all([
      safeFetchJson('/api/users'),
      safeFetchJson('/api/organization/branches'),
    ])
      .then(([uData, bData]) => {
        setUsers(uData.data ?? uData.users ?? []);
        setBranches(bData.data ?? bData.branches ?? []);
      })
      .catch((err) => console.error('Failed to load filter options:', err));
  }, [fetchWorkOrders]);

  // Load Work Order Details for the Right Panel
  const fetchWorkOrderDetail = async (woId: string) => {
    setDetailLoading(true);
    setDetailError(null);
    try {
      const data = await safeFetchJson(`/api/work-orders/${woId}`);
      setSelectedWo(data.workOrder);
      setAssigningTechId(data.workOrder?.assignedUserId ?? '');
    } catch (err) {
      setDetailError(err instanceof Error ? err.message : 'Unable to load work order details.');
    } finally {
      setDetailLoading(false);
    }
  };

  const handleSelectWorkOrder = (wo: any) => {
    setSelectedWoId(wo.id);
    setSelectedWo(wo); // Instant optimistic load from table item
    setDetailTab('overview');
    void fetchWorkOrderDetail(wo.id);
  };

  // Overdue calculation helper
  const isWorkOrderOverdue = (wo: any) => {
    if (wo.status === 'COMPLETED' || wo.status === 'CANCELLED') return false;
    const now = new Date();
    if (wo.plannedEnd && new Date(wo.plannedEnd) < now) return true;
    if (wo.slaResolutionTargetMinutes && wo.createdAt) {
      const resDueDate = new Date(new Date(wo.createdAt).getTime() + wo.slaResolutionTargetMinutes * 60000);
      if (resDueDate < now) return true;
    }
    return false;
  };

  // KPI Counts derived from actual records
  const kpiStats = useMemo(() => {
    const total = workOrders.length;
    const open = workOrders.filter((w) => w.status === 'OPEN').length;
    const assigned = workOrders.filter((w) => w.status === 'ASSIGNED').length;
    const inProgress = workOrders.filter((w) => w.status === 'IN_PROGRESS').length;
    const onHold = workOrders.filter((w) => w.status === 'ON_HOLD').length;
    const overdue = workOrders.filter(isWorkOrderOverdue).length;
    const completed = workOrders.filter((w) => w.status === 'COMPLETED').length;

    return { total, open, assigned, inProgress, onHold, overdue, completed };
  }, [workOrders]);

  // Filtered dataset
  const filteredWorkOrders = useMemo(() => {
    return workOrders.filter((wo) => {
      const query = search.trim().toLowerCase();
      const matchesText =
        !query ||
        [wo.workOrderNumber, wo.title, wo.description, wo.asset?.name, wo.asset?.assetTag, wo.location?.name, wo.assignedUser?.name]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(query));

      const matchesStatus = !statusFilter || wo.status === statusFilter;
      const matchesType = !typeFilter || wo.type === typeFilter;
      const matchesPriority = !priorityFilter || wo.priority === priorityFilter;
      const matchesBranch = !branchFilter || wo.branchId === branchFilter;
      const matchesTech =
        !techFilter ||
        (techFilter === 'UNASSIGNED' ? !wo.assignedUserId : wo.assignedUserId === techFilter);
      const matchesOverdue = !overdueOnly || isWorkOrderOverdue(wo);

      return matchesText && matchesStatus && matchesType && matchesPriority && matchesBranch && matchesTech && matchesOverdue;
    });
  }, [workOrders, search, statusFilter, typeFilter, priorityFilter, branchFilter, techFilter, overdueOnly]);

  // Active filter count
  const activeFilterCount = [statusFilter, typeFilter, priorityFilter, branchFilter, techFilter, overdueOnly].filter(Boolean).length;

  const clearFilters = () => {
    setSearch('');
    setStatusFilter('');
    setTypeFilter('');
    setPriorityFilter('');
    setBranchFilter('');
    setTechFilter('');
    setOverdueOnly(false);
    setCurrentPage(1);
  };

  // Pagination slicing
  const totalPages = Math.ceil(filteredWorkOrders.length / pageSize) || 1;
  const paginatedWorkOrders = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredWorkOrders.slice(start, start + pageSize);
  }, [filteredWorkOrders, currentPage, pageSize]);

  // Handle Quick Status Transition from list/board/detail
  const handleQuickTransition = async (workOrderId: string, newStatus: string, reason?: string) => {
    if (transitioningId) return;
    setTransitioningId(workOrderId);
    try {
      await safeFetchJson(`/api/work-orders/${workOrderId}/status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ newStatus, reason: reason ?? 'Updated from Work Orders workspace' }),
      });

      await fetchWorkOrders(true);
      if (selectedWoId === workOrderId) {
        await fetchWorkOrderDetail(workOrderId);
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to update work order status');
    } finally {
      setTransitioningId(null);
    }
  };

  // Assign Technician from Detail Panel
  const handleAssignTechnician = async (techId: string) => {
    if (!selectedWoId) return;
    try {
      await safeFetchJson(`/api/work-orders/${selectedWoId}/assign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ assignedUserId: techId }),
      });

      await fetchWorkOrders(true);
      await fetchWorkOrderDetail(selectedWoId);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to assign technician');
    }
  };

  // Export CSV Handler
  const handleExportCsv = () => {
    if (filteredWorkOrders.length === 0) return;
    const headers = ['WO Number', 'Title', 'Type', 'Priority', 'Status', 'Asset', 'Location', 'Assigned Tech', 'Created At'];
    const rows = filteredWorkOrders.map((w) => [
      w.workOrderNumber,
      `"${(w.title || '').replace(/"/g, '""')}"`,
      w.type,
      w.priority,
      w.status,
      `"${(w.asset?.name || '').replace(/"/g, '""')}"`,
      `"${(w.location?.name || '').replace(/"/g, '""')}"`,
      `"${(w.assignedUser?.name || 'Unassigned').replace(/"/g, '""')}"`,
      w.createdAt ? new Date(w.createdAt).toISOString() : '',
    ]);

    const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ZemiFix_Work_Orders_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6 max-w-full overflow-hidden">
      {/* Header Bar */}
      <div className="flex flex-col items-start justify-between gap-4 border-b border-slate-200 pb-5 sm:flex-row sm:items-center">
        <div>
          <h1 className="flex items-center gap-2.5 text-2xl font-bold tracking-tight text-[#0B1336]">
            <ClipboardList className="h-6 w-6 text-[#FF5B00]" />
            Work Orders
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Create, assign, monitor and manage maintenance operations across your organization.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          <button
            onClick={() => fetchWorkOrders(true)}
            disabled={refreshing}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 shadow-xs hover:bg-slate-50 transition-colors disabled:opacity-50"
            title="Refresh Data"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} />
            Refresh
          </button>

          <button
            onClick={handleExportCsv}
            disabled={filteredWorkOrders.length === 0}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 shadow-xs hover:bg-slate-50 transition-colors disabled:opacity-50"
          >
            <Download className="h-3.5 w-3.5" />
            Export CSV
          </button>

          <Link
            href="/work-orders/calendar"
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 shadow-xs hover:bg-slate-50 transition-colors"
          >
            <Calendar className="h-3.5 w-3.5 text-slate-500" />
            Calendar
          </Link>

          <Link
            href="/requests"
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 shadow-xs hover:bg-slate-50 transition-colors"
          >
            Requests
          </Link>

          <Link
            href="/work-orders/new"
            className="inline-flex items-center gap-2 rounded-lg bg-[#FF5B00] px-4 py-2 text-xs font-bold text-white shadow-xs hover:bg-[#F95700] transition-colors"
          >
            <Plus className="h-4 w-4" />
            New Work Order
          </Link>
        </div>
      </div>

      {/* KPI Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
        {/* Total WOs */}
        <button
          onClick={() => { setStatusFilter(''); setOverdueOnly(false); }}
          className={`flex flex-col justify-between p-3.5 rounded-xl border text-left transition-all ${
            !statusFilter && !overdueOnly
              ? 'border-[#FF5B00] bg-orange-50/50 ring-2 ring-[#FF5B00] shadow-xs'
              : 'border-slate-200 bg-white hover:border-slate-300 hover:shadow-xs'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Total WOs</span>
            <div className="flex h-6 w-6 items-center justify-center rounded-md bg-orange-100 text-[#FF5B00]">
              <Layers className="h-3.5 w-3.5" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-2xl font-extrabold font-mono text-[#0B1336]">{kpiStats.total}</span>
            <span className="text-[10px] font-medium text-slate-400">All Jobs</span>
          </div>
        </button>

        {/* Open */}
        <button
          onClick={() => { setStatusFilter('OPEN'); setOverdueOnly(false); }}
          className={`flex flex-col justify-between p-3.5 rounded-xl border text-left transition-all ${
            statusFilter === 'OPEN'
              ? 'border-blue-500 bg-blue-50/50 ring-2 ring-blue-500 shadow-xs'
              : 'border-slate-200 bg-white hover:border-slate-300 hover:shadow-xs'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-wider text-blue-600">Open</span>
            <div className="flex h-6 w-6 items-center justify-center rounded-md bg-blue-100 text-blue-600">
              <FolderOpen className="h-3.5 w-3.5" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-2xl font-extrabold font-mono text-blue-700">{kpiStats.open}</span>
            <span className="text-[10px] font-medium text-blue-500">
              {kpiStats.total ? Math.round((kpiStats.open / kpiStats.total) * 100) : 0}%
            </span>
          </div>
        </button>

        {/* Assigned */}
        <button
          onClick={() => { setStatusFilter('ASSIGNED'); setOverdueOnly(false); }}
          className={`flex flex-col justify-between p-3.5 rounded-xl border text-left transition-all ${
            statusFilter === 'ASSIGNED'
              ? 'border-purple-500 bg-purple-50/50 ring-2 ring-purple-500 shadow-xs'
              : 'border-slate-200 bg-white hover:border-slate-300 hover:shadow-xs'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-wider text-purple-600">Assigned</span>
            <div className="flex h-6 w-6 items-center justify-center rounded-md bg-purple-100 text-purple-600">
              <UserCheck className="h-3.5 w-3.5" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-2xl font-extrabold font-mono text-purple-700">{kpiStats.assigned}</span>
            <span className="text-[10px] font-medium text-purple-500">
              {kpiStats.total ? Math.round((kpiStats.assigned / kpiStats.total) * 100) : 0}%
            </span>
          </div>
        </button>

        {/* In Progress */}
        <button
          onClick={() => { setStatusFilter('IN_PROGRESS'); setOverdueOnly(false); }}
          className={`flex flex-col justify-between p-3.5 rounded-xl border text-left transition-all ${
            statusFilter === 'IN_PROGRESS'
              ? 'border-amber-500 bg-amber-50/50 ring-2 ring-amber-500 shadow-xs'
              : 'border-slate-200 bg-white hover:border-slate-300 hover:shadow-xs'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-wider text-amber-600">In Progress</span>
            <div className="flex h-6 w-6 items-center justify-center rounded-md bg-amber-100 text-amber-600">
              <Activity className="h-3.5 w-3.5" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-2xl font-extrabold font-mono text-amber-700">{kpiStats.inProgress}</span>
            <span className="text-[10px] font-medium text-amber-600">Active</span>
          </div>
        </button>

        {/* On Hold */}
        <button
          onClick={() => { setStatusFilter('ON_HOLD'); setOverdueOnly(false); }}
          className={`flex flex-col justify-between p-3.5 rounded-xl border text-left transition-all ${
            statusFilter === 'ON_HOLD'
              ? 'border-slate-500 bg-slate-100 ring-2 ring-slate-500 shadow-xs'
              : 'border-slate-200 bg-white hover:border-slate-300 hover:shadow-xs'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">On Hold</span>
            <div className="flex h-6 w-6 items-center justify-center rounded-md bg-slate-100 text-slate-600">
              <PauseCircle className="h-3.5 w-3.5" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-2xl font-extrabold font-mono text-slate-700">{kpiStats.onHold}</span>
            <span className="text-[10px] font-medium text-slate-400">Paused</span>
          </div>
        </button>

        {/* Overdue */}
        <button
          onClick={() => { setOverdueOnly(true); setStatusFilter(''); }}
          className={`flex flex-col justify-between p-3.5 rounded-xl border text-left transition-all ${
            overdueOnly
              ? 'border-rose-500 bg-rose-50/70 ring-2 ring-rose-500 shadow-xs'
              : 'border-rose-200 bg-rose-50/20 hover:border-rose-300 hover:shadow-xs'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-wider text-rose-600">Overdue</span>
            <div className="flex h-6 w-6 items-center justify-center rounded-md bg-rose-100 text-rose-600">
              <AlertTriangle className="h-3.5 w-3.5 animate-pulse" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-2xl font-extrabold font-mono text-rose-700">{kpiStats.overdue}</span>
            <span className="text-[10px] font-bold text-rose-600">Action Req</span>
          </div>
        </button>

        {/* Completed */}
        <button
          onClick={() => { setStatusFilter('COMPLETED'); setOverdueOnly(false); }}
          className={`flex flex-col justify-between p-3.5 rounded-xl border text-left transition-all ${
            statusFilter === 'COMPLETED'
              ? 'border-emerald-500 bg-emerald-50/50 ring-2 ring-emerald-500 shadow-xs'
              : 'border-slate-200 bg-white hover:border-slate-300 hover:shadow-xs'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-600">Completed</span>
            <div className="flex h-6 w-6 items-center justify-center rounded-md bg-emerald-100 text-emerald-600">
              <CheckCircle2 className="h-3.5 w-3.5" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-2xl font-extrabold font-mono text-emerald-700">{kpiStats.completed}</span>
            <span className="text-[10px] font-medium text-emerald-600">Closed</span>
          </div>
        </button>
      </div>

      {/* Search, Filter Toolbar & View Switching */}
      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs space-y-3">
        <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
          {/* Search Box */}
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="search"
              value={search}
              onChange={(e) => { setSearch(e.target.value); setCurrentPage(1); }}
              placeholder="Search work order #, title, asset name/tag, location, or technician..."
              className="h-10 w-full rounded-lg border border-slate-200 bg-white pl-9 pr-3 text-xs text-slate-800 placeholder-slate-400 focus:border-[#FF5B00] focus:outline-none focus:ring-1 focus:ring-[#FF5B00]"
            />
          </div>

          {/* Quick Controls & View Switcher */}
          <div className="flex items-center gap-2">
            {activeFilterCount > 0 && (
              <button
                onClick={clearFilters}
                className="inline-flex items-center gap-1.5 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700 hover:bg-rose-100 transition-colors"
              >
                <X className="h-3.5 w-3.5" />
                Clear {activeFilterCount} Filters
              </button>
            )}

            <div className="flex items-center rounded-lg border border-slate-200 bg-slate-50 p-0.5">
              <button
                onClick={() => setViewMode('list')}
                className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${
                  viewMode === 'list'
                    ? 'bg-white text-[#0B1336] shadow-xs'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                <LayoutList className="h-3.5 w-3.5" />
                List View
              </button>

              <button
                onClick={() => setViewMode('board')}
                className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${
                  viewMode === 'board'
                    ? 'bg-white text-[#0B1336] shadow-xs'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                <LayoutGrid className="h-3.5 w-3.5" />
                Board View
              </button>
            </div>
          </div>
        </div>

        {/* Filter Dropdowns Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5 pt-1 border-t border-slate-100">
          <select
            value={statusFilter}
            onChange={(e) => { setStatusFilter(e.target.value); setCurrentPage(1); }}
            className="h-9 w-full rounded-lg border border-slate-200 bg-white px-2.5 text-xs text-slate-700 focus:border-[#FF5B00] focus:outline-none"
          >
            <option value="">All Statuses</option>
            <option value="OPEN">Open</option>
            <option value="ASSIGNED">Assigned</option>
            <option value="IN_PROGRESS">In Progress</option>
            <option value="ON_HOLD">On Hold</option>
            <option value="COMPLETED">Completed</option>
            <option value="CANCELLED">Cancelled</option>
          </select>

          <select
            value={typeFilter}
            onChange={(e) => { setTypeFilter(e.target.value); setCurrentPage(1); }}
            className="h-9 w-full rounded-lg border border-slate-200 bg-white px-2.5 text-xs text-slate-700 focus:border-[#FF5B00] focus:outline-none"
          >
            <option value="">All Work Types</option>
            <option value="CORRECTIVE">Corrective Maintenance</option>
            <option value="PREVENTIVE">Preventive Maintenance</option>
            <option value="EMERGENCY">Emergency Breakdown</option>
            <option value="INSPECTION">Inspection / Safety</option>
            <option value="GENERAL">General Support</option>
          </select>

          <select
            value={priorityFilter}
            onChange={(e) => { setPriorityFilter(e.target.value); setCurrentPage(1); }}
            className="h-9 w-full rounded-lg border border-slate-200 bg-white px-2.5 text-xs text-slate-700 focus:border-[#FF5B00] focus:outline-none"
          >
            <option value="">All Priorities</option>
            <option value="LOW">Low Priority</option>
            <option value="MEDIUM">Medium Priority</option>
            <option value="HIGH">High Priority</option>
            <option value="URGENT">Urgent Priority</option>
            <option value="EMERGENCY">Emergency Priority</option>
          </select>

          <select
            value={techFilter}
            onChange={(e) => { setTechFilter(e.target.value); setCurrentPage(1); }}
            className="h-9 w-full rounded-lg border border-slate-200 bg-white px-2.5 text-xs text-slate-700 focus:border-[#FF5B00] focus:outline-none"
          >
            <option value="">All Technicians</option>
            <option value="UNASSIGNED">Unassigned Only</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>{u.name}</option>
            ))}
          </select>

          <select
            value={branchFilter}
            onChange={(e) => { setBranchFilter(e.target.value); setCurrentPage(1); }}
            className="h-9 w-full rounded-lg border border-slate-200 bg-white px-2.5 text-xs text-slate-700 focus:border-[#FF5B00] focus:outline-none"
          >
            <option value="">All Branches</option>
            {branches.map((b) => (
              <option key={b.id} value={b.id}>{b.name} ({b.code})</option>
            ))}
          </select>
        </div>
      </div>

      {/* ── PERSISTENT MASTER-DETAIL SPLIT VIEW ── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start min-w-0">
        {/* LEFT PANEL: Work Orders List / Table / Board (~60-65% width -> lg:col-span-7) */}
        <div className={`lg:col-span-7 space-y-4 min-w-0 ${selectedWoId ? 'hidden lg:block' : 'block'}`}>
          {loading ? (
            <div className="rounded-xl border border-slate-200 bg-white p-12 text-center text-sm text-slate-500 shadow-xs">
              <RefreshCw className="mx-auto h-6 w-6 animate-spin text-[#FF5B00] mb-2" />
              Loading Work Orders...
            </div>
          ) : error ? (
            <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-8 text-center shadow-xs space-y-2">
              <p className="text-sm font-bold text-rose-800">Work orders could not be loaded</p>
              <p className="text-xs text-rose-600">{error}</p>
              {error.toLowerCase().includes('unauthorized') || error.toLowerCase().includes('session') ? (
                <Link
                  href="/login"
                  className="inline-block mt-2 rounded-lg bg-[#FF5B00] px-4 py-2 text-xs font-semibold text-white hover:bg-[#E65200] transition-colors"
                >
                  Log in to continue
                </Link>
              ) : (
                <button
                  type="button"
                  onClick={() => void fetchWorkOrders(false)}
                  className="inline-flex items-center gap-1 text-xs font-semibold text-[#FF5B00] hover:underline"
                >
                  <RefreshCw className="h-3.5 w-3.5" /> Try again
                </button>
              )}
            </div>
          ) : filteredWorkOrders.length === 0 ? (
            <div className="rounded-xl border border-slate-200 bg-white p-12 text-center shadow-xs space-y-3">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-400">
                <ClipboardList className="h-6 w-6" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-800">
                  {search || activeFilterCount > 0 ? 'No work orders match these filters' : 'No work orders yet'}
                </h3>
                <p className="mt-1 text-xs text-slate-500">
                  {search || activeFilterCount > 0
                    ? 'Try adjusting your search query or clear active filters.'
                    : 'Create your first work order or convert an approved maintenance request into a work order.'}
                </p>
              </div>
              {search || activeFilterCount > 0 ? (
                <button
                  onClick={clearFilters}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 shadow-xs hover:bg-slate-50 transition-colors"
                >
                  Clear Filters
                </button>
              ) : (
                <div className="flex items-center justify-center gap-3">
                  <Link
                    href="/requests"
                    className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-xs font-bold text-slate-700 shadow-xs hover:bg-slate-50 transition-colors"
                  >
                    Maintenance Requests
                  </Link>
                  <Link
                    href="/work-orders/new"
                    className="inline-flex items-center gap-2 rounded-lg bg-[#FF5B00] px-4 py-2 text-xs font-bold text-white shadow-xs hover:bg-[#F95700] transition-colors"
                  >
                    <Plus className="h-4 w-4" />
                    New Work Order
                  </Link>
                </div>
              )}
            </div>
          ) : viewMode === 'list' ? (
            /* List View (Table) */
            <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xs min-w-0">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                      <th className="px-4 py-3.5">WO Number</th>
                      <th className="px-4 py-3.5">Title / Scope</th>
                      <th className="px-4 py-3.5">Asset / Location</th>
                      <th className="px-4 py-3.5">Assigned Tech</th>
                      <th className="px-4 py-3.5">Priority</th>
                      <th className="px-4 py-3.5">Due Date</th>
                      <th className="px-4 py-3.5">Status</th>
                      <th className="px-4 py-3.5 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-sm">
                    {paginatedWorkOrders.map((wo) => {
                      const overdue = isWorkOrderOverdue(wo);
                      const isSelected = selectedWoId === wo.id;

                      return (
                        <tr
                          key={wo.id}
                          onClick={() => handleSelectWorkOrder(wo)}
                          className={`cursor-pointer transition-colors group ${
                            isSelected
                              ? 'bg-orange-50/70 border-l-4 border-l-[#FF5B00] ring-1 ring-orange-200'
                              : 'hover:bg-slate-50/90'
                          }`}
                        >
                          <td className="px-4 py-3.5 font-mono font-bold text-[#FF5B00] whitespace-nowrap">
                            <span className="group-hover:underline flex items-center gap-1">
                              {wo.workOrderNumber}
                              <ArrowUpRight className="h-3 w-3 opacity-0 group-hover:opacity-100 text-[#FF5B00] transition-opacity" />
                            </span>
                          </td>

                          <td className="px-4 py-3.5 max-w-[200px]">
                            <div className="font-semibold text-slate-800 truncate group-hover:text-[#FF5B00] transition-colors" title={wo.title}>{wo.title}</div>
                            <div className="mt-0.5 flex items-center gap-2">
                              <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">
                                {wo.type}
                              </span>
                            </div>
                          </td>

                          <td className="px-4 py-3.5 text-xs max-w-[180px]">
                            {wo.asset ? (
                              <div className="flex items-center gap-2 text-slate-700 font-medium min-w-0">
                                <AssetThumbnail assetId={wo.asset.id} imageUrl={wo.asset.imageUrl} assetName={wo.asset.name} size="sm" />
                                <span className="truncate" title={wo.asset.name}>{wo.asset.name}</span>
                              </div>
                            ) : wo.location ? (
                              <div className="flex items-center gap-1.5 text-slate-600">
                                <MapPin className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                                <span className="truncate" title={wo.location.name}>{wo.location.name}</span>
                              </div>
                            ) : (
                              <span className="italic text-slate-400">Facility Wide</span>
                            )}
                          </td>

                          <td className="px-4 py-3.5 text-xs whitespace-nowrap">
                            {wo.assignedUser ? (
                              <div className="flex items-center gap-1.5 text-slate-700 font-medium">
                                <User className="h-3.5 w-3.5 shrink-0 text-purple-600" />
                                <span className="truncate" title={wo.assignedUser.name}>{wo.assignedUser.name}</span>
                              </div>
                            ) : (
                              <span className="inline-flex items-center gap-1 rounded bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-700 border border-amber-200">
                                Unassigned
                              </span>
                            )}
                          </td>

                          <td className="px-4 py-3.5 whitespace-nowrap">
                            <WorkOrderPriorityBadge priority={wo.priority} size="sm" />
                          </td>

                          <td className="px-4 py-3.5 text-xs whitespace-nowrap">
                            {overdue ? (
                              <div className="inline-flex items-center gap-1 rounded bg-rose-50 px-2 py-0.5 text-[10px] font-bold text-rose-700 border border-rose-200">
                                <AlertTriangle className="h-3 w-3 text-rose-600" />
                                Overdue
                              </div>
                            ) : wo.plannedEnd ? (
                              <span className="font-mono text-slate-600">
                                {new Date(wo.plannedEnd).toLocaleDateString()}
                              </span>
                            ) : (
                              <span className="text-slate-400">—</span>
                            )}
                          </td>

                          <td className="px-4 py-3.5 whitespace-nowrap">
                            <WorkOrderStatusBadge status={wo.status} size="sm" />
                          </td>

                          <td className="px-4 py-3.5 text-right whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                            <div className="flex items-center justify-end gap-1.5">
                              {wo.status === 'OPEN' && (
                                <button
                                  onClick={() => handleQuickTransition(wo.id, 'IN_PROGRESS')}
                                  disabled={transitioningId === wo.id}
                                  className="inline-flex items-center gap-1 rounded px-2.5 py-1 text-xs font-semibold bg-blue-600 text-white hover:bg-blue-700 transition-colors disabled:opacity-50"
                                >
                                  <PlayCircle className="h-3.5 w-3.5" />
                                  {transitioningId === wo.id ? 'Starting…' : 'Start'}
                                </button>
                              )}

                              {wo.status === 'IN_PROGRESS' && (
                                <button
                                  onClick={() => handleQuickTransition(wo.id, 'COMPLETED')}
                                  disabled={transitioningId === wo.id}
                                  className="inline-flex items-center gap-1 rounded px-2.5 py-1 text-xs font-semibold bg-emerald-600 text-white hover:bg-emerald-700 transition-colors disabled:opacity-50"
                                >
                                  <CheckCircle2 className="h-3.5 w-3.5" />
                                  {transitioningId === wo.id ? 'Completing…' : 'Complete'}
                                </button>
                              )}

                              <button
                                onClick={() => handleSelectWorkOrder(wo)}
                                className={`rounded-lg border px-2.5 py-1 text-xs font-semibold transition-colors ${
                                  isSelected
                                    ? 'border-[#FF5B00] bg-[#FF5B00] text-white'
                                    : 'border-slate-200 text-slate-700 hover:bg-slate-100'
                                }`}
                              >
                                {isSelected ? 'Selected' : 'Inspect'}
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Pagination Controls */}
              <div className="flex flex-col sm:flex-row items-center justify-between gap-3 border-t border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-600">
                <div>
                  Showing <span className="font-bold text-slate-800">{(currentPage - 1) * pageSize + 1}</span> to{' '}
                  <span className="font-bold text-slate-800">{Math.min(currentPage * pageSize, filteredWorkOrders.length)}</span> of{' '}
                  <span className="font-bold text-slate-800">{filteredWorkOrders.length}</span> work orders
                </div>

                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-1.5">
                    <span>Per page:</span>
                    <select
                      value={pageSize}
                      onChange={(e) => { setPageSize(Number(e.target.value)); setCurrentPage(1); }}
                      className="rounded border border-slate-200 bg-white px-2 py-1 text-xs font-medium text-slate-700"
                    >
                      <option value={10}>10</option>
                      <option value={25}>25</option>
                      <option value={50}>50</option>
                    </select>
                  </div>

                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                      disabled={currentPage === 1}
                      className="rounded border border-slate-200 bg-white p-1 text-slate-600 hover:bg-slate-100 disabled:opacity-40"
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </button>
                    <span className="px-2 font-mono font-medium">
                      {currentPage} / {totalPages}
                    </span>
                    <button
                      onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                      disabled={currentPage === totalPages}
                      className="rounded border border-slate-200 bg-white p-1 text-slate-600 hover:bg-slate-100 disabled:opacity-40"
                    >
                      <ChevronRight className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            /* Board View (Kanban) */
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 min-w-0">
              {[
                { key: 'OPEN', label: 'Open / Assigned', statusGroup: ['OPEN', 'ASSIGNED'], accent: 'border-purple-300 bg-purple-50/20' },
                { key: 'IN_PROGRESS', label: 'In Progress', statusGroup: ['IN_PROGRESS'], accent: 'border-amber-300 bg-amber-50/20' },
                { key: 'ON_HOLD', label: 'On Hold', statusGroup: ['ON_HOLD'], accent: 'border-slate-300 bg-slate-50' },
                { key: 'COMPLETED', label: 'Completed', statusGroup: ['COMPLETED'], accent: 'border-emerald-300 bg-emerald-50/20' },
              ].map((column) => {
                const columnOrders = filteredWorkOrders.filter((w) => column.statusGroup.includes(w.status));

                return (
                  <div key={column.key} className={`rounded-xl border ${column.accent} p-3.5 space-y-3 flex flex-col min-h-[400px] min-w-0`}>
                    <div className="flex items-center justify-between pb-2 border-b border-slate-200/80">
                      <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700">{column.label}</h3>
                      <span className="rounded-full bg-slate-200 px-2 py-0.5 font-mono text-[10px] font-bold text-slate-700">
                        {columnOrders.length}
                      </span>
                    </div>

                    <div className="space-y-3 flex-1 overflow-y-auto max-h-[600px] pr-1 min-w-0">
                      {columnOrders.map((wo) => {
                        const overdue = isWorkOrderOverdue(wo);
                        const isSelected = selectedWoId === wo.id;

                        return (
                          <div
                            key={wo.id}
                            onClick={() => handleSelectWorkOrder(wo)}
                            className={`rounded-xl border p-3.5 shadow-2xs transition-all cursor-pointer space-y-2.5 min-w-0 ${
                              isSelected
                                ? 'border-[#FF5B00] bg-orange-50/70 ring-2 ring-[#FF5B00] shadow-xs'
                                : 'border-slate-200 bg-white hover:border-[#FF5B00]'
                            }`}
                          >
                            <div className="flex items-center justify-between">
                              <span className="font-mono font-bold text-[#FF5B00] text-xs">{wo.workOrderNumber}</span>
                              <WorkOrderPriorityBadge priority={wo.priority} size="sm" />
                            </div>

                            <div className="font-semibold text-xs text-slate-800 hover:text-[#FF5B00] line-clamp-2 break-words" title={wo.title}>
                              {wo.title}
                            </div>

                            <div className="space-y-1 text-[11px] text-slate-500">
                              {wo.asset && (
                                <div className="flex items-center gap-2 text-slate-600 min-w-0">
                                  <AssetThumbnail assetId={wo.asset.id} imageUrl={wo.asset.imageUrl} assetName={wo.asset.name} size="sm" />
                                  <span className="truncate font-medium text-slate-800" title={wo.asset.name}>{wo.asset.name}</span>
                                </div>
                              )}

                              <div className="flex items-center justify-between pt-1 text-[10px]">
                                {wo.assignedUser ? (
                                  <span className="flex items-center gap-1 text-slate-600 font-medium truncate">
                                    <User className="h-3 w-3 text-purple-600 shrink-0" />
                                    <span className="truncate" title={wo.assignedUser.name}>{wo.assignedUser.name}</span>
                                  </span>
                                ) : (
                                  <span className="text-amber-700 italic">Unassigned</span>
                                )}

                                {overdue && (
                                  <span className="font-bold text-rose-600 flex items-center gap-0.5 shrink-0">
                                    <AlertTriangle className="h-3 w-3" /> Overdue
                                  </span>
                                )}
                              </div>
                            </div>

                            <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
                              <WorkOrderStatusBadge status={wo.status} size="sm" />
                              <span className="text-[11px] font-semibold text-[#FF5B00] hover:underline flex items-center gap-0.5">
                                {isSelected ? 'Selected' : 'Inspect →'}
                              </span>
                            </div>
                          </div>
                        );
                      })}

                      {columnOrders.length === 0 && (
                        <div className="py-8 text-center text-xs text-slate-400 italic">No jobs in this stage</div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* RIGHT PANEL: Persistent Work Order Details (~35-40% width -> lg:col-span-5) */}
        <div className={`lg:col-span-5 min-w-0 ${selectedWoId ? 'block' : 'hidden lg:block'}`}>
          {selectedWoId && selectedWo ? (
            <div className="rounded-xl border border-slate-200 bg-white shadow-xs sticky top-6 flex flex-col max-h-[calc(100vh-6rem)] overflow-hidden min-w-0">

              {/* Sticky Header Section */}
              <div className="shrink-0 bg-white border-b border-slate-200 px-5 pt-5 pb-3 space-y-3 z-10 min-w-0">
                {/* Mobile Back Button */}
                <div className="flex items-center justify-between pb-2 border-b border-slate-100 lg:hidden">
                  <button
                    onClick={() => setSelectedWoId(null)}
                    className="inline-flex items-center gap-1 text-xs font-semibold text-[#FF5B00] hover:underline"
                  >
                    <ChevronLeft className="h-4 w-4" /> Back to Work Orders List
                  </button>
                  <span className="font-mono font-bold text-xs text-slate-600">{selectedWo.workOrderNumber}</span>
                </div>

                {/* Detail Header */}
                <div className="flex items-start justify-between gap-3 min-w-0">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono font-extrabold text-sm text-[#FF5B00] shrink-0">{selectedWo.workOrderNumber}</span>
                      <WorkOrderStatusBadge status={selectedWo.status} size="sm" />
                    </div>
                    <h2 className="mt-1 text-base font-bold text-[#0B1336] leading-snug break-words" title={selectedWo.title}>{selectedWo.title}</h2>
                  </div>
                  <button
                    onClick={() => setSelectedWoId(null)}
                    className="hidden lg:flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-slate-200 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-colors"
                    title="Close Detail Panel"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>

                {/* Quick Status & Metadata Banner */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 rounded-lg border border-slate-200 bg-slate-50 p-2.5 text-xs min-w-0">
                  <div className="min-w-0">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">Priority</span>
                    <div className="mt-0.5"><WorkOrderPriorityBadge priority={selectedWo.priority} size="sm" /></div>
                  </div>
                  <div className="min-w-0">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">Type</span>
                    <span className="mt-0.5 font-bold text-slate-800 block truncate" title={selectedWo.type}>{selectedWo.type}</span>
                  </div>
                  <div className="min-w-0">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">Due Date</span>
                    <span className="mt-0.5 font-mono font-bold text-slate-800 block truncate">
                      {selectedWo.plannedEnd ? new Date(selectedWo.plannedEnd).toLocaleDateString() : 'Unscheduled'}
                    </span>
                  </div>
                  <div className="min-w-0">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">Total Cost</span>
                    <span className="mt-0.5 font-mono font-bold text-emerald-700 block truncate">GHS {selectedWo.totalCost ?? 0}</span>
                  </div>
                </div>

                {/* Detail Tabs Navigation */}
                <div className="overflow-x-auto scrollbar-none min-w-0">
                  <nav className="flex gap-4 text-xs font-semibold whitespace-nowrap min-w-full">
                    {[
                      { key: 'overview', label: 'Overview' },
                      { key: 'tasks', label: `Tasks (${selectedWo.checklists?.length ?? 0})` },
                      { key: 'labor', label: `Labor (${selectedWo.labor?.length ?? 0})` },
                      { key: 'parts', label: `Parts (${selectedWo.parts?.length ?? 0})` },
                      { key: 'history', label: 'History' },
                    ].map((t) => (
                      <button
                        key={t.key}
                        onClick={() => setDetailTab(t.key as any)}
                        className={`pb-2 border-b-2 transition-colors ${
                          detailTab === t.key
                            ? 'border-[#FF5B00] text-[#FF5B00]'
                            : 'border-transparent text-slate-500 hover:text-slate-800'
                        }`}
                      >
                        {t.label}
                      </button>
                    ))}
                  </nav>
                </div>
              </div>

              {/* Scrollable Body Section */}
              <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4 min-w-0">
                {/* Error State inside Right Panel */}
                {detailError && (
                  <div role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700">
                    <span className="font-bold">Error:</span> {detailError}
                    <button
                      onClick={() => fetchWorkOrderDetail(selectedWoId)}
                      className="ml-2 font-semibold underline hover:text-rose-900"
                    >
                      Retry
                    </button>
                  </div>
                )}

                {/* Loading State inside Right Panel */}
                {detailLoading && !selectedWo.description && (
                  <div className="py-8 text-center text-xs text-slate-500">
                    <RefreshCw className="mx-auto h-5 w-5 animate-spin text-[#FF5B00] mb-2" />
                    Loading work order details...
                  </div>
                )}

                {/* Tab 1: Overview */}
                {detailTab === 'overview' && (
                  <div className="space-y-4 text-xs min-w-0">
                    {/* Description / Scope */}
                    <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-1.5 shadow-2xs min-w-0">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Work Scope & Description</span>
                      <p className="text-slate-700 leading-relaxed whitespace-pre-line break-words">{selectedWo.description || 'No description provided.'}</p>
                    </div>

                    {/* Asset & Location Info */}
                    <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-3 shadow-2xs min-w-0">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1">
                        <Wrench className="h-3.5 w-3.5 text-[#FF5B00] shrink-0" /> Asset & Location Context
                      </span>
                      {selectedWo.asset ? (
                        <div className="flex items-center gap-3 p-3 rounded-lg border border-slate-200 bg-slate-50 min-w-0">
                          <AssetThumbnail assetId={selectedWo.asset.id} imageUrl={selectedWo.asset.imageUrl} assetName={selectedWo.asset.name} size="lg" />
                          <div className="min-w-0 flex-1">
                            <div className="font-bold text-slate-800 truncate" title={selectedWo.asset.name}>{selectedWo.asset.name}</div>
                            <div className="font-mono text-xs font-semibold text-[#FF5B00]">{selectedWo.asset.assetTag}</div>
                          </div>
                        </div>
                      ) : (
                        <div className="text-xs italic text-slate-400">Facility Wide (No specific asset)</div>
                      )}
                      <dl className="grid grid-cols-2 gap-3 text-slate-700">
                        <div>
                          <dt className="text-[10px] text-slate-400">Location</dt>
                          <dd className="font-semibold truncate" title={selectedWo.location?.name}>{selectedWo.location ? selectedWo.location.name : 'Facility Wide'}</dd>
                        </div>
                        <div>
                          <dt className="text-[10px] text-slate-400">Branch</dt>
                          <dd className="font-semibold truncate" title={selectedWo.branch?.name}>{selectedWo.branch ? selectedWo.branch.name : 'HQ'}</dd>
                        </div>
                      </dl>
                    </div>

                    {/* Assignment Control */}
                    <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-2.5 shadow-2xs min-w-0">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1">
                        <User className="h-3.5 w-3.5 text-purple-600 shrink-0" /> Lead Technician Assignment
                      </span>
                      <div className="flex items-center gap-2 min-w-0">
                        <select
                          value={assigningTechId}
                          onChange={(e) => setAssigningTechId(e.target.value)}
                          className="flex-1 min-w-0 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-800 focus:border-[#FF5B00] focus:outline-none truncate"
                        >
                          <option value="">Unassigned</option>
                          {users.map((u) => (
                            <option key={u.id} value={u.id}>{u.name} ({u.email})</option>
                          ))}
                        </select>
                        <button
                          onClick={() => handleAssignTechnician(assigningTechId)}
                          className="shrink-0 rounded-lg bg-purple-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-purple-700 transition-colors"
                        >
                          Assign
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {/* Tab 2: Tasks & Checklist */}
                {detailTab === 'tasks' && (
                  <div className="space-y-3 text-xs min-w-0">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Mandatory Work Checklist Items</span>
                    {!selectedWo.checklists || selectedWo.checklists.length === 0 ? (
                      <p className="text-slate-400 italic py-4 text-center">No checklist items defined for this work order.</p>
                    ) : (
                      <div className="space-y-2 min-w-0">
                        {selectedWo.checklists.map((item: any) => (
                          <div key={item.id} className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3 min-w-0">
                            <div className="space-y-0.5 min-w-0 flex-1">
                              <span className="font-semibold text-slate-800 break-words block">{item.checkItem}</span>
                              {item.isMandatory && <span className="text-[9px] font-bold text-rose-600 uppercase">Required</span>}
                            </div>
                            <span className={`shrink-0 px-2 py-0.5 rounded font-mono font-bold text-[10px] ${
                              item.passFail === true ? 'bg-emerald-100 text-emerald-800' : item.passFail === false ? 'bg-rose-100 text-rose-800' : 'bg-slate-200 text-slate-600'
                            }`}>
                              {item.passFail === true ? 'PASS' : item.passFail === false ? 'FAIL' : 'PENDING'}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Tab 3: Labor */}
                {detailTab === 'labor' && (
                  <div className="space-y-3 text-xs min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Technician Labor Hours Logged</span>
                      <Link
                        href={`/work-orders/${selectedWo.id}`}
                        className="text-[#FF5B00] font-bold hover:underline shrink-0"
                      >
                        + Record Hours
                      </Link>
                    </div>
                    {!selectedWo.labor || selectedWo.labor.length === 0 ? (
                      <p className="text-slate-400 italic py-4 text-center">No labor hours recorded yet.</p>
                    ) : (
                      <div className="divide-y divide-slate-100 rounded-lg border border-slate-200 overflow-hidden min-w-0">
                        {selectedWo.labor.map((l: any) => (
                          <div key={l.id} className="p-3 flex items-center justify-between gap-2 bg-white min-w-0">
                            <div className="min-w-0 flex-1">
                              <div className="font-bold text-slate-800 truncate" title={l.technicianUser?.name}>{l.technicianUser?.name}</div>
                              <div className="text-[10px] text-slate-400">{new Date(l.createdAt).toLocaleDateString()}</div>
                            </div>
                            <div className="text-right shrink-0">
                              <div className="font-mono font-bold text-slate-800">{l.hoursWorked} hrs</div>
                              <div className="text-[10px] font-mono text-emerald-700">GHS {l.totalCost}</div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Tab 4: Parts */}
                {detailTab === 'parts' && (
                  <div className="space-y-3 text-xs min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Required Materials & Spare Parts</span>
                      <Link
                        href={`/work-orders/${selectedWo.id}`}
                        className="text-[#FF5B00] font-bold hover:underline shrink-0"
                      >
                        + Add Parts
                      </Link>
                    </div>
                    {!selectedWo.parts || selectedWo.parts.length === 0 ? (
                      <p className="text-slate-400 italic py-4 text-center">No materials or parts linked yet.</p>
                    ) : (
                      <div className="divide-y divide-slate-100 rounded-lg border border-slate-200 overflow-hidden min-w-0">
                        {selectedWo.parts.map((p: any) => (
                          <div key={p.id} className="p-3 flex items-center justify-between gap-2 bg-white min-w-0">
                            <div className="min-w-0 flex-1">
                              <div className="font-bold text-slate-800 truncate" title={p.partName}>{p.partName}</div>
                              <div className="font-mono text-[10px] text-[#FF5B00] truncate" title={p.partNumber}>{p.partNumber}</div>
                            </div>
                            <div className="text-right shrink-0">
                              <div className="font-mono font-bold text-slate-800">{p.quantityConsumed} / {p.quantityPlanned} {p.uom}</div>
                              <div className="text-[10px] font-mono text-emerald-700">GHS {p.unitCost} / unit</div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Tab 5: History */}
                {detailTab === 'history' && (
                  <div className="space-y-3 text-xs min-w-0">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Timestamped Status & Audit Log</span>
                    {!selectedWo.statusHistory || selectedWo.statusHistory.length === 0 ? (
                      <p className="text-slate-400 italic py-4 text-center">No status transitions recorded.</p>
                    ) : (
                      <div className="space-y-2 min-w-0">
                        {selectedWo.statusHistory.map((sh: any) => (
                          <div key={sh.id} className="rounded-lg border border-slate-200 bg-slate-50 p-3 space-y-1 min-w-0">
                            <div className="flex items-center justify-between text-[10px] gap-2">
                              <span className="font-bold text-slate-700 truncate">{sh.fromStatus} → {sh.toStatus}</span>
                              <span className="font-mono text-slate-400 shrink-0">{new Date(sh.changedAt).toLocaleString()}</span>
                            </div>
                            <div className="text-slate-500 text-[11px] truncate">Changed by: <span className="font-medium text-slate-700">{sh.changedByUser?.name ?? 'System'}</span></div>
                            {sh.reason && <div className="text-slate-500 italic text-[11px] break-words">Reason: {sh.reason}</div>}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Sticky Footer Actions */}
              <div className="shrink-0 bg-white border-t border-slate-200 px-5 py-3.5 flex flex-wrap items-center justify-between gap-2 z-10 min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  {selectedWo.status === 'OPEN' && (
                    <button
                      onClick={() => handleQuickTransition(selectedWo.id, 'IN_PROGRESS')}
                      disabled={transitioningId === selectedWo.id}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-2 text-xs font-bold text-white shadow-xs hover:bg-blue-700 transition-colors disabled:opacity-50"
                    >
                      <PlayCircle className="h-3.5 w-3.5" />
                      {transitioningId === selectedWo.id ? 'Starting…' : 'Start Work'}
                    </button>
                  )}

                  {selectedWo.status === 'IN_PROGRESS' && (
                    <>
                      <button
                        onClick={() => handleQuickTransition(selectedWo.id, 'ON_HOLD', 'Paused by technician')}
                        disabled={transitioningId === selectedWo.id}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-3.5 py-2 text-xs font-semibold text-amber-800 hover:bg-amber-100 transition-colors disabled:opacity-50"
                      >
                        <PauseCircle className="h-3.5 w-3.5" />
                        {transitioningId === selectedWo.id ? 'Pausing…' : 'Pause'}
                      </button>
                      <button
                        onClick={() => handleQuickTransition(selectedWo.id, 'COMPLETED')}
                        disabled={transitioningId === selectedWo.id}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3.5 py-2 text-xs font-bold text-white shadow-xs hover:bg-emerald-700 transition-colors disabled:opacity-50"
                      >
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        {transitioningId === selectedWo.id ? 'Completing…' : 'Complete'}
                      </button>
                    </>
                  )}

                  {selectedWo.status === 'ON_HOLD' && (
                    <button
                      onClick={() => handleQuickTransition(selectedWo.id, 'IN_PROGRESS')}
                      disabled={transitioningId === selectedWo.id}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3.5 py-2 text-xs font-bold text-white shadow-xs hover:bg-blue-700 transition-colors disabled:opacity-50"
                    >
                      <PlayCircle className="h-3.5 w-3.5" />
                      {transitioningId === selectedWo.id ? 'Resuming…' : 'Resume'}
                    </button>
                  )}
                </div>

                <Link
                  href={`/work-orders/${selectedWo.id}`}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 shadow-xs hover:bg-slate-50 transition-colors shrink-0"
                >
                  <ExternalLink className="h-3.5 w-3.5 text-[#FF5B00]" />
                  Full Workspace
                </Link>
              </div>

            </div>
          ) : (
            <div className="rounded-xl border border-slate-200 bg-white p-12 text-center shadow-xs space-y-3 sticky top-6">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-orange-50 text-[#FF5B00]">
                <ClipboardList className="h-6 w-6" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-800">Select a work order to view its details.</h3>
                <p className="mt-1 text-xs text-slate-500">
                  Click any work order in the list or board view to inspect tasks, parts, labor, and execution history side by side without popups or overlays.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
