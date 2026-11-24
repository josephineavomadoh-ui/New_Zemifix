'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Activity,
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  CalendarClock,
  CheckCircle2,
  ClipboardCheck,
  ClipboardList,
  Clock,
  Gauge,
  RefreshCw,
  ShieldCheck,
  Users,
  Wrench,
  UserCheck,
  TrendingDown,
  FileWarning,
  Building2,
  Clock3,
  ShieldAlert,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useAuth } from '@/src/lib/auth-context';
import { KpiCard } from './KpiCard';
import type { ManagerDashboardMetrics } from '@/src/lib/services/managerDashboardService';

// ─── Shared primitives ───────────────────────────────────────────────────────

function Panel({
  children,
  className = '',
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`min-w-0 rounded-xl border border-slate-200 bg-white shadow-xs ${className}`}
    >
      {children}
    </section>
  );
}

function PanelHeader({
  title,
  detail,
  href,
  linkLabel,
}: {
  title: string;
  detail?: string;
  href?: string;
  linkLabel?: string;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 px-5 py-4">
      <div>
        <h2 className="text-sm font-bold text-[#0B1336]">{title}</h2>
        {detail && (
          <p className="mt-0.5 text-xs text-slate-500">{detail}</p>
        )}
      </div>
      {href && linkLabel && (
        <Link
          href={href}
          className="inline-flex items-center gap-1 text-xs font-semibold text-[#FF5B00] hover:text-[#E65200]"
        >
          {linkLabel}
          <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      )}
    </div>
  );
}

function PriorityPill({ priority }: { priority: string }) {
  const p = priority.toUpperCase();
  const cls =
    p === 'CRITICAL'
      ? 'bg-rose-100 text-rose-700'
      : p === 'URGENT'
        ? 'bg-orange-100 text-orange-700'
        : p === 'HIGH'
          ? 'bg-amber-100 text-amber-800'
          : p === 'NORMAL' || p === 'MEDIUM'
            ? 'bg-blue-50 text-blue-700'
            : 'bg-slate-100 text-slate-600';
  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold ${cls}`}>
      {p.replace('_', ' ')}
    </span>
  );
}

function StatusPill({ status }: { status: string }) {
  const s = status.toUpperCase();
  const cls =
    s === 'COMPLETED'
      ? 'bg-emerald-50 text-emerald-700'
      : s === 'IN_PROGRESS'
        ? 'bg-blue-50 text-blue-700'
        : s === 'ASSIGNED'
          ? 'bg-indigo-50 text-indigo-700'
          : s === 'ON_HOLD'
            ? 'bg-amber-50 text-amber-800'
            : s === 'OPEN'
              ? 'bg-slate-100 text-slate-700'
              : 'bg-slate-100 text-slate-600';
  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium ${cls}`}>
      {s.replaceAll('_', ' ').toLowerCase().replace(/^\w/, (c) => c.toUpperCase())}
    </span>
  );
}

