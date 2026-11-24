import { NextRequest, NextResponse } from 'next/server';
import { getCurrentPortalContact } from '@/src/lib/portalAuth';
import { prisma } from '@/src/lib/prisma';
import { getAuthorizedSiteIdsForContact } from '@/src/lib/services/portalService';
import { getCompany } from '@/src/lib/services/organizationService';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const contact = await getCurrentPortalContact(req);
    if (!contact) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;

    const invoice = await prisma.invoice.findUnique({
      where: { id },
      include: {
        customer: true,
        site: true,
        lines: true,
        workOrder: { select: { workOrderNumber: true, title: true } },
      },
    });

    if (!invoice || invoice.deletedAt !== null) {
      return NextResponse.json({ error: 'Invoice not found' }, { status: 404 });
    }

    // Security check: tenant isolation
    if (invoice.customerId !== contact.customerId) {
      return NextResponse.json({ error: 'Forbidden: Invoice does not belong to your customer account' }, { status: 403 });
    }

    // Site authorization check
    if (invoice.siteId) {
      const authorizedSiteIds = await getAuthorizedSiteIdsForContact(contact);
      if (!authorizedSiteIds.includes(invoice.siteId)) {
        return NextResponse.json({ error: 'Forbidden: Invoice site is outside your authorized site access' }, { status: 403 });
      }
    }

    const companyRes = await getCompany();
    const company = companyRes.data;

    const htmlContent = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8" />
          <title>Invoice #${invoice.invoiceNumber}</title>
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; color: #080E29; margin: 0; padding: 40px; background: #fff; }
            .header { display: flex; justify-content: space-between; border-bottom: 2px solid #0B1336; padding-bottom: 20px; margin-bottom: 30px; }
            .brand h2 { margin: 0; color: #0B1336; font-size: 22px; }
            .brand p { margin: 4px 0 0 0; color: #64748b; font-size: 12px; }
            .invoice-meta { text-align: right; }
            .invoice-meta h1 { margin: 0; color: #FF5B00; font-size: 26px; }
            .invoice-meta p { margin: 4px 0 0 0; font-size: 12px; color: #64748b; }
            .parties { display: flex; justify-content: space-between; margin-bottom: 30px; font-size: 13px; }
            .party h3 { font-size: 11px; text-transform: uppercase; letter-spacing: 1px; color: #64748b; margin: 0 0 8px 0; }
            .party p { margin: 2px 0; color: #1e293b; }
            table { width: 100%; border-collapse: collapse; margin-bottom: 30px; font-size: 13px; }
            th { background: #0B1336; color: #fff; text-align: left; padding: 10px 12px; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; }
            td { padding: 10px 12px; border-bottom: 1px solid #e2e8f0; color: #334155; }
            .text-right { text-align: right; }
            .summary { width: 320px; margin-left: auto; font-size: 13px; margin-bottom: 40px; }
            .summary-row { display: flex; justify-content: space-between; padding: 6px 0; border-bottom: 1px solid #f1f5f9; }
            .summary-row.total { font-weight: bold; font-size: 15px; border-top: 2px solid #0B1336; border-bottom: 2px solid #0B1336; color: #080E29; margin-top: 4px; padding: 8px 0; }
            .footer { border-top: 1px solid #e2e8f0; padding-top: 20px; font-size: 11px; color: #64748b; text-align: center; }
            .print-btn { background: #FF5B00; color: #fff; border: none; padding: 10px 20px; font-weight: bold; border-radius: 8px; cursor: pointer; margin-bottom: 20px; }
            @media print { body { padding: 0; } .print-btn { display: none; } }
          </style>
        </head>
        <body>
          <button class="print-btn" onclick="window.print()">Print / Save PDF</button>
          <div class="header">
            <div class="brand">
              <h2>${company.name}</h2>
              <p>${company.legalName ?? ''}</p>
              <p>Ghana Tax Scheme: ${company.taxScheme ?? 'GRA Standard'}</p>
            </div>
            <div class="invoice-meta">
              <h1>INVOICE</h1>
              <p><strong>Invoice #:</strong> ${invoice.invoiceNumber}</p>
              <p><strong>Issue Date:</strong> ${new Date(invoice.issueDate).toLocaleDateString()}</p>
              <p><strong>Due Date:</strong> ${new Date(invoice.dueDate).toLocaleDateString()}</p>
              <p><strong>Status:</strong> ${invoice.status}</p>
              ${invoice.workOrder ? `<p><strong>Work Order:</strong> ${invoice.workOrder.workOrderNumber}</p>` : ''}
            </div>
          </div>

          <div class="parties">
            <div class="party">
              <h3>Billed To:</h3>
              <p><strong>${invoice.customer.name}</strong></p>
              <p>${invoice.customer.billingAddress ?? '—'}</p>
              ${invoice.site ? `<p><strong>Site:</strong> ${invoice.site.name} (${invoice.site.siteCode})</p>` : ''}
            </div>
            <div class="party" style="text-align: right;">
              <h3>Payment Status:</h3>
              <p><strong>${invoice.status}</strong></p>
              <p>Currency: ${invoice.currency ?? 'GHS'}</p>
            </div>
          </div>

          <table>
            <thead>
              <tr>
                <th>Description</th>
                <th class="text-right">Qty</th>
                <th class="text-right">Unit Price</th>
                <th class="text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              ${invoice.lines.map((l: any) => `
                <tr>
                  <td>${l.description}</td>
                  <td class="text-right">${Number(l.quantity)}</td>
                  <td class="text-right">${Number(l.unitPrice).toLocaleString()}</td>
                  <td class="text-right">${Number(l.lineTotal).toLocaleString()}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>

          <div class="summary">
            <div class="summary-row">
              <span>Subtotal:</span>
              <span>GHS ${Number(invoice.subtotal).toLocaleString()}</span>
            </div>
            <div class="summary-row">
              <span>VAT (15%):</span>
              <span>GHS ${Number(invoice.vatAmount ?? 0).toLocaleString()}</span>
            </div>
            <div class="summary-row">
              <span>NHIL (2.5%) & GETFund (2.5%):</span>
              <span>GHS ${Number(Number(invoice.nhilAmount ?? 0) + Number(invoice.getFundAmount ?? 0)).toLocaleString()}</span>
            </div>
            <div class="summary-row total">
              <span>Total Amount:</span>
              <span>GHS ${Number(invoice.totalAmount).toLocaleString()}</span>
            </div>
            <div class="summary-row">
              <span>Amount Paid:</span>
              <span>GHS ${Number(invoice.paidAmount ?? 0).toLocaleString()}</span>
            </div>
            <div class="summary-row" style="color: #dc2626; font-weight: bold;">
              <span>Balance Due:</span>
              <span>GHS ${Number(invoice.balanceDue).toLocaleString()}</span>
            </div>
          </div>

          <div class="footer">
            <p>Thank you for your business. Please quote invoice number #${invoice.invoiceNumber} on all payments.</p>
            <p>${company.name} — Powered by ZemiFix CMMS</p>
          </div>
        </body>
      </html>
    `;

    return new NextResponse(htmlContent, {
      status: 200,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Content-Disposition': `inline; filename="Invoice-${invoice.invoiceNumber}.html"`,
        'Cache-Control': 'no-store, private',
      },
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message ?? 'Failed to generate invoice document' }, { status: 500 });
  }
}
