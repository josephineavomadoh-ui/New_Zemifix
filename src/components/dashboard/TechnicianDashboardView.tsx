// @ts-nocheck
import React, { useEffect, useState } from 'react';
import { KpiCard } from '@/src/components/dashboard/KpiCard';
import { WorkOrderDetailModal } from '@/src/components/dashboard/WorkOrderDetailModal';
import { useAuth } from '@/src/lib/auth-context';
import type { AuthenticatedUser } from '@/src/lib/auth';

/**
 * Technician Desktop workspace – client side only.
 * All data is fetched via secured API routes (`/api/work-orders` and
 * `/api/work-orders/:id`). No direct Prisma access is performed in the
 * browser. The backend enforces organizational scope and assignment.
 */
export const TechnicianDashboardView: React.FC = () => {
  const { user, loading } = useAuth();
  const [kpis, setKpis] = useState<any>(null);
  const [schedule, setSchedule] = useState<any[]>([]);
  const [selectedWO, setSelectedWO] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadingKpis, setLoadingKpis] = useState(true);
  const [loadingSchedule, setLoadingSchedule] = useState(true);

  // -----------------------------------------------------------------
  // Load all work orders the user is allowed to see (backend scoped).
  // -----------------------------------------------------------------
  useEffect(() => {
    if (loading || !user) return;
    (async () => {
      try {
        const resp = await fetch('/api/work-orders', {
          method: 'GET',
          credentials: 'include',
        });
        if (!resp.ok) throw new Error(`Unable to fetch work orders (${resp.status})`);
        const data = await resp.json();
        const workOrders: any[] = data.workOrders ?? [];
        const now = new Date();
        const todayEnd = new Date(now);
        todayEnd.setHours(23, 59, 59, 999);

        // KPI calculations – purely client side, using the scoped list.
        const assigned = workOrders.filter((wo) => wo.assignedUserId === (user as AuthenticatedUser).id).length;
        const inProgress = workOrders.filter((wo) => wo.assignedUserId === (user as AuthenticatedUser).id && wo.status === 'IN_PROGRESS').length;
        const overdue = workOrders.filter((wo) => wo.assignedUserId === (user as AuthenticatedUser).id && ['OPEN', 'ASSIGNED', 'IN_PROGRESS'].includes(wo.status) && new Date(wo.plannedEnd) < now).length;
        const today = workOrders.filter((wo) => wo.assignedUserId === (user as AuthenticatedUser).id && ['OPEN', 'ASSIGNED', 'IN_PROGRESS'].includes(wo.status) && new Date(wo.plannedStart) >= now && new Date(wo.plannedStart) <= todayEnd).length;
        setKpis({ assigned, inProgress, overdue, today });

        // Schedule – work orders assigned to the technician that start today.
        const todayWOs = workOrders
          .filter((wo) => wo.assignedUserId === (user as AuthenticatedUser).id && ['OPEN', 'ASSIGNED', 'IN_PROGRESS'].includes(wo.status))
          .filter((wo) => {
            const ps = new Date(wo.plannedStart);
            return ps >= now && ps <= todayEnd;
          })
          .sort((a, b) => new Date(a.plannedStart!).getTime() - new Date(b.plannedStart!).getTime());
        setSchedule(todayWOs);
      } catch (e: any) {
        console.error(e);
        setError(e.message ?? 'Failed to load technician data');
      } finally {
        setLoadingKpis(false);
        setLoadingSchedule(false);
      }
    })();
  }, [loading, user]);

  if (loading) {
    return <div className="animate-pulse space-y-4"><div className="h-40 bg-slate-200 rounded" /></div>;
  }
  if (error) {
    return <div className="p-4 text-red-600 bg-red-50 rounded">{error}</div>;
  }
  if (!kpis) return null;

  return (
    <div className="space-y-8 p-4">
      {/* KPI cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard title="Assigned" value={kpis.assigned} />
        <KpiCard title="In‑Progress" value={kpis.inProgress} />
        <KpiCard title="Overdue" value={kpis.overdue} />
        <KpiCard title="Due Today" value={kpis.today} />
      </div>

      {/* Today’s schedule */}
      <section>
        <h2 className="text-xl font-semibold mb-4">Today’s Schedule</h2>
        {loadingSchedule ? (
          <div className="animate-pulse space-y-2"><div className="h-12 bg-slate-200 rounded" /></div>
        ) : schedule.length === 0 ? (
          <p className="text-gray-600">No work orders scheduled for today.</p>
        ) : (
          <ul className="divide-y">
            {schedule.map((wo) => (
              <li key={wo.id} className="flex justify-between items-center py-2">
                <div>
                  <span className="font-medium">{wo.workOrderNumber}</span> – {wo.title}
                  <span className="ml-2 text-sm text-gray-500">({new Date(wo.plannedStart!).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })})</span>
                </div>
                <button className="btn btn-sm btn-outline" onClick={() => setSelectedWO(wo)}>
                  Details
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Detail modal – lazy‑loaded when a row is selected */}
      {selectedWO && (
        <WorkOrderDetailModal woId={selectedWO.id} onClose={() => setSelectedWO(null)} />
      )}
    </div>
  );
};
