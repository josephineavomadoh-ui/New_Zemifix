'use client';

import React, { useMemo, useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import {
  CalendarCheck2, ClipboardList, Plus, Search, Filter, Wrench, Calendar,
  CheckCircle2, Clock, AlertTriangle, Layers, PlayCircle, PauseCircle,
  ArrowUpRight, ChevronLeft, ChevronRight, ExternalLink, User, Check, X, Building2, RefreshCw
} from 'lucide-react';
import { PageHeader } from '@/src/components/ui/PageHeader';
import { AssetThumbnail } from '@/src/components/assets/AssetThumbnail';

export function PreventiveView() {
  const [plans, setPlans] = useState<any[]>([]);
  const [assets, setAssets] = useState<any[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [branchFilter, setBranchFilter] = useState('');

  // Selected Master-Detail Split View State
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null);
  const [detailTab, setDetailTab] = useState<'overview' | 'checklist' | 'history'>('overview');

  // New Maintenance Plan Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [formName, setFormName] = useState('');
  const [formAssetId, setFormAssetId] = useState('');
  const [formTriggerType, setFormTriggerType] = useState<'TIME' | 'METER'>('TIME');
  const [formFrequency, setFormFrequency] = useState('Every 3 Months');
  const [formNextDue, setFormNextDue] = useState(new Date().toISOString().slice(0, 10));
  const [formAssignedTeam, setFormAssignedTeam] = useState('General Maintenance Team');
  const [formEstimatedHours, setFormEstimatedHours] = useState('3.0');
  const [formDescription, setFormDescription] = useState('');
  const [formLoading, setFormLoading] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Fetch plans and assets
  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [plansRes, assetsRes] = await Promise.all([
        fetch('/api/preventive/plans'),
        fetch('/api/assets'),
      ]);

      const plansData = await plansRes.json();
      const assetsData = await assetsRes.json();

      if (plansRes.ok) {
        setPlans(plansData.plans ?? []);
      } else {
        throw new Error(plansData.error || 'Failed to fetch maintenance plans.');
      }

      if (assetsRes.ok) {
        setAssets(assetsData.assets ?? []);
      }
      setError(null);
    } catch (err: any) {
      console.error('Failed to load preventive maintenance data:', err);
      setError(err.message ?? 'Unable to load maintenance plans.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  const selectedPlan = plans.find((p) => p.id === selectedPlanId) ?? null;

  // KPI Calculations from Database Records
  const kpis = useMemo(() => {
    const total = plans.length;
    const active = plans.filter((p) => p.status === 'ACTIVE').length;
    const overdue = plans.filter((p) => p.isOverdue).length;
    const dueSoon = plans.filter((p) => !p.isOverdue && p.status === 'ACTIVE').length;
    // Generated work orders count across all plans or system
    const totalWorkOrdersGenerated = plans.reduce((acc, p) => acc + (p.workOrdersCount ?? 0), 0);
    return { total, active, overdue, dueSoon, totalWorkOrdersGenerated };
  }, [plans]);

  // Filtered plans
  const filteredPlans = useMemo(() => {
    return plans.filter((p) => {
      const q = search.trim().toLowerCase();
      const matchesSearch =
        !q ||
        [p.code, p.name, p.asset?.name, p.asset?.assetTag, p.branch?.name, p.assignedTeam]
          .filter(Boolean)
          .some((val) => String(val).toLowerCase().includes(q));

      const matchesStatus =
        !statusFilter ||
        (statusFilter === 'Active' && p.status === 'ACTIVE' && !p.isOverdue) ||
        (statusFilter === 'Overdue' && p.isOverdue) ||
        (statusFilter === 'Paused' && p.status === 'PAUSED');

      const matchesType = !typeFilter || p.triggerType === typeFilter;
      const matchesBranch = !branchFilter || p.branch?.name === branchFilter;

      return matchesSearch && matchesStatus && matchesType && matchesBranch;
    });
  }, [plans, search, statusFilter, typeFilter, branchFilter]);

  const activeFilterCount = [statusFilter, typeFilter, branchFilter].filter(Boolean).length;

  const clearFilters = () => {
    setSearch('');
    setStatusFilter('');
    setTypeFilter('');
    setBranchFilter('');
  };

  const handleToggleStatus = async (planId: string) => {
    try {
      const plan = plans.find((p) => p.id === planId);
      if (!plan) return;
      const newStatus = plan.status === 'ACTIVE' ? 'PAUSED' : 'ACTIVE';

      const res = await fetch(`/api/preventive/plans/${planId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });
      if (res.ok) {
        await fetchData();
      }
    } catch (err) {
      console.error('Failed to toggle plan status:', err);
    }
  };

  const handleCreatePlan = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName.trim() || !formAssetId) {
      setFormError('Please provide a maintenance plan name and select an asset.');
      return;
    }

    setFormLoading(true);
    setFormError(null);

    try {
      const res = await fetch('/api/preventive/plans', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: formName.trim(),
          description: formDescription.trim(),
          assetId: formAssetId,
          triggerType: formTriggerType,
          frequency: formFrequency.trim(),
          nextDue: formNextDue,
          assignedTeam: formAssignedTeam.trim(),
          estimatedHours: parseFloat(formEstimatedHours) || 3.0,
          checklist: [
            { id: 'c1', description: formDescription.trim() || 'General preventive inspection', passCriteria: 'Meets operating spec', mandatory: true },
          ],
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to create maintenance plan.');
      }

      setIsModalOpen(false);
      setFormName('');
      setFormAssetId('');
      setFormDescription('');
      await fetchData();
      if (data.plan) {
        setSelectedPlanId(data.plan.id);
      }
    } catch (err: any) {
      setFormError(err.message ?? 'Failed to create maintenance plan.');
    } finally {
      setFormLoading(false);
    }
  };

  return (
    <div className="space-y-6 max-w-full overflow-hidden">
      {/* Page Header */}
      <div className="flex flex-col items-start justify-between gap-4 border-b border-slate-200 pb-5 sm:flex-row sm:items-center">
        <div>
          <h1 className="flex items-center gap-2.5 text-2xl font-bold tracking-tight text-[#0B1336]">
            <CalendarCheck2 className="h-6 w-6 text-[#FF5B00]" />
            Preventive Maintenance
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Plan, schedule and track recurring maintenance activities and compliance across your equipment fleet.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          <button
            onClick={() => void fetchData()}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-600 shadow-xs hover:bg-slate-50 transition-colors"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Refresh
          </button>

          <Link
            href="/work-orders/calendar"
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 shadow-xs hover:bg-slate-50 transition-colors"
          >
            <Calendar className="h-3.5 w-3.5 text-slate-500" />
            Maintenance Calendar
          </Link>

          <Link
            href="/work-orders"
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 shadow-xs hover:bg-slate-50 transition-colors"
          >
            <ClipboardList className="h-3.5 w-3.5 text-[#FF5B00]" />
            Work Orders
          </Link>

          <button
            onClick={() => { setFormError(null); setIsModalOpen(true); }}
            className="inline-flex items-center gap-2 rounded-lg bg-[#FF5B00] px-4 py-2 text-xs font-bold text-white shadow-xs hover:bg-[#F95700] transition-colors"
          >
            <Plus className="h-4 w-4" />
            New Maintenance Plan
          </button>
        </div>
      </div>

      {/* KPI Summary Cards (Restrained Enterprise Design with Top Accent Strip) */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {/* Total Plans */}
        <button
          onClick={() => setStatusFilter('')}
          className={`flex flex-col justify-between p-3.5 rounded-xl border border-slate-200 bg-white hover:border-slate-300 hover:shadow-xs text-left transition-all relative overflow-hidden ${
            !statusFilter ? 'ring-2 ring-[#0B1336]/20 bg-slate-50/50' : ''
          }`}
        >
          <div className="absolute top-0 left-0 right-0 h-1 bg-[#0B1336]" />
          <div className="flex items-center justify-between pt-1">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Total Plans</span>
            <div className="flex h-6 w-6 items-center justify-center rounded-md bg-slate-100 text-[#0B1336]">
              <Layers className="h-3.5 w-3.5" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-2xl font-extrabold font-mono text-[#0B1336]">{kpis.total}</span>
            <span className="text-[10px] font-medium text-slate-400">Scheduled</span>
          </div>
        </button>

        {/* Active Plans */}
        <button
          onClick={() => setStatusFilter('Active')}
          className={`flex flex-col justify-between p-3.5 rounded-xl border border-slate-200 bg-white hover:border-slate-300 hover:shadow-xs text-left transition-all relative overflow-hidden ${
            statusFilter === 'Active' ? 'ring-2 ring-emerald-500/20 bg-emerald-50/30' : ''
          }`}
        >
          <div className="absolute top-0 left-0 right-0 h-1 bg-emerald-600" />
          <div className="flex items-center justify-between pt-1">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Active Plans</span>
            <div className="flex h-6 w-6 items-center justify-center rounded-md bg-emerald-50 text-emerald-600">
              <CheckCircle2 className="h-3.5 w-3.5" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-2xl font-extrabold font-mono text-[#0B1336]">{kpis.active}</span>
            <span className="text-[10px] font-medium text-emerald-600">Running</span>
          </div>
        </button>

        {/* Due Soon */}
        <button
          onClick={() => setStatusFilter('Active')}
          className="flex flex-col justify-between p-3.5 rounded-xl border border-slate-200 bg-white hover:border-slate-300 hover:shadow-xs text-left transition-all relative overflow-hidden"
        >
          <div className="absolute top-0 left-0 right-0 h-1 bg-blue-600" />
          <div className="flex items-center justify-between pt-1">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Due Soon</span>
            <div className="flex h-6 w-6 items-center justify-center rounded-md bg-blue-50 text-blue-600">
              <Clock className="h-3.5 w-3.5" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-2xl font-extrabold font-mono text-[#0B1336]">{kpis.dueSoon}</span>
            <span className="text-[10px] font-medium text-blue-600">Upcoming</span>
          </div>
        </button>

        {/* Overdue */}
        <button
          onClick={() => setStatusFilter('Overdue')}
          className={`flex flex-col justify-between p-3.5 rounded-xl border border-slate-200 bg-white hover:border-slate-300 hover:shadow-xs text-left transition-all relative overflow-hidden ${
            statusFilter === 'Overdue' ? 'ring-2 ring-rose-500/20 bg-rose-50/30' : ''
          }`}
        >
          <div className="absolute top-0 left-0 right-0 h-1 bg-rose-600" />
          <div className="flex items-center justify-between pt-1">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Overdue</span>
            <div className="flex h-6 w-6 items-center justify-center rounded-md bg-rose-50 text-rose-600">
              <AlertTriangle className="h-3.5 w-3.5" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-2xl font-extrabold font-mono text-[#0B1336]">{kpis.overdue}</span>
            <span className="text-[10px] font-bold text-rose-600">Action Req</span>
          </div>
        </button>

        {/* Generated Work Orders */}
        <div className="flex flex-col justify-between p-3.5 rounded-xl border border-slate-200 bg-white shadow-xs text-left relative overflow-hidden">
          <div className="absolute top-0 left-0 right-0 h-1 bg-[#FF5B00]" />
          <div className="flex items-center justify-between pt-1">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Generated WOs</span>
            <div className="flex h-6 w-6 items-center justify-center rounded-md bg-orange-50 text-[#FF5B00]">
              <ClipboardList className="h-3.5 w-3.5" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-2xl font-extrabold font-mono text-[#0B1336]">{kpis.totalWorkOrdersGenerated}</span>
            <span className="text-[10px] font-medium text-[#FF5B00]">History</span>
          </div>
        </div>
      </div>

      {/* Search & Filter Toolbar */}
      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs space-y-3">
        <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search plan code, name, asset name/tag, branch, or assigned team..."
              className="h-10 w-full rounded-lg border border-slate-200 bg-white pl-9 pr-3 text-xs text-slate-800 placeholder-slate-400 focus:border-[#FF5B00] focus:outline-none focus:ring-1 focus:ring-[#FF5B00]"
            />
          </div>

          {activeFilterCount > 0 && (
            <button
              onClick={clearFilters}
              className="inline-flex items-center gap-1.5 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700 hover:bg-rose-100 transition-colors"
            >
              <X className="h-3.5 w-3.5" />
              Clear {activeFilterCount} Filters
            </button>
          )}
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 pt-1 border-t border-slate-100">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="h-9 w-full rounded-lg border border-slate-200 bg-white px-2.5 text-xs text-slate-700 focus:border-[#FF5B00] focus:outline-none"
          >
            <option value="">All Statuses</option>
            <option value="Active">Active / Due Soon</option>
            <option value="Overdue">Overdue Only</option>
            <option value="Paused">Paused</option>
          </select>

          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="h-9 w-full rounded-lg border border-slate-200 bg-white px-2.5 text-xs text-slate-700 focus:border-[#FF5B00] focus:outline-none"
          >
            <option value="">All Trigger Types</option>
            <option value="TIME">Time-based</option>
            <option value="METER">Meter-based</option>
          </select>

          <select
            value={branchFilter}
            onChange={(e) => setBranchFilter(e.target.value)}
            className="h-9 w-full rounded-lg border border-slate-200 bg-white px-2.5 text-xs text-slate-700 focus:border-[#FF5B00] focus:outline-none"
          >
            <option value="">All Branches</option>
            {Array.from(new Set(plans.map((p) => p.branch?.name).filter(Boolean))).map((bName) => (
              <option key={bName as string} value={bName as string}>{bName as string}</option>
            ))}
          </select>
        </div>
      </div>

      {/* ── PERSISTENT MASTER-DETAIL SPLIT VIEW ── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start min-w-0">
        {/* LEFT PANEL: Maintenance Plans Table (~60-65% width -> lg:col-span-7) */}
        <div className={`lg:col-span-7 space-y-4 min-w-0 ${selectedPlanId ? 'hidden lg:block' : 'block'}`}>
          {loading ? (
            <div className="rounded-xl border border-slate-200 bg-white p-12 text-center text-sm text-slate-500 shadow-xs">
              <RefreshCw className="mx-auto h-6 w-6 animate-spin text-[#FF5B00] mb-2" />
              Loading Maintenance Plans from PostgreSQL...
            </div>
          ) : error ? (
            <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-8 text-center shadow-xs space-y-2">
              <p className="text-sm font-bold text-rose-800">Maintenance plans could not be loaded</p>
              <p className="text-xs text-rose-600">{error}</p>
              <button
                type="button"
                onClick={() => void fetchData()}
                className="inline-flex items-center gap-1 text-xs font-semibold text-[#FF5B00] hover:underline mt-2"
              >
                <RefreshCw className="h-3.5 w-3.5" /> Try again
              </button>
            </div>
          ) : filteredPlans.length === 0 ? (
            <div className="rounded-xl border border-slate-200 bg-white p-12 text-center shadow-xs space-y-3">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-400">
                <CalendarCheck2 className="h-6 w-6" />
              </div>
              <h3 className="text-sm font-bold text-slate-800">No maintenance plans found</h3>
              <p className="text-xs text-slate-500">Create your first permanent maintenance plan to schedule recurring equipment service.</p>
              <button
                onClick={() => { setFormError(null); setIsModalOpen(true); }}
                className="inline-flex items-center gap-2 rounded-lg bg-[#FF5B00] px-4 py-2 text-xs font-bold text-white shadow-xs hover:bg-[#F95700] transition-colors"
              >
                <Plus className="h-4 w-4" />
                New Maintenance Plan
              </button>
            </div>
          ) : (
            <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xs min-w-0">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                      <th className="px-4 py-3.5">Plan & Asset</th>
                      <th className="px-4 py-3.5">Type / Frequency</th>
                      <th className="px-4 py-3.5">Next Due</th>
                      <th className="px-4 py-3.5">Assigned Team</th>
                      <th className="px-4 py-3.5">Status</th>
                      <th className="px-4 py-3.5 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-sm">
                    {filteredPlans.map((pm) => {
                      const isSelected = selectedPlanId === pm.id;

                      return (
                        <tr
                          key={pm.id}
                          onClick={() => setSelectedPlanId(pm.id)}
                          className={`cursor-pointer transition-colors group ${
                            isSelected
                              ? 'bg-orange-50/70 border-l-4 border-l-[#FF5B00] ring-1 ring-orange-200'
                              : 'hover:bg-slate-50/90'
                          }`}
                        >
                          <td className="px-4 py-3.5 max-w-[220px]">
                            <div className="flex items-center gap-2.5 min-w-0">
                              <AssetThumbnail
                                assetId={pm.asset?.id ?? pm.assetId}
                                imageUrl={pm.asset?.imageUrl}
                                assetName={pm.asset?.name ?? 'Equipment Asset'}
                                size="sm"
                              />
                              <div className="min-w-0 flex-1">
                                <div className="font-semibold text-slate-800 truncate group-hover:text-[#FF5B00] transition-colors" title={pm.name}>
                                  {pm.name}
                                </div>
                                <div className="mt-0.5 flex items-center gap-1.5 font-mono text-[11px] text-[#FF5B00]">
                                  <span>{pm.code}</span>
                                  <span className="text-slate-400">·</span>
                                  <span className="text-slate-500 truncate">{pm.asset?.assetTag ?? 'AST'}</span>
                                </div>
                              </div>
                            </div>
                          </td>

                          <td className="px-4 py-3.5 text-xs whitespace-nowrap">
                            <div className="font-medium text-slate-800">{pm.triggerType} Trigger</div>
                            <div className="text-slate-500">{pm.frequency}</div>
                          </td>

                          <td className="px-4 py-3.5 text-xs whitespace-nowrap">
                            <div className="font-mono text-slate-600">{new Date(pm.nextDue).toLocaleDateString()}</div>
                            <div className="text-[10px] text-slate-400">Last: {pm.lastCompleted ? new Date(pm.lastCompleted).toLocaleDateString() : 'Never'}</div>
                          </td>

                          <td className="px-4 py-3.5 text-xs whitespace-nowrap">
                            <div className="font-medium text-slate-700 truncate max-w-[130px]" title={pm.assignedTeam}>
                              {pm.assignedTeam ?? 'General Team'}
                            </div>
                            <div className="text-[10px] text-slate-400">{pm.branch?.name ?? 'HQ'}</div>
                          </td>

                          <td className="px-4 py-3.5 whitespace-nowrap">
                            {pm.isOverdue ? (
                              <span className="inline-flex items-center gap-1 rounded bg-rose-50 px-2 py-0.5 text-[10px] font-bold text-rose-700 border border-rose-200">
                                <AlertTriangle className="h-3 w-3 text-rose-600" /> Overdue
                              </span>
                            ) : pm.status === 'ACTIVE' ? (
                              <span className="inline-flex items-center gap-1 rounded bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700 border border-emerald-200">
                                <CheckCircle2 className="h-3 w-3 text-emerald-600" /> Active
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 rounded bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-600 border border-slate-200">
                                Paused
                              </span>
                            )}
                          </td>

                          <td className="px-4 py-3.5 text-right whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                            <div className="flex items-center justify-end gap-1.5">
                              <button
                                onClick={() => setSelectedPlanId(pm.id)}
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
            </div>
          )}
        </div>

        {/* RIGHT PANEL: Maintenance Plan Details (~35-40% width -> lg:col-span-5) */}
        <div className={`lg:col-span-5 min-w-0 ${selectedPlanId ? 'block' : 'hidden lg:block'}`}>
          {selectedPlanId && selectedPlan ? (
            <div className="rounded-xl border border-slate-200 bg-white shadow-xs sticky top-6 flex flex-col max-h-[calc(100vh-6rem)] overflow-hidden min-w-0">

              {/* Sticky Header Section */}
              <div className="shrink-0 bg-white border-b border-slate-200 px-5 pt-5 pb-3 space-y-3 z-10 min-w-0">
                {/* Mobile Back Button */}
                <div className="flex items-center justify-between pb-2 border-b border-slate-100 lg:hidden">
                  <button
                    onClick={() => setSelectedPlanId(null)}
                    className="inline-flex items-center gap-1 text-xs font-semibold text-[#FF5B00] hover:underline"
                  >
                    <ChevronLeft className="h-4 w-4" /> Back to Plans List
                  </button>
                  <span className="font-mono font-bold text-xs text-slate-600">{selectedPlan.code}</span>
                </div>

                {/* Detail Header with Asset Photograph */}
                <div className="flex items-start gap-3.5 min-w-0 pb-3 border-b border-slate-100">
                  <AssetThumbnail
                    assetId={selectedPlan.asset?.id ?? selectedPlan.assetId}
                    imageUrl={selectedPlan.asset?.imageUrl}
                    assetName={selectedPlan.asset?.name ?? 'Equipment Asset'}
                    size="lg"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono font-extrabold text-xs text-[#FF5B00]">{selectedPlan.code}</span>
                      {selectedPlan.isOverdue ? (
                        <span className="inline-flex items-center gap-1 rounded bg-rose-50 px-2 py-0.5 text-[10px] font-bold text-rose-700 border border-rose-200">
                          Overdue
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700 border border-emerald-200">
                          Active
                        </span>
                      )}
                    </div>
                    <h2 className="mt-1 text-base font-bold text-[#0B1336] leading-snug break-words" title={selectedPlan.name}>
                      {selectedPlan.name}
                    </h2>
                    <p className="mt-0.5 text-xs font-medium text-slate-600 truncate" title={selectedPlan.asset?.name}>
                      {selectedPlan.asset?.name ?? 'Equipment'} <span className="font-mono text-[#FF5B00]">({selectedPlan.asset?.assetTag ?? 'AST'})</span>
                    </p>
                  </div>
                  <button
                    onClick={() => setSelectedPlanId(null)}
                    className="hidden lg:flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-slate-200 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-colors"
                    title="Close Detail Panel"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>

                {/* Quick Metadata Ribbon */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 rounded-lg border border-slate-200 bg-slate-50 p-2.5 text-xs min-w-0">
                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">Frequency</span>
                    <span className="mt-0.5 font-bold text-slate-800 block truncate">{selectedPlan.frequency}</span>
                  </div>
                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">Next Due</span>
                    <span className="mt-0.5 font-mono font-bold text-slate-800 block truncate">{new Date(selectedPlan.nextDue).toLocaleDateString()}</span>
                  </div>
                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">Est. Hours</span>
                    <span className="mt-0.5 font-mono font-bold text-slate-800 block truncate">{selectedPlan.estimatedHours} hrs</span>
                  </div>
                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">Compliance</span>
                    <span className="mt-0.5 font-mono font-bold text-emerald-700 block truncate">{selectedPlan.compliancePercent}%</span>
                  </div>
                </div>

                {/* Detail Tabs */}
                <div className="overflow-x-auto scrollbar-none min-w-0">
                  <nav className="flex gap-4 text-xs font-semibold whitespace-nowrap min-w-full">
                    {[
                      { key: 'overview', label: 'Overview & Resources' },
                      { key: 'checklist', label: `Checklist (${selectedPlan.checklist?.length ?? 0})` },
                      { key: 'history', label: 'Work Order History' },
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
                {/* Tab 1: Overview */}
                {detailTab === 'overview' && (
                  <div className="space-y-4 text-xs min-w-0">
                    {/* Assignment & Branch Context */}
                    <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-3 shadow-2xs min-w-0">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1">
                        <User className="h-3.5 w-3.5 text-purple-600 shrink-0" /> Assignment & Location
                      </span>
                      <dl className="grid grid-cols-2 gap-3 text-slate-700">
                        <div>
                          <dt className="text-[10px] text-slate-400">Assigned Team</dt>
                          <dd className="font-semibold truncate" title={selectedPlan.assignedTeam}>{selectedPlan.assignedTeam ?? 'General Team'}</dd>
                        </div>
                        <div>
                          <dt className="text-[10px] text-slate-400">Operating Branch</dt>
                          <dd className="font-semibold truncate" title={selectedPlan.branch?.name}>{selectedPlan.branch?.name ?? 'HQ'}</dd>
                        </div>
                        <div>
                          <dt className="text-[10px] text-slate-400">Trigger Type</dt>
                          <dd className="font-semibold">{selectedPlan.triggerType}</dd>
                        </div>
                        <div>
                          <dt className="text-[10px] text-slate-400">Last Completed</dt>
                          <dd className="font-mono font-semibold">{selectedPlan.lastCompleted ? new Date(selectedPlan.lastCompleted).toLocaleDateString() : 'Never'}</dd>
                        </div>
                      </dl>
                    </div>

                    {selectedPlan.description && (
                      <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-1.5 shadow-2xs min-w-0">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Description & Scope</span>
                        <p className="text-slate-700 leading-relaxed whitespace-pre-line">{selectedPlan.description}</p>
                      </div>
                    )}
                  </div>
                )}

                {/* Tab 2: Checklist */}
                {detailTab === 'checklist' && (
                  <div className="space-y-3 text-xs min-w-0">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Mandatory Service Task Checklist</span>
                    {!selectedPlan.checklist || selectedPlan.checklist.length === 0 ? (
                      <p className="text-slate-400 italic py-4 text-center">No checklist items defined for this maintenance plan.</p>
                    ) : (
                      <div className="space-y-2 min-w-0">
                        {selectedPlan.checklist.map((item: any) => (
                          <div key={item.id} className="rounded-lg border border-slate-200 bg-slate-50 p-3 space-y-1 min-w-0">
                            <div className="flex items-start justify-between gap-2">
                              <span className="font-semibold text-slate-800 break-words flex-1">{item.description}</span>
                              {item.mandatory && <span className="text-[9px] font-bold text-rose-600 uppercase shrink-0">Required</span>}
                            </div>
                            <div className="text-[11px] text-slate-500 italic">Pass Criteria: {item.passCriteria}</div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Tab 3: History */}
                {detailTab === 'history' && (
                  <div className="space-y-3 text-xs min-w-0">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Generated Work Order History</span>
                    <p className="text-slate-400 italic py-4 text-center">No generated work orders linked to this persistent plan yet.</p>
                  </div>
                )}
              </div>

              {/* Sticky Footer Actions */}
              <div className="shrink-0 bg-white border-t border-slate-200 px-5 py-3.5 flex flex-wrap items-center justify-between gap-2 z-10 min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    onClick={() => alert(`Generating work order for plan ${selectedPlan.code}...`)}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-[#FF5B00] px-3.5 py-2 text-xs font-bold text-white shadow-xs hover:bg-[#F95700] transition-colors"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Generate Work Order
                  </button>

                  <button
                    onClick={() => handleToggleStatus(selectedPlan.id)}
                    className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-semibold transition-colors ${
                      selectedPlan.status === 'ACTIVE'
                        ? 'border-amber-200 bg-amber-50 text-amber-800 hover:bg-amber-100'
                        : 'border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100'
                    }`}
                  >
                    {selectedPlan.status === 'ACTIVE' ? <PauseCircle className="h-3.5 w-3.5" /> : <PlayCircle className="h-3.5 w-3.5" />}
                    {selectedPlan.status === 'ACTIVE' ? 'Pause Plan' : 'Resume Plan'}
                  </button>
                </div>

                {selectedPlan.asset ? (
                  <Link
                    href={`/dashboard/assets/${selectedPlan.asset.id}`}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs font-bold text-slate-700 shadow-xs hover:bg-slate-50 transition-colors"
                  >
                    <ExternalLink className="h-3.5 w-3.5 text-[#FF5B00]" />
                    View Asset
                  </Link>
                ) : (
                  <span className="text-[11px] text-slate-400 italic">Asset record unlinked</span>
                )}
              </div>

            </div>
          ) : (
            <div className="rounded-xl border border-slate-200 bg-white p-12 text-center shadow-xs space-y-3 sticky top-6">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-orange-50 text-[#FF5B00]">
                <CalendarCheck2 className="h-6 w-6" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-800">Select a maintenance plan to view its details.</h3>
                <p className="mt-1 text-xs text-slate-500">
                  Click any permanent preventive maintenance plan in the list to review schedules, checklists, required parts, and generated work order history side by side.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* NEW MAINTENANCE PLAN MODAL WIZARD */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 backdrop-blur-xs p-4">
          <div className="relative w-full max-w-xl rounded-2xl border border-slate-200 bg-white shadow-2xl overflow-hidden">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-6 py-4">
              <div className="flex items-center gap-2.5">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-orange-100 text-[#FF5B00]">
                  <CalendarCheck2 className="h-4 w-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-[#0B1336]">New Maintenance Plan</h3>
                  <p className="text-xs text-slate-500">Configure permanent recurring maintenance schedule in PostgreSQL.</p>
                </div>
              </div>
              <button
                onClick={() => setIsModalOpen(false)}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-200 hover:text-slate-700 transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Modal Form */}
            <form onSubmit={handleCreatePlan} className="p-6 space-y-4 max-h-[calc(100vh-12rem)] overflow-y-auto">
              {formError && (
                <div role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700">
                  <span className="font-bold">Error:</span> {formError}
                </div>
              )}

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700">Plan Name *</label>
                <input
                  type="text"
                  required
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="e.g., Semi-Annual Electrical Switchgear Thermal Inspection"
                  className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-xs text-slate-800 focus:border-[#FF5B00] focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-700">Select Equipment Asset *</label>
                  <select
                    required
                    value={formAssetId}
                    onChange={(e) => setFormAssetId(e.target.value)}
                    className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-xs text-slate-800 focus:border-[#FF5B00] focus:outline-none"
                  >
                    <option value="">-- Choose Equipment Asset --</option>
                    {assets.map((ast) => (
                      <option key={ast.id} value={ast.id}>
                        {ast.name} ({ast.assetTag})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-700">Trigger Type</label>
                  <select
                    value={formTriggerType}
                    onChange={(e) => setFormTriggerType(e.target.value as any)}
                    className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-xs text-slate-800 focus:border-[#FF5B00] focus:outline-none"
                  >
                    <option value="TIME">Time-based Schedule</option>
                    <option value="METER">Meter Run-Hours Trigger</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-700">Frequency / Interval *</label>
                  <input
                    type="text"
                    required
                    value={formFrequency}
                    onChange={(e) => setFormFrequency(e.target.value)}
                    placeholder="e.g., Every 3 Months"
                    className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-xs text-slate-800 focus:border-[#FF5B00] focus:outline-none"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-700">Next Due Date *</label>
                  <input
                    type="date"
                    required
                    value={formNextDue}
                    onChange={(e) => setFormNextDue(e.target.value)}
                    className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-xs text-slate-800 focus:border-[#FF5B00] focus:outline-none font-mono"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-700">Estimated Hours</label>
                  <input
                    type="number"
                    step="0.5"
                    min="0.5"
                    value={formEstimatedHours}
                    onChange={(e) => setFormEstimatedHours(e.target.value)}
                    className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-xs text-slate-800 focus:border-[#FF5B00] focus:outline-none font-mono"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700">Assigned Team</label>
                <input
                  type="text"
                  value={formAssignedTeam}
                  onChange={(e) => setFormAssignedTeam(e.target.value)}
                  placeholder="e.g., Electrical Specialist Group"
                  className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-xs text-slate-800 focus:border-[#FF5B00] focus:outline-none"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700">Initial Service Task / Scope Description</label>
                <textarea
                  rows={3}
                  value={formDescription}
                  onChange={(e) => setFormDescription(e.target.value)}
                  placeholder="Describe mandatory inspection points, safety protocols, and pass criteria..."
                  className="w-full rounded-lg border border-slate-200 bg-white p-3 text-xs text-slate-800 focus:border-[#FF5B00] focus:outline-none"
                />
              </div>

              {/* Modal Footer */}
              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={formLoading}
                  className="inline-flex items-center gap-2 rounded-lg bg-[#FF5B00] px-5 py-2 text-xs font-bold text-white shadow-xs hover:bg-[#F95700] transition-colors disabled:opacity-50"
                >
                  {formLoading ? 'Saving to PostgreSQL…' : 'Save Permanent Plan'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
