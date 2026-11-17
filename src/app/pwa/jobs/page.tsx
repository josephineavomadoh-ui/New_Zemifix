'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useOnlineStatus } from '@/src/lib/pwa/useOnlineStatus';
import { getCachedWorkOrdersLocally } from '@/src/lib/pwa/db';
import { WorkOrderStatusBadge } from '@/src/components/work-orders/WorkOrderStatusBadge';
import { WorkOrderPriorityBadge } from '@/src/components/work-orders/WorkOrderPriorityBadge';

type FilterTab = 'All' | 'Assigned' | 'In Progress' | 'On Hold' | 'Completed';

const FILTER_TABS: FilterTab[] = ['All', 'Assigned', 'In Progress', 'On Hold', 'Completed'];

function getStatusesForFilter(filter: FilterTab): string[] | null {
  switch (filter) {
    case 'Assigned':
      return ['OPEN', 'ASSIGNED'];
    case 'In Progress':
      return ['IN_PROGRESS'];
    case 'On Hold':
      return ['ON_HOLD'];
    case 'Completed':
      return ['COMPLETED'];
    case 'All':
    default:
      return null; // null means no filter applied
  }
}

export default function MyJobsPage() {
  const isOnline = useOnlineStatus();
  const [workOrders, setWorkOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [fromCache, setFromCache] = useState<boolean>(false);
  const [activeFilter, setActiveFilter] = useState<FilterTab>('All');

  useEffect(() => {
    const loadJobs = async () => {
      setLoading(true);
      try {
        if (isOnline) {
          const res = await fetch('/api/work-orders');
          if (res.ok) {
            const data = await res.json();
            setWorkOrders(data.workOrders ?? []);
            setFromCache(false);
            return;
          }
        }
        // Offline or fetch failed — use cache
        const cached = await getCachedWorkOrdersLocally();
        setWorkOrders(cached);
        setFromCache(true);
      } catch (err) {
        console.error('Failed to load jobs', err);
        const cached = await getCachedWorkOrdersLocally();
        setWorkOrders(cached);
        setFromCache(true);
      } finally {
        setLoading(false);
      }
    };

    loadJobs();
  }, [isOnline]);

  const allowedStatuses = getStatusesForFilter(activeFilter);
  const filteredOrders =
    allowedStatuses === null
      ? workOrders
      : workOrders.filter((wo) => allowedStatuses.includes(wo.status));

  return (
    <div className="min-h-screen bg-[#F8FAFC] pb-24">
      {/* Filter tab bar */}
      <div className="bg-white border-b border-gray-100 sticky top-0 z-30">
        <div className="overflow-x-auto">
          <div className="flex px-4 gap-1 min-w-max">
            {FILTER_TABS.map((tab) => {
              const isActive = tab === activeFilter;
              return (
                <button
                  key={tab}
                  onClick={() => setActiveFilter(tab)}
                  className={`py-3 px-3 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
                    isActive
                      ? 'border-[#FF5B00] text-[#FF5B00]'
                      : 'border-transparent text-gray-400 hover:text-gray-600'
                  }`}
                >
                  {tab}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div className="p-4 max-w-lg mx-auto space-y-3">
        {/* Cached data indicator */}
        {fromCache && (
          <div className="text-xs text-gray-400 text-center py-1">
            Showing cached data — connect to refresh
          </div>
        )}

        {loading ? (
          <div className="p-8 text-center text-gray-400 text-sm">Loading…</div>
        ) : filteredOrders.length === 0 ? (
          <div className="p-8 text-center text-gray-400 text-sm bg-white rounded-xl border border-gray-100">
            No {activeFilter === 'All' ? '' : activeFilter.toLowerCase()} work orders
          </div>
        ) : (
          filteredOrders.map((wo) => (
            <Link
              key={wo.id}
              href={`/pwa/work-orders/${wo.id}`}
              className="block bg-white rounded-xl shadow-sm border border-gray-100 hover:border-gray-200 p-4 space-y-2 transition-colors"
            >
              <div className="flex items-center justify-between">
                <span className="font-mono font-bold text-sm text-[#FF5B00]">{wo.workOrderNumber}</span>
                <div className="flex items-center gap-2">
                  {fromCache && (
                    <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded font-medium">
                      Cached
                    </span>
                  )}
                  <WorkOrderStatusBadge status={wo.status} size="sm" />
                </div>
              </div>

              <div className="font-bold text-sm text-[#0B1336]">{wo.title}</div>

              <div className="flex items-center justify-between">
                <WorkOrderPriorityBadge priority={wo.priority} size="sm" />
              </div>

              <div className="pt-1 border-t border-gray-50 space-y-1">
                {wo.asset?.name && (
                  <div className="text-xs text-gray-400">Asset: {wo.asset.name}</div>
                )}
                {wo.location?.name && (
                  <div className="text-xs text-gray-400">Location: {wo.location.name}</div>
                )}
                {wo.dueDate && (
                  <div className="text-xs text-gray-400">
                    Due: {new Date(wo.dueDate).toLocaleDateString()}
                  </div>
                )}
              </div>
            </Link>
          ))
        )}
      </div>
    </div>
  );
}
