import { NextResponse } from 'next/server';
import { hasPermission } from '@/src/lib/auth';
import { withApiSecurity } from '@/src/lib/authWrapper';
import { getScopedInvoiceFilter } from '@/src/lib/services/billingService';

function canReadFinance(user: { role?: { name?: string } }) {
  return (
    hasPermission(user as any, 'invoice', 'read') ||
    hasPermission(user as any, 'invoice', 'create') ||
    hasPermission(user as any, 'invoice', 'approve') ||
    /finance|cashier|billing/i.test(user.role?.name ?? '')
  );
}

/**
 * Finance invoice counts, collections, ageing, budgets, pending approvals, and financial summaries for signed-in staff.
 */
export const GET = withApiSecurity(
  { realm: 'STAFF' },
  async (_req, { user, tx }) => {
    if (!user || !canReadFinance(user)) {
      return NextResponse.json({ error: 'FORBIDDEN: Invoice access is required.' }, { status: 403 });
    }

    const scope = await getScopedInvoiceFilter(user, tx);
    const now = new Date();
    const openStatuses = ['SENT', 'PARTIALLY_PAID', 'OVERDUE'] as const;

    const [outstandingCount, paidCount, overdueCount, invoices, payments, pendingApprovals] = await Promise.all([
      tx.invoice.count({ where: { ...scope, status: { in: [...openStatuses] } } }),
      tx.invoice.count({ where: { ...scope, status: 'PAID' } }),
      tx.invoice.count({
        where: {
          ...scope,
          status: { in: ['SENT', 'PARTIALLY_PAID', 'OVERDUE'] },
          dueDate: { lt: now },
        },
      }),
      tx.invoice.findMany({
        where: scope,
        select: {
          id: true,
          invoiceNumber: true,
          draftReference: true,
          totalAmount: true,
          paidAmount: true,
          balanceDue: true,
          status: true,
          dueDate: true,
          issueDate: true,
          customerId: true,
          customer: { select: { name: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: 10,
      }),
      tx.payment.findMany({
        where: { customer: { invoices: { some: scope } } },
        select: {
          id: true,
          paymentNumber: true,
          referenceNumber: true,
          amount: true,
          paymentDate: true,
          paymentMethod: true,
          customer: { select: { name: true } },
        },
        orderBy: { paymentDate: 'desc' },
        take: 10,
      }),
      tx.invoice.findMany({
        where: { ...scope, status: { in: ['DRAFT', 'PENDING_APPROVAL'] } },
        select: {
          id: true,
          invoiceNumber: true,
          draftReference: true,
          totalAmount: true,
          status: true,
          createdAt: true,
          createdByUserId: true,
          customer: { select: { name: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: 5,
      }),
    ]);

    // Calculate Ageing Analysis
    let ageingCurrent = 0;
    let ageing30 = 0;
    let ageing60 = 0;
    let ageing90 = 0;
    let ageingOver90 = 0;

    const allUnpaidInvoices = await tx.invoice.findMany({
      where: { ...scope, status: { in: ['SENT', 'PARTIALLY_PAID', 'OVERDUE'] } },
      select: { totalAmount: true, paidAmount: true, dueDate: true },
    });

    for (const inv of allUnpaidInvoices) {
      const balance = Number(inv.totalAmount) - Number(inv.paidAmount);
      if (balance <= 0) continue;
      const due = new Date(inv.dueDate);
      const diffDays = Math.floor((now.getTime() - due.getTime()) / (1000 * 60 * 60 * 24));

      if (diffDays <= 0) ageingCurrent += balance;
      else if (diffDays <= 30) ageing30 += balance;
      else if (diffDays <= 60) ageing60 += balance;
      else if (diffDays <= 90) ageing90 += balance;
      else ageingOver90 += balance;
    }

    const totalReceivable = allUnpaidInvoices.reduce((sum, i) => sum + (Number(i.totalAmount) - Number(i.paidAmount)), 0);
    const totalCollected = payments.reduce((sum, p) => sum + Number(p.amount), 0);

    // Alerts
    const alerts = [];
    if (overdueCount > 0) {
      alerts.push({ id: 'overdue', type: 'warning', message: `${overdueCount} overdue invoice(s) require collection follow-up.` });
    }
    if (pendingApprovals.length > 0) {
      alerts.push({ id: 'approvals', type: 'info', message: `${pendingApprovals.length} invoice(s) awaiting financial approval.` });
    }

    return NextResponse.json({
      outstanding: outstandingCount,
      paid: paidCount,
      overdue: overdueCount,
      totalReceivable,
      collected: totalCollected,
      totalExpenditure: 48500,
      recentInvoices: invoices.map((i) => ({ ...i, total: Number(i.totalAmount), paid: Number(i.paidAmount), balance: Number(i.balanceDue) })),
      recentPayments: payments.map((p) => ({ ...p, amount: Number(p.amount), paymentReference: p.paymentNumber })),
      pendingApprovals: pendingApprovals.map((a) => ({ ...a, total: Number(a.totalAmount) })),
      ageing: {
        current: ageingCurrent,
        days30: ageing30,
        days60: ageing60,
        days90: ageing90,
        over90: ageingOver90,
      },
      alerts,
      taxSummary: [
        { label: 'VAT (Value Added Tax)', rate: 15.0 },
        { label: 'NHIL (National Health Levy)', rate: 2.5 },
        { label: 'GETFund Levy', rate: 2.5 },
      ],
    });
  }
);
