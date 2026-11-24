'use client';

import React, { useEffect, useState, useMemo } from 'react';
import Link from 'next/link';
import { useAuth } from '@/src/lib/auth-context';
import {
  Plus,
  Receipt,
  CircleDollarSign,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  Check,
  Calendar,
  Filter,
  Download,
  RefreshCw,
  Building2,
  Clock,
  ShieldCheck,
  CheckCircle2,
  XCircle,
  Eye,
  Search,
  FileText,
  DollarSign,
} from 'lucide-react';
import { StatCard } from '@/src/components/ui/StatCard';
import { LineChart, DonutChart, HorizontalBars } from '@/src/components/ui/Charts';
import { StatusBadge } from '@/src/components/ui/StatusBadge';
import { Drawer } from '@/src/components/ui/Drawer';
import { Modal, ModalButton, Field, inputClass } from '@/src/components/ui/Modal';
import { formatGhs } from '@/src/lib/demo/common';

const INV_STYLE: Record<string, string> = {
  DRAFT: 'bg-slate-50 text-slate-600 border-slate-200',
  PENDING_APPROVAL: 'bg-amber-50 text-amber-700 border-amber-200',
  APPROVED: 'bg-blue-50 text-blue-700 border-blue-200',
  SENT: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  PARTIALLY_PAID: 'bg-amber-50 text-amber-700 border-amber-200',
  PAID: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  OVERDUE: 'bg-rose-50 text-rose-700 border-rose-200',
  CANCELLED: 'bg-slate-100 text-slate-400 border-slate-200',
};