function HBar({
  items,
}: {
  items: { label: string; value: number; color: string }[];
}) {
  const max = Math.max(...items.map((i) => i.value), 1);
  return (
    <div className="space-y-3">
      {items.map((item) => (
        <div key={item.label}>
          <div className="mb-1 flex items-center justify-between gap-2 text-xs">
            <span className="text-slate-600">{item.label}</span>
            <span className="font-semibold tabular-nums text-[#0B1336]">{item.value}</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-slate-100">
            <div
              className={`h-full rounded-full transition-all duration-300 ${item.color}`}
              style={{ width: `${item.value ? Math.max((item.value / max) * 100, 3) : 0}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Skeleton ────────────────────────────────────────────────────────────────

function DashboardSkeleton() {
  return (
    <div className="space-y-5 pb-8 animate-pulse">
      <div className="h-32 rounded-xl bg-slate-200" />
      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-40 rounded-xl border border-slate-200 bg-white p-5 space-y-3">
            <div className="flex justify-between">
              <div className="h-3 w-24 rounded bg-slate-100" />
              <div className="h-8 w-8 rounded-lg bg-slate-100" />
            </div>
            <div className="h-7 w-16 rounded bg-slate-100" />
            <div className="h-2 w-full rounded bg-slate-100" />
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Approval badge ──────────────────────────────────────────────────────────

function ApprovalRow({
  item,
}: {
  item: ManagerDashboardMetrics['pendingApprovals'][number];
}) {
  return (
    <div className="flex items-start gap-3 border-b border-slate-50 px-5 py-3.5 last:border-b-0 hover:bg-slate-50/60 transition-colors">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-amber-50 text-amber-600">
        <ClipboardCheck className="h-4 w-4" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-semibold text-[#0B1336] capitalize">{item.entityType}</p>
        <p className="mt-0.5 text-[11px] text-slate-500">
          Submitted by {item.makerName} · Step {item.currentStepOrder}/{item.totalSteps}:{' '}
          <span className="font-medium text-slate-700">{item.stepName}</span>
        </p>
      </div>
      <div className="shrink-0 text-right">
        <p className="text-xs font-semibold text-[#0B1336]">
          {new Date(item.createdAt).toLocaleDateString('en-GH', { timeZone: 'Africa/Accra' })}
        </p>
        <p className="mt-0.5 text-[10px] text-slate-500">Amount: GHS {item.requestAmount}</p>
      </div>
    </div>
  );
}

// ─── Alert row ───────────────────────────────────────────────────────────────

type Alert = ManagerDashboardMetrics['operationalAlerts'][number];

const alertConfig: Record<
  Alert['type'],
  { icon: LucideIcon; label: string; iconCls: string }
> = {
  overdue: { icon: TrendingDown, label: 'Overdue', iconCls: 'bg-rose-50 text-rose-600' },
  critical: { icon: AlertCircle, label: 'Critical', iconCls: 'bg-rose-50 text-rose-600' },
  unassigned: { icon: UserCheck, label: 'Unassigned', iconCls: 'bg-amber-50 text-amber-600' },
  pending_request: { icon: FileWarning, label: 'Pending request', iconCls: 'bg-blue-50 text-blue-600' },
};

function AlertRow({ alert }: { alert: Alert }) {
  const cfg = alertConfig[alert.type];
  const IconComp = cfg.icon;
  return (
    <Link
      href={alert.href}
      className="flex items-start gap-3 border-b border-slate-50 px-5 py-3.5 last:border-b-0 hover:bg-slate-50/60 transition-colors"
    >
      <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${cfg.iconCls}`}>
        <IconComp className="h-4 w-4" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <p className="text-xs font-semibold text-[#0B1336]">{alert.workOrderNumber}</p>
          <PriorityPill priority={alert.priority} />
          <StatusPill status={alert.status} />
        </div>
        <p className="mt-0.5 max-w-72 truncate text-[11px] text-slate-600">{alert.title}</p>
        {alert.assetName && (
          <p className="mt-0.5 text-[10px] text-slate-400">
            {alert.assetName}
            {alert.locationName ? ` · ${alert.locationName}` : ''}
          </p>
        )}
      </div>
      <div className="shrink-0">
        <span className="text-[10px] font-medium text-slate-500">{cfg.label}</span>
      </div>
    </Link>
  );
}

// ─── Technician workload row ──────────────────────────────────────────────────

function TechRow({
  tech,
}: {
  tech: ManagerDashboardMetrics['technicianWorkload'][number];
}) {
  const total = tech.assignedCount;
  const inProgPct = total > 0 ? (tech.inProgressCount / total) * 100 : 0;
  const donePct = total > 0 ? (tech.completedCount / total) * 100 : 0;

  return (
    <div className="border-b border-slate-50 px-5 py-4 last:border-b-0">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-xs font-semibold text-[#0B1336]">{tech.name}</p>
          <p className="mt-0.5 text-[11px] text-slate-500">
            {tech.assignedCount} assigned · {tech.inProgressCount} in progress
            {tech.overdueCount > 0 && (
              <span className="ml-1.5 font-semibold text-rose-600">· {tech.overdueCount} overdue</span>
            )}
          </p>
        </div>
        <span className="text-xs font-semibold text-[#0B1336] tabular-nums">
          {tech.completedCount} done
        </span>
      </div>
      {total > 0 && (
        <div className="mt-2 flex h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
          <div className="h-full bg-blue-500 transition-all" style={{ width: `${inProgPct}%` }} />
          <div className="h-full bg-emerald-500 transition-all" style={{ width: `${donePct}%` }} />
        </div>
      )}
    </div>
  );
}

// ─── Main view ───────────────────────────────────────────────────────────────

export const ManagerDashboardView: React.FC = () => {
  const { user, selectedBranch } = useAuth();
  const [metrics, setMetrics] = useState<ManagerDashboardMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchMetrics = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/dashboard/manager-stats');
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.message || data?.error || `Could not load metrics (HTTP ${res.status}).`);
      }
      setMetrics(data as ManagerDashboardMetrics);
      setError(null);
    } catch (err) {
      setMetrics(null);
      setError(err instanceof Error ? err.message : 'Metrics could not be loaded.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchMetrics();
  }, [fetchMetrics]);

  const firstName = user?.name?.trim().split(/\s+/)[0] ?? 'there';
  const roleName = user?.role?.name ?? 'Manager';

  const today = new Intl.DateTimeFormat('en-GH', {
    timeZone: 'Africa/Accra',
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date());

  if (loading && !metrics) return <DashboardSkeleton />;

  const wo = metrics?.workOrders;
  const activeCount = wo ? wo.open + wo.assigned + wo.inProgress + wo.onHold : 0;
  const overduePct = activeCount > 0 && wo ? Math.round((wo.overdue / activeCount) * 100) : 0;

  const statusBarItems = wo
    ? [
        { label: 'Open', value: wo.open, color: 'bg-[#FF5B00]' },
        { label: 'Assigned', value: wo.assigned, color: 'bg-[#0B1336]' },
        { label: 'In progress', value: wo.inProgress, color: 'bg-blue-500' },
        { label: 'On hold', value: wo.onHold, color: 'bg-amber-500' },
        { label: 'Completed', value: wo.completed, color: 'bg-emerald-500' },
      ]
    : [];

  const backlog = metrics?.backlogAgeing ?? { days0_7: 0, days8_14: 0, days15_30: 0, days31_60: 0, over60: 0 };
  const totalBacklog = backlog.days0_7 + backlog.days8_14 + backlog.days15_30 + backlog.days31_60 + backlog.over60 || 1;

  const backlogItems = [
    { label: '0–7 days', value: backlog.days0_7, color: 'bg-emerald-500' },
    { label: '8–14 days', value: backlog.days8_14, color: 'bg-blue-500' },
    { label: '15–30 days', value: backlog.days15_30, color: 'bg-amber-500' },
    { label: '31–60 days', value: backlog.days31_60, color: 'bg-orange-500' },
    { label: 'Over 60 days (Critical)', value: backlog.over60, color: 'bg-rose-600' },
  ];

  return (
    <div className="min-w-0 space-y-6 pb-12">
      {/* ── Hero header ──────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden rounded-xl bg-[#080E29] px-6 py-6 text-white sm:px-8 sm:py-7 shadow-sm">
        <div className="pointer-events-none absolute -right-10 -top-20 h-56 w-56 rounded-full border border-white/10" />
        <div className="relative flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0">
            <div className="mb-2 inline-flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-[#FF5B00]">
              <Activity className="h-4 w-4" />
              {`${roleName} operational workspace`}
            </div>
            <h1 className="text-2xl font-bold tracking-tight sm:text-3xl text-white">
              Welcome back, {firstName}
            </h1>
            <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-xs text-slate-300">
              <span className="inline-flex items-center gap-1.5">
                <CalendarClock className="h-3.5 w-3.5 text-[#FF5B00]" />
                {today}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Building2 className="h-3.5 w-3.5 text-[#FF5B00]" />
                {selectedBranch}
              </span>
              {user?.accessScope && (
                <span className="inline-flex items-center gap-1.5">
                  <ShieldCheck className="h-3.5 w-3.5 text-[#FF5B00]" />
                  {user.accessScope} scope
                </span>
              )}
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <Link
              href="/work-orders"
              className="inline-flex min-h-9 items-center gap-2 rounded-lg bg-[#FF5B00] px-4 py-2 text-xs font-bold text-white transition hover:bg-[#E65200] shadow-sm"
            >
              <ClipboardList className="h-4 w-4" />
              Work Orders
            </Link>
            <Link
              href="/requests"
              className="inline-flex min-h-9 items-center gap-2 rounded-lg border border-white/20 px-3.5 py-2 text-xs font-semibold text-white transition hover:bg-white/10"
            >
              <FileWarning className="h-4 w-4" />
              Requests
            </Link>
            <Link
              href="/preventive"
              className="inline-flex min-h-9 items-center gap-2 rounded-lg border border-white/20 px-3.5 py-2 text-xs font-semibold text-white transition hover:bg-white/10"
            >
              <CalendarClock className="h-4 w-4" />
              PM Plans
            </Link>
          </div>
        </div>

        {wo && (
          <div className="mt-5 flex flex-wrap gap-2 border-t border-white/10 pt-4">
            {[
              { label: 'Active', value: activeCount, cls: 'bg-white/10 text-white' },
              { label: 'Overdue', value: wo.overdue, cls: wo.overdue > 0 ? 'bg-rose-500/20 text-rose-200' : 'bg-white/10 text-white' },
              { label: 'Unassigned', value: wo.unassigned, cls: wo.unassigned > 0 ? 'bg-amber-500/20 text-amber-200' : 'bg-white/10 text-white' },
              { label: 'Critical', value: wo.criticalOpen, cls: wo.criticalOpen > 0 ? 'bg-rose-500/20 text-rose-200' : 'bg-white/10 text-white' },
              { label: 'Pending Requests', value: wo.pendingRequests, cls: wo.pendingRequests > 0 ? 'bg-blue-500/20 text-blue-200' : 'bg-white/10 text-white' },
            ].map(({ label, value, cls }) => (
              <span key={label} className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-semibold ${cls}`}>
                <span className="tabular-nums">{value}</span>
                <span className="font-normal opacity-80">{label}</span>
              </span>
            ))}
          </div>
        )}
      </section>

      {/* ── Error banner ─────────────────────────────────────────────────── */}
      {error && (
        <div
          role="alert"
          className="flex flex-wrap items-center gap-3 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900 shadow-xs"
        >
          <AlertTriangle className="h-4 w-4 shrink-0 text-rose-600" />
          <div className="min-w-0 flex-1">
            <p className="font-semibold">Metrics unavailable</p>
            <p className="mt-1 text-xs text-rose-800">{error}</p>
          </div>
          <button
            type="button"
            onClick={() => void fetchMetrics()}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-lg border border-rose-200 bg-white px-3.5 py-2 text-xs font-semibold hover:bg-rose-100 disabled:opacity-60 shadow-xs"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            Retry
          </button>
        </div>
      )}

      {/* ── KPI row ──────────────────────────────────────────────────────── */}
      {wo && (
        <section aria-label="Operational KPIs" className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <KpiCard
            category="EXECUTION PIPELINE"
            title="Active Work Orders"
            href="/work-orders"
            icon={ClipboardList}
            tone="navy"
            value={activeCount}
            badgeText={`${wo.total} total`}
            subDetail={`${wo.open} Open · ${wo.inProgress} In progress · ${wo.onHold} On hold`}
            progressBar={{
              type: 'segmented',
              segments: [
                { label: 'Open', count: wo.open, value: activeCount > 0 ? (wo.open / activeCount) * 100 : 0, color: 'bg-[#FF5B00]' },
                { label: 'In-Prog', count: wo.inProgress, value: activeCount > 0 ? (wo.inProgress / activeCount) * 100 : 0, color: 'bg-blue-500' },
                { label: 'On Hold', count: wo.onHold, value: activeCount > 0 ? (wo.onHold / activeCount) * 100 : 0, color: 'bg-amber-500' },
              ],
            }}
            footerText={`${wo.completed} completed`}
            footerTrend="up"
          />

          <KpiCard
            category="COMPLIANCE"
            title="Overdue Work Orders"
            href="/work-orders"
            icon={AlertCircle}
            tone={wo.overdue > 0 ? 'rose' : 'emerald'}
            value={wo.overdue}
            badgeText={`${overduePct}% of active`}
            subDetail="Past planned completion date"
            progressBar={{
              type: 'single',
              value: overduePct,
              color: wo.overdue > 0 ? 'bg-rose-500' : 'bg-emerald-500',
            }}
            footerText={wo.overdue > 0 ? 'Requires dispatch & resolution' : 'All orders on schedule'}
            footerTrend={wo.overdue > 0 ? 'down' : 'check'}
          />

          <KpiCard
            category="TRIAGE"
            title="Pending Service Requests"
            href="/requests"
            icon={Activity}
            tone={wo.pendingRequests > 0 ? 'amber' : 'navy'}
            value={wo.pendingRequests}
            badgeText="Awaiting review"
            subDetail={wo.pendingRequests > 0 ? `${wo.pendingRequests} request(s) needing triage` : 'No pending requests'}
            progressBar={{
              type: 'single',
              value: wo.pendingRequests > 0 ? Math.min(wo.pendingRequests * 20, 100) : 0,
              color: wo.pendingRequests > 0 ? 'bg-amber-500' : 'bg-slate-200',
            }}
            footerText="Service request queue"
            footerTrend={wo.pendingRequests > 0 ? 'up' : 'check'}
          />

          <KpiCard
            category="CRITICAL OPERATIONS"
            title="Critical / Urgent Open"
            href="/work-orders"
            icon={AlertTriangle}
            tone={wo.criticalOpen > 0 ? 'rose' : 'emerald'}
            value={wo.criticalOpen}
            badgeText="Critical or Urgent priority"
            subDetail="Open WOs requiring immediate attention"
            progressBar={{
              type: 'single',
              value: wo.criticalOpen > 0 ? Math.min(wo.criticalOpen * 15, 100) : 0,
              color: wo.criticalOpen > 0 ? 'bg-rose-500' : 'bg-emerald-500',
            }}
            footerText={wo.criticalOpen > 0 ? 'Escalate immediately' : 'No critical work orders open'}
            footerTrend={wo.criticalOpen > 0 ? 'down' : 'check'}
          />

          <KpiCard
            category="ASSIGNMENT GAP"
            title="Unassigned Work Orders"
            href="/work-orders"
            icon={UserCheck}
            tone={wo.unassigned > 0 ? 'amber' : 'emerald'}
            value={wo.unassigned}
            badgeText="Open, no technician assigned"
            subDetail="Requires dispatch assignment"
            progressBar={{
              type: 'single',
              value: wo.unassigned > 0 ? Math.min(wo.unassigned * 20, 100) : 0,
              color: wo.unassigned > 0 ? 'bg-amber-500' : 'bg-emerald-500',
            }}
            footerText={wo.unassigned > 0 ? 'Assign technician to proceed' : 'All open orders assigned'}
            footerTrend={wo.unassigned > 0 ? 'down' : 'check'}
          />

          <KpiCard
            category="PREVENTIVE MAINTENANCE"
            title="PM Plans Active"
            href="/preventive"
            icon={CalendarClock}
            tone={
              metrics?.maintenancePlans.overdueCount ?? 0 > 0
                ? 'rose'
                : metrics?.maintenancePlans.dueSoonCount ?? 0 > 0
                  ? 'amber'
                  : 'emerald'
            }
            value={metrics?.maintenancePlans.active ?? 0}
            badgeText={`${metrics?.maintenancePlans.total ?? 0} total plans`}
            subDetail={`${metrics?.maintenancePlans.overdueCount ?? 0} overdue · ${metrics?.maintenancePlans.dueSoonCount ?? 0} due within 7 days`}
            progressBar={{
              type: 'single',
              value:
                metrics?.maintenancePlans.total ?? 0 > 0
                  ? Math.round(((metrics?.maintenancePlans.active ?? 0) / (metrics?.maintenancePlans.total ?? 1)) * 100)
                  : 0,
              color: 'bg-[#0B1336]',
            }}
            footerText="Open maintenance schedule"
            footerTrend="check"
          />
        </section>
      )}

      {/* ── Main content grid ─────────────────────────────────────────────── */}
      {metrics && (
        <div className="grid min-w-0 grid-cols-1 gap-6 xl:grid-cols-5">
          {/* Left column: Alerts + Approvals + Backlog Ageing */}
          <div className="min-w-0 space-y-6 xl:col-span-3">
            {/* Operational alerts */}
            <Panel>
              <PanelHeader
                title="Operational Alerts"
                detail={`${metrics.operationalAlerts.length} issue(s) requiring attention`}
                href="/work-orders"
                linkLabel="View all work orders"
              />
              {metrics.operationalAlerts.length > 0 ? (
                <div>
                  {metrics.operationalAlerts.map((alert) => (
                    <AlertRow key={alert.id} alert={alert} />
                  ))}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center px-6 py-12 text-center">
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-50 text-emerald-600 mb-2">
                    <CheckCircle2 className="h-6 w-6" />
                  </div>
                  <p className="text-sm font-bold text-[#0B1336]">No Operational Alerts</p>
                  <p className="mt-1 text-xs text-slate-500">All work orders within your scope are on schedule.</p>
                </div>
              )}
            </Panel>

            {/* Backlog Ageing Analysis */}
            <Panel>
              <PanelHeader
                title="Backlog Ageing Analysis"
                detail="Duration of unresolved work orders"
              />
              <div className="p-6">
                <HBar
                  items={[
                    { label: '0–7 days', value: backlog.days0_7, color: 'bg-emerald-500' },
                    { label: '8–14 days', value: backlog.days8_14, color: 'bg-blue-500' },
                    { label: '15–30 days', value: backlog.days15_30, color: 'bg-amber-500' },
                    { label: '31–60 days', value: backlog.days31_60, color: 'bg-orange-500' },
                    { label: 'Over 60 days (Critical)', value: backlog.over60, color: 'bg-rose-600' },
                  ]}
                />
                <p className="mt-4 text-[11px] text-slate-400">
                  Track unresolved work order queues to prevent aging bottlenecks and SLA degradation.
                </p>
              </div>
            </Panel>

            {/* Approvals */}
            <Panel>
              <PanelHeader
                title="Pending Financial & Operational Approvals"
                detail="Approval requests awaiting your review — maker-checker enforced"
              />
              {metrics.pendingApprovals.length > 0 ? (
                <div>
                  {metrics.pendingApprovals.map((item) => (
                    <ApprovalRow key={item.id} item={item} />
                  ))}
                  <div className="border-t border-slate-100 px-5 py-3 bg-slate-50/50">
                    <p className="text-[11px] text-slate-500">
                      ⓘ Approval authority and maker-checker validation are enforced by the backend.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center px-6 py-12 text-center">
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-400 mb-2">
                    <ClipboardCheck className="h-6 w-6" />
                  </div>
                  <p className="text-sm font-bold text-[#0B1336]">No Pending Approvals</p>
                  <p className="mt-1 text-xs text-slate-500">No approval requests are currently awaiting your action.</p>
                </div>
              )}
            </Panel>
          </div>

          {/* Right column: Status chart + SLA Performance + Technician workload + Asset + Recent Activity */}
          <div className="min-w-0 space-y-6 xl:col-span-2">
            {/* SLA Performance */}
            <Panel>
              <PanelHeader title="SLA Compliance Performance" />
              <div className="p-6">
                <div className="flex items-center gap-5">
                  <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full border-[5px] border-emerald-100 bg-emerald-50 text-sm font-bold text-emerald-800">
                    {metrics.slaMetrics.complianceRate}%
                  </div>
                  <div className="min-w-0 space-y-1 text-xs">
                    <p className="flex justify-between gap-4 text-slate-600">
                      <span>Tracked Work Orders</span>
                      <strong className="text-[#0B1336]">{metrics.slaMetrics.totalTracked}</strong>
                    </p>
                    <p className="flex justify-between gap-4 text-slate-600">
                      <span>Active SLA Breaches</span>
                      <strong className={metrics.slaMetrics.activeBreaches > 0 ? 'text-rose-600 font-bold' : 'text-emerald-600'}>
                        {metrics.slaMetrics.activeBreaches}
                      </strong>
                    </p>
                  </div>
                </div>
              </div>
            </Panel>

            {/* Work order status distribution */}
            {wo && (
              <Panel>
                <PanelHeader
                  title="Work Order Status Distribution"
                  detail={`${activeCount} active work orders`}
                  href="/work-orders"
                  linkLabel="Open Queue"
                />
                <div className="p-6">
                  {activeCount > 0 ? (
                    <HBar items={statusBarItems} />
                  ) : (
                    <div className="rounded-lg bg-slate-50 p-4 text-center text-xs text-slate-500">
                      No active work orders in your access scope.
                    </div>
                  )}
                  <div className="mt-5 grid grid-cols-2 gap-3 border-t border-slate-100 pt-4">
                    <div>
                      <p className="text-[11px] text-slate-400 uppercase font-bold tracking-wider">Completed</p>
                      <p className="mt-1 text-lg font-bold text-[#0B1336] tabular-nums">
                        {wo.completed}
                      </p>
                    </div>
                    <div>
                      <p className="text-[11px] text-slate-400 uppercase font-bold tracking-wider">Total Work Orders</p>
                      <p className="mt-1 text-lg font-bold text-[#0B1336] tabular-nums">
                        {wo.total}
                      </p>
                    </div>
                  </div>
                </div>
              </Panel>
            )}

            {/* Technician workload */}
            <Panel>
              <PanelHeader
                title="Technician Workload Balance"
                detail="Active assignments within scope"
                href="/workers"
                linkLabel="Worker Monitoring"
              />
              {metrics.technicianWorkload.length > 0 ? (
                <div className="max-h-72 overflow-y-auto divide-y divide-slate-50">
                  {metrics.technicianWorkload.map((tech) => (
                    <TechRow key={tech.userId} tech={tech} />
                  ))}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center px-6 py-10 text-center">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-slate-400 mb-2">
                    <Users className="h-5 w-5" />
                  </div>
                  <p className="text-xs font-bold text-slate-700">No Active Assignments</p>
                  <p className="mt-0.5 text-[11px] text-slate-400">No technicians assigned in scope.</p>
                </div>
              )}
            </Panel>

            {/* Asset summary */}
            {metrics.assetSummary.total > 0 && (
              <Panel>
                <PanelHeader title="Asset Condition Overview" href="/assets" linkLabel="View Assets" />
                <div className="p-6">
                  <div className="flex items-center gap-5">
                    <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full border-[5px] border-emerald-100 bg-white text-sm font-bold text-[#0B1336]">
                      {metrics.assetSummary.total > 0
                        ? `${Math.round(((metrics.assetSummary.total - metrics.assetSummary.down) / metrics.assetSummary.total) * 100)}%`
                        : '—'}
                    </div>
                    <div className="min-w-0 space-y-1.5 text-xs flex-1">
                      <p className="flex items-center justify-between text-slate-600">
                        <span>Total Assets</span>
                        <strong className="text-[#0B1336]">{metrics.assetSummary.total}</strong>
                      </p>
                      <p className="flex items-center justify-between text-slate-600">
                        <span>In Maintenance</span>
                        <strong className="text-amber-600">{metrics.assetSummary.inMaintenance}</strong>
                      </p>
                      <p className="flex items-center justify-between text-slate-600">
                        <span>Down / Critical</span>
                        <strong className="text-rose-600">{metrics.assetSummary.down}</strong>
                      </p>
                    </div>
                  </div>
                </div>
              </Panel>
            )}

            {/* Recent Operational Activity */}
            <Panel>
              <PanelHeader title="Recent Operational Activity" />
              <div className="p-6 space-y-3">
                {metrics.recentActivity && metrics.recentActivity.length > 0 ? (
                  metrics.recentActivity.map((act) => (
                    <div key={act.id} className="flex items-start justify-between gap-3 text-xs border-b border-slate-50 pb-2.5 last:border-b-0 last:pb-0">
                      <div>
                        <p className="font-semibold text-[#0B1336]">{act.referenceNumber}: {act.title}</p>
                        <p className="text-slate-500 text-[11px]">{act.description}</p>
                      </div>
                      <span className="text-[10px] text-slate-400 whitespace-nowrap">
                        {new Date(act.timestamp).toLocaleDateString()}
                      </span>
                    </div>
                  ))
                ) : (
                  <p className="text-xs text-slate-400 text-center py-4">No recent activity recorded.</p>
                )}
              </div>
            </Panel>

            {/* Quick links */}
            <Panel>
              <PanelHeader title="Quick Actions & Navigation" />
              <div className="grid grid-cols-2 gap-2.5 p-6">
                {[
                  { href: '/work-orders', icon: ClipboardList, label: 'Work Orders' },
                  { href: '/requests', icon: FileWarning, label: 'Service Requests' },
                  { href: '/preventive', icon: CalendarClock, label: 'PM Plans' },
                  { href: '/assets', icon: Gauge, label: 'Assets' },
                  { href: '/workers', icon: Users, label: 'Workers' },
                  { href: '/reports', icon: Activity, label: 'Reports' },
                ].map(({ href, icon: Icon, label }) => (
                  <Link
                    key={href}
                    href={href}
                    className="flex items-center gap-2.5 rounded-lg border border-slate-200 px-3 py-2.5 text-xs font-semibold text-slate-700 transition hover:border-[#FF5B00]/40 hover:bg-orange-50/50 hover:text-[#FF5B00]"
                  >
                    <Icon className="h-4 w-4 shrink-0 text-slate-400" />
                    {label}
                  </Link>
                ))}
              </div>
            </Panel>
          </div>
        </div>
      )}

      {/* ── Empty state when no data at all ─────────────────────────────── */}
      {!loading && !error && !metrics && (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white p-12 text-center shadow-xs">
          <Wrench className="mx-auto h-8 w-8 text-slate-400 mb-3" />
          <p className="text-sm font-bold text-[#0B1336]">No Operational Data Available</p>
          <p className="mt-1 text-xs text-slate-500 max-w-sm mx-auto">
            Metrics and operational dashboards will appear here once work orders and maintenance records exist in your scope.
          </p>
        </div>
      )}
    </div>
  );
};
