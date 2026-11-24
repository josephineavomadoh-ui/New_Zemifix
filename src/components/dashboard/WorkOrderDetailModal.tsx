// @ts-nocheck
import React, { useEffect, useState } from 'react';
import { useAuth } from '@/src/lib/auth-context';
import type { AuthenticatedUser } from '@/src/lib/auth';

/**
 * Modal that displays detailed information for a single work order.
 * Data is fetched from the secured endpoint `GET /api/work-orders/:id`.
 * The endpoint itself enforces:
 *   - user authentication
 *   - organizational scope (branch/department/company)
 *   - assignment to the requesting technician (or explicit permission)
 *   - soft‑delete guard
 *   - inclusion of related asset, parts, checklist, labour entries
 */
export const WorkOrderDetailModal: React.FC<{ woId: string; onClose: () => void }> = ({ woId, onClose }) => {
  const { user } = useAuth();
  const [detail, setDetail] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    (async () => {
      try {
        const resp = await fetch(`/api/work-orders/${woId}`, {
          method: 'GET',
          credentials: 'include',
        });
        if (!resp.ok) {
          if (resp.status === 403) throw new Error('Access denied');
          throw new Error(`Unable to fetch work order (${resp.status})`);
        }
        const data = await resp.json();
        setDetail(data.workOrder);
      } catch (e: any) {
        console.error(e);
        setError(e.message ?? 'Failed to load work order details');
      } finally {
        setLoading(false);
      }
    })();
  }, [woId, user]);

  if (loading) return <div className="modal"><div className="animate-pulse h-64 w-full bg-slate-200 rounded" /></div>;
  if (error) return <div className="modal"><div className="p-4 text-red-600">{error}</div></div>;
  if (!detail) return null;

  return (
    <div className="modal">
      <div className="modal-box max-w-2xl overflow-y-auto">
        <h3 className="font-bold text-lg">{detail.workOrderNumber} – {detail.title}</h3>
        <p className="text-sm text-gray-600 mb-4">{detail.description}</p>

        <section className="mb-4">
          <h4 className="font-semibold">Asset / Location</h4>
          <p>{detail.asset?.name ?? '—'} / {detail.location?.name ?? '—'}</p>
        </section>

        <section className="mb-4">
          <h4 className="font-semibold">Parts</h4>
          {detail.parts?.length ? (
            <ul className="list-disc list-inside">
              {detail.parts.map((p: any) => (
                <li key={p.id}>{p.part.name} (SKU {p.part.sku}) – Qty {p.quantity}</li>
              ))}
            </ul>
          ) : (
            <p className="text-gray-500">No parts allocated.</p>
          )}
        </section>

        <section className="mb-4">
          <h4 className="font-semibold">Checklist</h4>
          {detail.checklist?.length ? (
            <ul className="list-disc list-inside">
              {detail.checklist.map((c: any) => (
                <li key={c.id}>{c.name} – {c.isSatisfied ? '✔️' : '❌'}</li>
              ))}
            </ul>
          ) : (
            <p className="text-gray-500">No checklist items.</p>
          )}
        </section>

        <div className="modal-action">
          <button className="btn btn-outline" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
};