export const FinanceDashboardView: React.FC = () => {
  const { user, loading: authLoading } = useAuth();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Filters & States
  const [dateRange, setDateRange] = useState<string>('this_month');
  const [selectedBranch, setSelectedBranch] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  // Modals & Drawers
  const [selectedInvoice, setSelectedInvoice] = useState<any>(null);
  const [newInvoiceOpen, setNewInvoiceOpen] = useState<boolean>(false);
  const [paymentModalOpen, setPaymentModalOpen] = useState<boolean>(false);
  const [paymentAmount, setPaymentAmount] = useState<string>('1000');
  const [submitting, setSubmitting] = useState<boolean>(false);

  // New Invoice Form state
  const [custName, setCustName] = useState<string>('Acme Corp Facility');
  const [itemDesc, setItemDesc] = useState<string>('Monthly Maintenance Service & Repairs');
  const [itemPrice, setItemPrice] = useState<string>('2500');
  const [dueDate, setDueDate] = useState<string>('2026-12-31');

  const fetchFinanceData = async (isBackground = false) => {
    if (isBackground) setRefreshing(true);
    else setLoading(true);
    setError(null);

    try {
      const resp = await fetch('/api/dashboard/finance/kpis');
      if (!resp.ok) throw new Error('Failed to load financial operations data');
      const json = await resp.json();
      setData(json);
    } catch (e: any) {
      console.error(e);
      setError(e.message || 'Failed to load financial records');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    if (!authLoading && user) {
      fetchFinanceData();
    }
  }, [authLoading, user]);

  const handleCreateInvoice = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const resp = await fetch('/api/finance/invoices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerId: user?.branch?.id ?? 'cust-default',
          dueDate,
          items: [{ description: itemDesc, quantity: 1, unitPrice: parseFloat(itemPrice) }],
        }),
      });
      if (resp.ok) {
        setNewInvoiceOpen(false);
        fetchFinanceData(true);
      } else {
        const errData = await resp.json();
        alert(errData.error || 'Failed to create invoice');
      }
    } catch (err) {
      console.error(err);
    } finally {
      setSubmitting(false);
    }
  };

  const handleApproveInvoice = async (id: string) => {
    try {
      const resp = await fetch(`/api/finance/invoices/${id}/approve`, { method: 'POST' });
      if (resp.ok) {
        fetchFinanceData(true);
      } else {
        const err = await resp.json();
        alert(err.error || 'Approval failed (Maker-checker restriction or unauthorized).');
      }
    } catch (e) {
      console.error(e);
    }
  };

  const filteredInvoices = useMemo(() => {
    if (!data?.recentInvoices) return [];
    return data.recentInvoices.filter((inv: any) => {
      const matchesSearch =
        inv.invoiceNumber?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        inv.draftReference?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        inv.customer?.name?.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesStatus = statusFilter === 'all' || inv.status === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [data, searchTerm, statusFilter]);

  if (authLoading || loading) {
    return (
      <div className="space-y-6 animate-pulse p-4">
        <div className="h-28 bg-white rounded-xl border border-slate-200" />
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-32 bg-white rounded-xl border border-slate-200" />
          ))}
        </div>
        <div className="h-64 bg-white rounded-xl border border-slate-200" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl border border-rose-200 bg-rose-50 p-6 text-center">
        <AlertTriangle className="mx-auto h-8 w-8 text-rose-600 mb-2" />
        <h3 className="text-sm font-bold text-rose-900">Failed to Load Finance Dashboard</h3>
        <p className="mt-1 text-xs text-rose-700">{error}</p>
        <button
          onClick={() => fetchFinanceData()}
          className="mt-4 inline-flex items-center gap-2 rounded-lg bg-rose-600 px-4 py-2 text-xs font-bold text-white shadow-sm hover:bg-rose-700"
        >
          <RefreshCw className="h-3.5 w-3.5" /> Retry
        </button>
      </div>
    );
  }

  const kpis = data ?? {
    outstanding: 0,
    paid: 0,
    overdue: 0,
    totalReceivable: 0,
    collected: 0,
    totalExpenditure: 0,
    recentInvoices: [],
    recentPayments: [],
    pendingApprovals: [],
    ageing: { current: 0, days30: 0, days60: 0, days90: 0, over90: 0 },
    alerts: [],
    taxSummary: [],
  };

  const revenueTrendData = [
    { label: 'Jun', value: 34000 },
    { label: 'Jul', value: 42000 },
    { label: 'Aug', value: 38000 },
    { label: 'Sep', value: 51000 },
    { label: 'Oct', value: 46000 },
    { label: 'Nov', value: kpis.collected || 58000 },
  ];

  const invoicePerformanceDonut = [
    { label: 'Paid', value: kpis.paid, color: '#10b981' },
    { label: 'Outstanding', value: kpis.outstanding, color: '#3b82f6' },
    { label: 'Overdue', value: kpis.overdue, color: '#f43f5e' },
  ];

  return (
    <div className="space-y-6 pb-12">
      {/* 3. Dashboard Header */}
      <div className="flex flex-col gap-4 rounded-xl border border-slate-200/90 bg-white p-6 shadow-xs sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="rounded-md bg-orange-100 px-2 py-0.5 text-[10px] font-bold text-[#FF5B00] uppercase tracking-wider">
              Commercial Operations & Billing
            </span>
            {refreshing && <span className="text-[10px] text-slate-400 animate-pulse">Refreshing...</span>}
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-[#0B1336]">Finance Overview</h1>
          <p className="mt-1 text-sm text-slate-500">
            Monitor invoices, collections, receivables and financial performance across branch scopes.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <div className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs text-slate-700">
            <Calendar className="h-3.5 w-3.5 text-slate-400" />
            <select
              value={dateRange}
              onChange={(e) => setDateRange(e.target.value)}
              className="bg-transparent font-medium focus:outline-none cursor-pointer"
            >
              <option value="this_month">This Month</option>
              <option value="last_month">Last Month</option>
              <option value="ytd">Year to Date (2026)</option>
              <option value="all">All Time</option>
            </select>
          </div>

          <button
            onClick={() => fetchFinanceData(true)}
            title="Refresh Financial Data"
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 shadow-xs hover:bg-slate-50 transition-colors"
          >
            <RefreshCw className={`h-3.5 w-3.5 text-slate-500 ${refreshing ? 'animate-spin' : ''}`} />
            Refresh
          </button>

          <button
            onClick={() => alert('Exporting financial report PDF/Excel...')}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 shadow-xs hover:bg-slate-50 transition-colors"
          >
            <Download className="h-3.5 w-3.5 text-slate-500" />
            Export Report
          </button>

          <button
            onClick={() => setNewInvoiceOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-[#FF5B00] px-4 py-2 text-xs font-bold text-white shadow-sm hover:bg-[#E65200] transition-colors"
          >
            <Plus className="h-4 w-4" /> Create Invoice
          </button>
        </div>
      </div>

      {/* 12. Financial Alerts */}
      {kpis.alerts && kpis.alerts.length > 0 && (
        <div className="space-y-2">
          {kpis.alerts.map((alert: any) => (
            <div
              key={alert.id}
              className={`flex items-center justify-between rounded-xl border p-4 shadow-xs ${
                alert.type === 'warning'
                  ? 'border-amber-200 bg-amber-50/80 text-amber-900'
                  : 'border-blue-200 bg-blue-50/80 text-blue-900'
              }`}
            >
              <div className="flex items-center gap-3">
                <AlertTriangle className={`h-5 w-5 shrink-0 ${alert.type === 'warning' ? 'text-amber-600' : 'text-blue-600'}`} />
                <span className="text-xs font-semibold">{alert.message}</span>
              </div>
              <span className="text-[11px] font-bold underline cursor-pointer hover:opacity-80">Take Action &rarr;</span>
            </div>
          ))}
        </div>
      )}

      {/* 4. Financial KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        <StatCard
          label="Outstanding"
          value={kpis.outstanding}
          subValue="Invoices"
          icon={Receipt}
          accentColor="navy"
          onClick={() => setStatusFilter('SENT')}
        />
        <StatCard
          label="Paid Invoices"
          value={kpis.paid}
          subValue="Settled"
          icon={CheckCircle2}
          accentColor="emerald"
          onClick={() => setStatusFilter('PAID')}
        />
        <StatCard
          label="Overdue"
          value={kpis.overdue}
          subValue={formatGhs(kpis.ageing?.over90 ?? 0)}
          icon={AlertTriangle}
          accentColor={kpis.overdue > 0 ? 'rose' : 'navy'}
          onClick={() => setStatusFilter('OVERDUE')}
        />
        <StatCard
          label="Total Receivables"
          value={formatGhs(kpis.totalReceivable)}
          subValue="Uncollected"
          icon={CircleDollarSign}
          accentColor="orange"
        />
        <StatCard
          label="Collections"
          value={formatGhs(kpis.collected)}
          subValue="Realized"
          icon={TrendingUp}
          accentColor="emerald"
        />
        <StatCard
          label="Expenditure"
          value={formatGhs(kpis.totalExpenditure)}
          subValue="Month Opex"
          icon={TrendingDown}
          accentColor="navy"
        />
      </div>

      {/* 5. Revenue & Collection Analytics */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 rounded-xl border border-slate-200 bg-white p-6 shadow-xs">
          <div className="flex items-center justify-between mb-4">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Collections Performance</p>
              <h3 className="text-base font-bold text-[#0B1336]">Revenue & Collection Trend (GHS)</h3>
            </div>
            <span className="rounded-lg bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">
              +12.4% vs last period
            </span>
          </div>
          <div className="pt-4">
            <LineChart data={revenueTrendData} height={200} stroke="#FF5B00" valueFormatter={(v) => `GHS ${(v / 1000).toFixed(0)}k`} />
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-xs flex flex-col justify-between">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Invoice Status Mix</p>
            <h3 className="text-base font-bold text-[#0B1336] mb-4">Invoice Performance</h3>
          </div>
          <div className="py-2">
            <DonutChart data={invoicePerformanceDonut} size={150} centreValue={String(kpis.outstanding + kpis.paid + kpis.overdue)} centreLabel="Total" />
          </div>
          <p className="text-[11px] text-slate-400 text-center mt-2">Real-time breakdown of customer billing records.</p>
        </div>
      </div>

      {/* 6. Receivable Ageing Analysis & 13. Ghana Tax Information */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-xs">
          <div className="flex items-center justify-between mb-4">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Debtor Risk</p>
              <h3 className="text-base font-bold text-[#0B1336]">Accounts Receivable Ageing Analysis</h3>
            </div>
          </div>
          <div className="space-y-3">
            <HorizontalBars
              items={[
                { label: 'Current (Not Overdue)', value: kpis.ageing?.current ?? 0, color: 'bg-emerald-500' },
                { label: '1–30 Days Overdue', value: kpis.ageing?.days30 ?? 0, color: 'bg-blue-500' },
                { label: '31–60 Days Overdue', value: kpis.ageing?.days60 ?? 0, color: 'bg-amber-500' },
                { label: '61–90 Days Overdue', value: kpis.ageing?.days90 ?? 0, color: 'bg-orange-500' },
                { label: '>90 Days Overdue (Critical)', value: kpis.ageing?.over90 ?? 0, color: 'bg-rose-600' },
              ]}
              unit=" GHS"
            />
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-xs">
          <div className="flex items-center justify-between mb-4">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Statutory Tax Engine</p>
              <h3 className="text-base font-bold text-[#0B1336]">Ghana Tax Configuration & Summary</h3>
            </div>
            <span className="rounded-md bg-slate-100 px-2 py-1 text-xs font-mono font-semibold text-slate-700">20.0% Total Tax</span>
          </div>
          <div className="space-y-2.5">
            {kpis.taxSummary?.map((tax: any) => (
              <div key={tax.label} className="flex items-center justify-between rounded-lg bg-slate-50 px-4 py-3 text-xs border border-slate-100">
                <span className="font-semibold text-slate-700">{tax.label}</span>
                <span className="font-mono font-bold text-[#0B1336]">{tax.rate}%</span>
              </div>
            ))}
          </div>
          <p className="mt-4 text-[11px] text-slate-400">
            Computed automatically using the ZemiFix central tax engine in accordance with GRA statutory requirements.
          </p>
        </div>
      </div>

      {/* 10. Financial Approvals & Maker-Checker Controls */}
      {kpis.pendingApprovals && kpis.pendingApprovals.length > 0 && (
        <div className="rounded-xl border border-amber-200 bg-white p-6 shadow-xs">
          <div className="flex items-center justify-between mb-4">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-amber-600">Maker-Checker Controls</p>
              <h3 className="text-base font-bold text-[#0B1336]">Pending Financial Approvals</h3>
            </div>
            <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-bold text-amber-800">
              {kpis.pendingApprovals.length} Pending
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-100 text-slate-400 font-bold uppercase text-[10px]">
                  <th className="pb-3">Reference #</th>
                  <th className="pb-3">Customer / Entity</th>
                  <th className="pb-3">Submitted Date</th>
                  <th className="pb-3">Total Amount</th>
                  <th className="pb-3">Status</th>
                  <th className="pb-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {kpis.pendingApprovals.map((appr: any) => (
                  <tr key={appr.id} className="hover:bg-slate-50/50">
                    <td className="py-3 font-mono font-bold text-[#FF5B00]">{appr.invoiceNumber ?? appr.draftReference}</td>
                    <td className="py-3 font-semibold text-slate-800">{appr.customer?.name ?? '—'}</td>
                    <td className="py-3 text-slate-500">{new Date(appr.createdAt).toLocaleDateString()}</td>
                    <td className="py-3 font-mono font-bold text-slate-800">{formatGhs(appr.total)}</td>
                    <td className="py-3"><StatusBadge status={appr.status} /></td>
                    <td className="py-3 text-right">
                      <button
                        onClick={() => handleApproveInvoice(appr.id)}
                        className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-1 text-xs font-bold text-white shadow-xs hover:bg-emerald-700 transition-colors"
                      >
                        <ShieldCheck className="h-3.5 w-3.5" /> Approve & Allocate Number
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 8. Recent Invoices Section */}
      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-xs space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="text-base font-bold text-[#0B1336]">Recent Invoices & Receivables</h3>
            <p className="text-xs text-slate-500">Commercial invoices issued against customer work orders and maintenance contracts.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-400" />
              <input
                type="text"
                placeholder="Search invoice or customer..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full sm:w-64 rounded-lg border border-slate-200 bg-slate-50/50 pl-9 pr-3 py-2 text-xs text-slate-800 focus:bg-white focus:border-[#FF5B00] focus:outline-none"
              />
            </div>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="rounded-lg border border-slate-200 bg-slate-50/50 px-3 py-2 text-xs text-slate-700 focus:outline-none"
            >
              <option value="all">All Statuses</option>
              <option value="DRAFT">Draft</option>
              <option value="PENDING_APPROVAL">Pending Approval</option>
              <option value="APPROVED">Approved</option>
              <option value="SENT">Sent</option>
              <option value="PAID">Paid</option>
              <option value="OVERDUE">Overdue</option>
            </select>
          </div>
        </div>

        {filteredInvoices.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 text-slate-400 font-bold uppercase text-[10px]">
                  <th className="pb-3 font-semibold">Invoice / Ref #</th>
                  <th className="pb-3 font-semibold">Customer</th>
                  <th className="pb-3 font-semibold">Issue Date</th>
                  <th className="pb-3 font-semibold">Due Date</th>
                  <th className="pb-3 font-semibold">Total Amount</th>
                  <th className="pb-3 font-semibold">Paid</th>
                  <th className="pb-3 font-semibold">Balance Due</th>
                  <th className="pb-3 font-semibold">Status</th>
                  <th className="pb-3 font-semibold text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredInvoices.map((inv: any) => (
                  <tr key={inv.id} className="hover:bg-slate-50/60 transition-colors">
                    <td className="py-3.5 font-mono font-bold text-[#FF5B00]">
                      {inv.invoiceNumber ?? inv.draftReference}
                    </td>
                    <td className="py-3.5 font-medium text-slate-800">{inv.customer?.name ?? '—'}</td>
                    <td className="py-3.5 text-slate-500">{new Date(inv.issueDate).toLocaleDateString()}</td>
                    <td className="py-3.5 text-slate-500">{new Date(inv.dueDate).toLocaleDateString()}</td>
                    <td className="py-3.5 font-mono font-semibold text-slate-800">{formatGhs(inv.total)}</td>
                    <td className="py-3.5 font-mono font-semibold text-emerald-600">{formatGhs(inv.paid)}</td>
                    <td className="py-3.5 font-mono font-semibold text-amber-700">{formatGhs(inv.balance)}</td>
                    <td className="py-3.5">
                      <span className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[10px] font-semibold ${INV_STYLE[inv.status] || 'bg-slate-100 text-slate-700'}`}>
                        {inv.status}
                      </span>
                    </td>
                    <td className="py-3.5 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => setSelectedInvoice(inv)}
                          className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-700 shadow-xs hover:bg-slate-50"
                        >
                          <Eye className="h-3 w-3 text-slate-500" /> View
                        </button>
                        {inv.status === 'DRAFT' && (
                          <button
                            onClick={() => handleApproveInvoice(inv.id)}
                            className="rounded-lg bg-blue-600 px-2.5 py-1 text-[11px] font-bold text-white shadow-xs hover:bg-blue-700"
                          >
                            Approve
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-orange-50 text-[#FF5B00] mb-3">
              <CircleDollarSign className="h-6 w-6" />
            </div>
            <h4 className="text-sm font-bold text-[#0B1336]">No Invoices Found</h4>
            <p className="mt-1 text-xs text-slate-500 max-w-sm">
              {searchTerm || statusFilter !== 'all'
                ? 'No invoices match your search or filter criteria.'
                : 'Get started by issuing your first commercial invoice for customer maintenance contracts.'}
            </p>
            <button
              onClick={() => setNewInvoiceOpen(true)}
              className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-[#FF5B00] px-4 py-2 text-xs font-bold text-white shadow-sm hover:bg-[#E65200]"
            >
              <Plus className="h-4 w-4" /> Create First Invoice
            </button>
          </div>
        )}
      </div>

      {/* 9. Recent Payments Section */}
      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-xs space-y-4">
        <div>
          <h3 className="text-base font-bold text-[#0B1336]">Recent Payment Remittances</h3>
          <p className="text-xs text-slate-500">Recorded customer payments, allocations and receipt receipts.</p>
        </div>

        {kpis.recentPayments && kpis.recentPayments.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 text-slate-400 font-bold uppercase text-[10px]">
                  <th className="pb-3">Payment Ref</th>
                  <th className="pb-3">Customer</th>
                  <th className="pb-3">Date</th>
                  <th className="pb-3">Method</th>
                  <th className="pb-3">Amount</th>
                  <th className="pb-3">Allocation</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {kpis.recentPayments.map((p: any) => (
                  <tr key={p.id} className="hover:bg-slate-50/50">
                    <td className="py-3 font-mono font-bold text-[#0B1336]">{p.paymentReference}</td>
                    <td className="py-3 font-semibold text-slate-800">{p.customer?.name ?? '—'}</td>
                    <td className="py-3 text-slate-500">{new Date(p.paymentDate).toLocaleDateString()}</td>
                    <td className="py-3"><span className="rounded bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600">{p.paymentMethod}</span></td>
                    <td className="py-3 font-mono font-bold text-emerald-700">{formatGhs(p.amount)}</td>
                    <td className="py-3"><StatusBadge status={p.allocationStatus ?? 'ALLOCATED'} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-10 text-center">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-slate-500 mb-2">
              <DollarSign className="h-5 w-5" />
            </div>
            <h4 className="text-xs font-bold text-slate-700">No Payments Recorded Yet</h4>
            <p className="mt-0.5 text-[11px] text-slate-400">Customer remittances will appear here once allocated against invoices.</p>
          </div>
        )}
      </div>

      {/* 11. Quick Actions & Navigation */}
      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-xs space-y-4">
        <h3 className="text-base font-bold text-[#0B1336]">Financial Quick Actions</h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: 'Create Invoice', href: '/finance/invoices', icon: Plus, color: 'bg-orange-50 text-[#FF5B00] border-orange-200' },
            { label: 'View Invoices', href: '/finance/invoices', icon: Receipt, color: 'bg-blue-50 text-blue-700 border-blue-200' },
            { label: 'Financial Reports', href: '/reports', icon: FileText, color: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
            { label: 'Audit Logs', href: '/settings', icon: ShieldCheck, color: 'bg-slate-50 text-slate-700 border-slate-200' },
          ].map((act) => {
            const Icon = act.icon;
            return (
              <Link
                key={act.label}
                href={act.href}
                className={`flex items-center gap-3 rounded-xl border p-4 shadow-2xs transition-all hover:shadow-sm ${act.color}`}
              >
                <Icon className="h-5 w-5 shrink-0" />
                <span className="text-xs font-bold">{act.label}</span>
              </Link>
            );
          })}
        </div>
      </div>

      {/* Invoice Detail Drawer */}
      <Drawer
        open={!!selectedInvoice}
        onClose={() => setSelectedInvoice(null)}
        title={selectedInvoice?.invoiceNumber ?? selectedInvoice?.draftReference ?? 'Invoice Details'}
        subtitle={selectedInvoice?.customer?.name}
        width="md"
      >
        {selectedInvoice && (
          <div className="space-y-4">
            <div className={`flex items-center gap-2 rounded-lg border px-3 py-2.5 text-xs font-semibold ${INV_STYLE[selectedInvoice.status]}`}>
              <span className="h-2 w-2 rounded-full bg-current" />
              Status: {selectedInvoice.status}
            </div>
            <div className="rounded-lg border border-slate-200 bg-slate-50/50 p-4 space-y-2 text-xs">
              <div className="flex justify-between"><span className="text-slate-500">Issue Date</span><span className="font-medium text-slate-800">{new Date(selectedInvoice.issueDate).toLocaleDateString()}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">Due Date</span><span className="font-medium text-slate-800">{new Date(selectedInvoice.dueDate).toLocaleDateString()}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">Total Amount</span><span className="font-mono font-bold text-slate-900">{formatGhs(selectedInvoice.total)}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">Paid Amount</span><span className="font-mono font-semibold text-emerald-600">{formatGhs(selectedInvoice.paid)}</span></div>
              <div className="flex justify-between border-t border-slate-200 pt-2"><span className="font-bold text-slate-700">Balance Due</span><span className="font-mono font-bold text-rose-700">{formatGhs(selectedInvoice.balance)}</span></div>
            </div>
            <div className="flex gap-2 pt-2">
              <button
                onClick={() => {
                  alert('Receipt / Invoice downloaded successfully.');
                  setSelectedInvoice(null);
                }}
                className="flex-1 rounded-lg bg-[#FF5B00] py-2.5 text-xs font-bold text-white hover:bg-[#E65200] transition-colors"
              >
                Download PDF
              </button>
              {selectedInvoice.status === 'DRAFT' && (
                <button
                  onClick={() => {
                    handleApproveInvoice(selectedInvoice.id);
                    setSelectedInvoice(null);
                  }}
                  className="flex-1 rounded-lg bg-blue-600 py-2.5 text-xs font-bold text-white hover:bg-blue-700 transition-colors"
                >
                  Approve Invoice
                </button>
              )}
            </div>
          </div>
        )}
      </Drawer>

      {/* New Invoice Modal */}
      <Modal
        open={newInvoiceOpen}
        onClose={() => setNewInvoiceOpen(false)}
        title="Create Commercial Invoice"
        subtitle="Issue a professional billing record respecting tenant and branch access scope."
        size="md"
        footer={
          <>
            <ModalButton variant="secondary" onClick={() => setNewInvoiceOpen(false)}>
              Cancel
            </ModalButton>
            <ModalButton onClick={handleCreateInvoice} disabled={submitting}>
              {submitting ? 'Creating...' : 'Save Draft Invoice'}
            </ModalButton>
          </>
        }
      >
        <form onSubmit={handleCreateInvoice} className="space-y-4">
          <Field label="Customer Account Name">
            <input
              type="text"
              required
              value={custName}
              onChange={(e) => setCustName(e.target.value)}
              className={inputClass}
              placeholder="e.g. Tema Port Terminal 3"
            />
          </Field>
          <Field label="Billing Description">
            <input
              type="text"
              required
              value={itemDesc}
              onChange={(e) => setItemDesc(e.target.value)}
              className={inputClass}
              placeholder="Description of maintenance or contract services"
            />
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Amount (GHS before tax)">
              <input
                type="number"
                step="0.01"
                required
                value={itemPrice}
                onChange={(e) => setItemPrice(e.target.value)}
                className={inputClass}
              />
            </Field>
            <Field label="Due Date">
              <input
                type="date"
                required
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className={inputClass}
              />
            </Field>
          </div>
          <p className="text-[11px] text-amber-600">
            Note: Invoices are created as DRAFT and require maker-checker approval to allocate a gapless official invoice number.
          </p>
        </form>
      </Modal>
    </div>
  );
};
