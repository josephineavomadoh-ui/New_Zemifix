// @vitest-environment jsdom
/**
 * Phase 2A Tests — Manager/Supervisor Operational Workspace
 *
 * These are unit/component-level tests with mocked fetch and auth.
 * They do NOT require a database connection.
 * Integration tests that query the real database are explicitly labelled.
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';

// ─── Mock next/navigation ────────────────────────────────────────────────────
vi.mock('next/navigation', () => ({
  usePathname: () => '/dashboard',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

// ─── Mock next/link ──────────────────────────────────────────────────────────
vi.mock('next/link', () => ({
  default: ({ href, children, className }: { href: string; children: React.ReactNode; className?: string }) => (
    <a href={href} className={className}>{children}</a>
  ),
}));

// ─── Auth mock factory ────────────────────────────────────────────────────────
const mockUseAuth = vi.fn();
vi.mock('@/src/lib/auth-context', () => ({
  useAuth: () => mockUseAuth(),
}));

// ─── Shared auth helpers ──────────────────────────────────────────────────────
const makeUser = (permissions: Array<{ resource: string; action: string }>) => ({
  id: 'usr-test-1',
  name: 'Kwame Tester',
  email: 'test@zemifix.local',
  role: {
    id: 'role-test',
    name: 'TestRole',
    permissions: permissions.map((p) => ({ permission: p })),
  },
  branch: { id: 'br-hq', name: 'Accra HQ', code: 'HQ', type: 'HeadOffice' },
  accessScope: 'Branch',
});

const managerUser = makeUser([
  { resource: 'work_order', action: 'read' },
  { resource: 'asset', action: 'read' },
  { resource: 'inventory', action: 'read' },
  { resource: 'report', action: 'read' },
]);

const supervisorUser = makeUser([
  { resource: 'work_order', action: 'read' },
  { resource: 'asset', action: 'read' },
  { resource: 'report', action: 'read' },
]);

const technicianUser = makeUser([{ resource: 'work_order', action: 'read' }]);

const adminUser = { ...makeUser([{ resource: '*', action: '*' }]), accessScope: 'Company' };

const financeUser = makeUser([
  { resource: 'invoice', action: 'read' },
  { resource: 'report', action: 'read' },
]);

const storekeeperUser = makeUser([
  { resource: 'inventory', action: 'read' },
  { resource: 'stock', action: 'issue' },
]);

// ─── Shared fetch mock response ───────────────────────────────────────────────
const emptyMetrics = {
  source: 'database',
  workOrders: {
    total: 0, open: 0, assigned: 0, inProgress: 0, onHold: 0,
    completed: 0, overdue: 0, pendingRequests: 0, criticalOpen: 0, unassigned: 0,
  },
  technicianWorkload: [],
  pendingApprovals: [],
  operationalAlerts: [],
  maintenancePlans: { total: 0, active: 0, overdueCount: 0, dueSoonCount: 0 },
  assetSummary: { total: 0, down: 0, inMaintenance: 0 },
  backlogAgeing: { days0_7: 0, days8_14: 0, days15_30: 0, days31_60: 0, over60: 0 },
  slaMetrics: { totalTracked: 0, activeBreaches: 0, complianceRate: 100 },
  recentActivity: [],
};

const richMetrics = {
  ...emptyMetrics,
  workOrders: {
    total: 25, open: 8, assigned: 5, inProgress: 7, onHold: 2,
    completed: 3, overdue: 4, pendingRequests: 3, criticalOpen: 2, unassigned: 3,
  },
  technicianWorkload: [
    { userId: 'u1', name: 'Kofi Asante', assignedCount: 4, inProgressCount: 2, completedCount: 1, overdueCount: 1 },
    { userId: 'u2', name: 'Ama Boateng', assignedCount: 3, inProgressCount: 1, completedCount: 2, overdueCount: 0 },
  ],
  pendingApprovals: [
    {
      id: 'apr-1', entityType: 'purchase requisition', entityId: 'pr-1',
      requestAmount: '5000.00', currentStepOrder: 1, totalSteps: 2,
      createdAt: new Date().toISOString(), makerName: 'Yaw Darko', stepName: 'Manager Approval',
    },
  ],
  operationalAlerts: [
    {
      id: 'wo-1', type: 'overdue' as const, workOrderNumber: 'WO-0042',
      title: 'Generator PM overdue', priority: 'CRITICAL', status: 'IN_PROGRESS',
      assetName: 'Generator A', locationName: 'Block C', plannedEnd: new Date().toISOString(),
      createdAt: new Date().toISOString(), href: '/work-orders/wo-1',
    },
    {
      id: 'wo-2', type: 'unassigned' as const, workOrderNumber: 'WO-0043',
      title: 'HVAC inspection', priority: 'HIGH', status: 'OPEN',
      createdAt: new Date().toISOString(), href: '/work-orders/wo-2',
    },
  ],
  maintenancePlans: { total: 15, active: 12, overdueCount: 2, dueSoonCount: 3 },
  assetSummary: { total: 48, down: 2, inMaintenance: 5 },
  backlogAgeing: { days0_7: 5, days8_14: 3, days15_30: 2, days31_60: 1, over60: 0 },
  slaMetrics: { totalTracked: 25, activeBreaches: 1, complianceRate: 96 },
  recentActivity: [
    { id: 'act-1', title: 'Work order created', description: 'WO-0042 created', timestamp: new Date().toISOString(), type: 'work_order', referenceNumber: 'WO-0042' }
  ],
};

// ─── Import components under test ─────────────────────────────────────────────
// Dynamic import to allow vi.mock to settle first
let ManagerDashboardView: React.FC;
let DashboardPage: React.ComponentType;

beforeEach(async () => {
  vi.resetModules();
  const mgr = await import('../components/dashboard/ManagerDashboardView');
  ManagerDashboardView = mgr.ManagerDashboardView;
  const pg = await import('../app/dashboard/page');
  DashboardPage = pg.default;
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ─────────────────────────────────────────────────────────────────────────────
// 1. ManagerDashboardView — rendering
// ─────────────────────────────────────────────────────────────────────────────

describe('ManagerDashboardView — Rendering', () => {
  it('1. Shows loading skeleton while fetch is in flight', async () => {
    mockUseAuth.mockReturnValue({
      user: managerUser,
      loading: false,
      selectedBranch: 'Accra HQ',
      logout: vi.fn(),
    });

    // Never resolves — stays loading
    global.fetch = vi.fn(() => new Promise(() => {})) as any;

    const { container } = render(<ManagerDashboardView />);
    // skeleton uses animate-pulse
    expect(container.querySelector('.animate-pulse')).not.toBeNull();
  });

  it('2. Renders hero header with user name and role', async () => {
    mockUseAuth.mockReturnValue({
      user: managerUser,
      loading: false,
      selectedBranch: 'Accra HQ',
      logout: vi.fn(),
    });

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => emptyMetrics,
    }) as any;

    await act(async () => { render(<ManagerDashboardView />); });
    await waitFor(() => {
      expect(screen.getByText(/welcome, kwame/i)).toBeTruthy();
    });
  });

  it('3. Renders KPI cards when metrics load successfully', async () => {
    mockUseAuth.mockReturnValue({
      user: managerUser,
      loading: false,
      selectedBranch: 'Accra HQ',
      logout: vi.fn(),
    });

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => richMetrics,
    }) as any;

    await act(async () => { render(<ManagerDashboardView />); });
    await waitFor(() => {
      expect(screen.getByText('Active Work Orders')).toBeTruthy();
      expect(screen.getByText('Overdue Work Orders')).toBeTruthy();
      expect(screen.getByText('Pending Service Requests')).toBeTruthy();
    });
  });

  it('4. Shows error banner when API returns non-OK status', async () => {
    mockUseAuth.mockReturnValue({
      user: managerUser,
      loading: false,
      selectedBranch: 'Accra HQ',
      logout: vi.fn(),
    });

    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({ message: 'Internal server error' }),
    }) as any;

    await act(async () => { render(<ManagerDashboardView />); });
    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeTruthy();
      expect(screen.getByText(/metrics unavailable/i)).toBeTruthy();
    });
  });

  it('5. Renders operational alerts section with alert items', async () => {
    mockUseAuth.mockReturnValue({
      user: managerUser,
      loading: false,
      selectedBranch: 'Accra HQ',
      logout: vi.fn(),
    });

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => richMetrics,
    }) as any;

    await act(async () => { render(<ManagerDashboardView />); });
    await waitFor(() => {
      expect(screen.getByText('WO-0042')).toBeTruthy();
      expect(screen.getByText('Generator PM overdue')).toBeTruthy();
    });
  });

  it('6. Renders empty state for alerts when no issues exist', async () => {
    mockUseAuth.mockReturnValue({
      user: managerUser,
      loading: false,
      selectedBranch: 'Accra HQ',
      logout: vi.fn(),
    });

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => emptyMetrics,
    }) as any;

    await act(async () => { render(<ManagerDashboardView />); });
    await waitFor(() => {
      expect(screen.getByText(/no operational alerts/i)).toBeTruthy();
    });
  });

  it('7. Renders technician workload when technicians have assignments', async () => {
    mockUseAuth.mockReturnValue({
      user: managerUser,
      loading: false,
      selectedBranch: 'Accra HQ',
      logout: vi.fn(),
    });

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => richMetrics,
    }) as any;

    await act(async () => { render(<ManagerDashboardView />); });
    await waitFor(() => {
      expect(screen.getByText('Kofi Asante')).toBeTruthy();
      expect(screen.getByText('Ama Boateng')).toBeTruthy();
    });
  });

  it('8. Renders empty technician state when no assignments exist', async () => {
    mockUseAuth.mockReturnValue({
      user: managerUser,
      loading: false,
      selectedBranch: 'Accra HQ',
      logout: vi.fn(),
    });

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => emptyMetrics,
    }) as any;

    await act(async () => { render(<ManagerDashboardView />); });
    await waitFor(() => {
      expect(screen.getByText(/no active assignments/i)).toBeTruthy();
    });
  });

  it('9. Renders pending approvals when items exist', async () => {
    mockUseAuth.mockReturnValue({
      user: managerUser,
      loading: false,
      selectedBranch: 'Accra HQ',
      logout: vi.fn(),
    });

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => richMetrics,
    }) as any;

    await act(async () => { render(<ManagerDashboardView />); });
    await waitFor(() => {
      expect(screen.getByText(/yaw darko/i)).toBeTruthy();
      expect(screen.getByText(/manager approval/i)).toBeTruthy();
    });
  });

  it('10. Renders empty approvals state when no pending approvals', async () => {
    mockUseAuth.mockReturnValue({
      user: managerUser,
      loading: false,
      selectedBranch: 'Accra HQ',
      logout: vi.fn(),
    });

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => emptyMetrics,
    }) as any;

    await act(async () => { render(<ManagerDashboardView />); });
    await waitFor(() => {
      expect(screen.getByText(/no pending approvals/i)).toBeTruthy();
    });
  });

  it('11. Displays maker-checker notice in approvals section', async () => {
    mockUseAuth.mockReturnValue({
      user: managerUser,
      loading: false,
      selectedBranch: 'Accra HQ',
      logout: vi.fn(),
    });

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => richMetrics,
    }) as any;

    await act(async () => { render(<ManagerDashboardView />); });
    await waitFor(() => {
      expect(screen.getByText(/cannot approve requests you submitted/i)).toBeTruthy();
    });
  });

  it('12. Quick access links point to correct routes', async () => {
    mockUseAuth.mockReturnValue({
      user: managerUser,
      loading: false,
      selectedBranch: 'Accra HQ',
      logout: vi.fn(),
    });

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => emptyMetrics,
    }) as any;

    await act(async () => { render(<ManagerDashboardView />); });
    await waitFor(() => {
      const workOrderLinks = screen.getAllByRole('link');
      const hrefs = workOrderLinks.map((el) => el.getAttribute('href'));
      expect(hrefs).toContain('/work-orders');
      expect(hrefs).toContain('/requests');
      expect(hrefs).toContain('/preventive');
      expect(hrefs).toContain('/workers');
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. Dashboard routing — permission-based
// ─────────────────────────────────────────────────────────────────────────────

describe('DashboardPage — Permission-based routing', () => {
  it('13. Admin user (wildcard *:*) sees DashboardView (admin dashboard preserved)', async () => {
    mockUseAuth.mockReturnValue({
      user: adminUser,
      loading: false,
      selectedBranch: 'Accra HQ',
      logout: vi.fn(),
    });

    // DashboardView fetches /api/dashboard/stats
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        source: 'database', isDemoData: false,
        organization: { companyName: 'ZemiFix Ltd', baseCurrency: 'GHS', accessScope: 'Company', totalBranches: 2, totalDepartments: 4, totalStaff: 20, branchesList: [], departmentsList: [] },
        workOrders: { total: 0, open: 0, assigned: 0, inProgress: 0, onHold: 0, completed: 0, overdue: 0, pendingRequests: 0 },
        assets: { total: 0, operational: 0, down: 0, inMaintenance: 0, availabilityPercentage: 100, totalDowntimeMinutes: 0 },
        inventory: { totalPartCount: 0, totalStockValue: 0, lowStockCount: 0 },
        procurement: { pendingRequisitions: 0, issuedPurchaseOrders: 0, totalProcurementSpend: 0 },
        slaAndContracts: { activeContracts: 0, slaBreachCount: 0 },
        finance: { totalInvoicedAmount: 0, paidAmount: 0, outstandingReceivables: 0, internalRechargesCount: 0, totalInternalRechargeAmount: 0 },
        recentWorkOrders: [],
      }),
    }) as any;

    await act(async () => { render(<DashboardPage />); });

    await waitFor(() => {
      // DashboardView renders "Operations overview" in its hero section
      expect(screen.getByText(/operations overview/i)).toBeTruthy();
    });
  });

  it('14. Manager user (work_order:read + others) sees ManagerDashboardView', async () => {
    mockUseAuth.mockReturnValue({
      user: managerUser,
      loading: false,
      selectedBranch: 'Accra HQ',
      logout: vi.fn(),
    });

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => emptyMetrics,
    }) as any;

    await act(async () => { render(<DashboardPage />); });

    await waitFor(() => {
      // ManagerDashboardView renders "Manager operational workspace"
      expect(screen.getByText(/operational workspace/i)).toBeTruthy();
    });
  });

  it('15. Supervisor user (work_order:read + asset:read + report:read) sees ManagerDashboardView', async () => {
    mockUseAuth.mockReturnValue({
      user: supervisorUser,
      loading: false,
      selectedBranch: 'Accra HQ',
      logout: vi.fn(),
    });

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => emptyMetrics,
    }) as any;

    await act(async () => { render(<DashboardPage />); });

    await waitFor(() => {
      expect(screen.getByText(/operational workspace/i)).toBeTruthy();
    });
  });

  it('16. Technician user (work_order:read only) sees ManagerDashboardView (narrowed scope)', async () => {
    mockUseAuth.mockReturnValue({
      user: technicianUser,
      loading: false,
      selectedBranch: 'Accra HQ',
      logout: vi.fn(),
    });

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => emptyMetrics,
    }) as any;

    await act(async () => { render(<DashboardPage />); });

    await waitFor(() => {
      expect(screen.getByText(/operational workspace/i)).toBeTruthy();
    });
  });

  it('17. Finance user (invoice:read + report:read, NO work_order:read) sees DashboardView default', async () => {
    mockUseAuth.mockReturnValue({
      user: financeUser,
      loading: false,
      selectedBranch: 'Accra HQ',
      logout: vi.fn(),
    });

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        source: 'database', isDemoData: false,
        organization: { companyName: 'ZemiFix Ltd', baseCurrency: 'GHS', accessScope: 'Company', totalBranches: 2, totalDepartments: 4, totalStaff: 20, branchesList: [], departmentsList: [] },
        workOrders: { total: 0, open: 0, assigned: 0, inProgress: 0, onHold: 0, completed: 0, overdue: 0, pendingRequests: 0 },
        assets: { total: 0, operational: 0, down: 0, inMaintenance: 0, availabilityPercentage: 100, totalDowntimeMinutes: 0 },
        inventory: { totalPartCount: 0, totalStockValue: 0, lowStockCount: 0 },
        procurement: { pendingRequisitions: 0, issuedPurchaseOrders: 0, totalProcurementSpend: 0 },
        slaAndContracts: { activeContracts: 0, slaBreachCount: 0 },
        finance: { totalInvoicedAmount: 0, paidAmount: 0, outstandingReceivables: 0, internalRechargesCount: 0, totalInternalRechargeAmount: 0 },
        recentWorkOrders: [],
      }),
    }) as any;

    await act(async () => { render(<DashboardPage />); });

    await waitFor(() => {
      // DashboardView renders "Operations overview" in its hero
      expect(screen.getByText(/operations overview/i)).toBeTruthy();
    });
  });

  it('18. Storekeeper user (inventory:read, NO work_order:read) sees DashboardView default', async () => {
    mockUseAuth.mockReturnValue({
      user: storekeeperUser,
      loading: false,
      selectedBranch: 'Accra HQ',
      logout: vi.fn(),
    });

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        source: 'database', isDemoData: false,
        organization: { companyName: 'ZemiFix Ltd', baseCurrency: 'GHS', accessScope: 'Company', totalBranches: 2, totalDepartments: 4, totalStaff: 20, branchesList: [], departmentsList: [] },
        workOrders: { total: 0, open: 0, assigned: 0, inProgress: 0, onHold: 0, completed: 0, overdue: 0, pendingRequests: 0 },
        assets: { total: 0, operational: 0, down: 0, inMaintenance: 0, availabilityPercentage: 100, totalDowntimeMinutes: 0 },
        inventory: { totalPartCount: 0, totalStockValue: 0, lowStockCount: 0 },
        procurement: { pendingRequisitions: 0, issuedPurchaseOrders: 0, totalProcurementSpend: 0 },
        slaAndContracts: { activeContracts: 0, slaBreachCount: 0 },
        finance: { totalInvoicedAmount: 0, paidAmount: 0, outstandingReceivables: 0, internalRechargesCount: 0, totalInternalRechargeAmount: 0 },
        recentWorkOrders: [],
      }),
    }) as any;

    await act(async () => { render(<DashboardPage />); });

    await waitFor(() => {
      expect(screen.getByText(/operations overview/i)).toBeTruthy();
    });
  });

  it('19. Multi-responsibility user (work_order:read + invoice:read) sees ManagerDashboardView', async () => {
    const multiUser = makeUser([
      { resource: 'work_order', action: 'read' },
      { resource: 'invoice', action: 'read' },
    ]);

    mockUseAuth.mockReturnValue({
      user: multiUser,
      loading: false,
      selectedBranch: 'Accra HQ',
      logout: vi.fn(),
    });

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => emptyMetrics,
    }) as any;

    await act(async () => { render(<DashboardPage />); });

    await waitFor(() => {
      expect(screen.getByText(/operational workspace/i)).toBeTruthy();
    });
  });

  it('20. Unauthenticated (null user) renders DashboardView default', async () => {
    mockUseAuth.mockReturnValue({
      user: null,
      loading: false,
      selectedBranch: 'Accra HQ',
      logout: vi.fn(),
    });

    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({ error: 'Unauthorized' }),
    }) as any;

    await act(async () => { render(<DashboardPage />); });

    // DashboardView renders its own error/empty state — does not crash
    expect(document.body).toBeTruthy();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. Permission boundary — ManagerDashboardView API guard
// ─────────────────────────────────────────────────────────────────────────────

describe('ManagerDashboardView — API permission boundary', () => {
  it('21. Shows error state when API returns 403 (insufficient permission)', async () => {
    mockUseAuth.mockReturnValue({
      user: financeUser,
      loading: false,
      selectedBranch: 'Accra HQ',
      logout: vi.fn(),
    });

    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({ error: 'Forbidden', message: 'work_order:read permission required.' }),
    }) as any;

    await act(async () => { render(<ManagerDashboardView />); });

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeTruthy();
      expect(screen.getByText(/metrics unavailable/i)).toBeTruthy();
    });
  });

  it('22. No role-name bypass: role name alone without work_order:read does not route to ManagerDashboardView', async () => {
    // A user whose role.name = "Manager" but has no work_order:read permission
    const managerRoleNoPerms = {
      id: 'usr-no-perm',
      name: 'Restricted Manager',
      email: 'restricted@zemifix.local',
      role: {
        id: 'role-mgr',
        name: 'Manager', // role name is Manager but...
        permissions: [{ permission: { resource: 'report', action: 'read' } }] // has report:read but no work_order:read
      },
      branch: { id: 'br-hq', name: 'HQ', code: 'HQ', type: 'HeadOffice' },
      accessScope: 'Branch',
    };

    mockUseAuth.mockReturnValue({
      user: managerRoleNoPerms,
      loading: false,
      selectedBranch: 'Accra HQ',
      logout: vi.fn(),
    });

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        source: 'database', isDemoData: false,
        organization: { companyName: 'ZemiFix Ltd', baseCurrency: 'GHS', accessScope: 'Company', totalBranches: 2, totalDepartments: 4, totalStaff: 20, branchesList: [], departmentsList: [] },
        workOrders: { total: 0, open: 0, assigned: 0, inProgress: 0, onHold: 0, completed: 0, overdue: 0, pendingRequests: 0 },
        assets: { total: 0, operational: 0, down: 0, inMaintenance: 0, availabilityPercentage: 100, totalDowntimeMinutes: 0 },
        inventory: { totalPartCount: 0, totalStockValue: 0, lowStockCount: 0 },
        procurement: { pendingRequisitions: 0, issuedPurchaseOrders: 0, totalProcurementSpend: 0 },
        slaAndContracts: { activeContracts: 0, slaBreachCount: 0 },
        finance: { totalInvoicedAmount: 0, paidAmount: 0, outstandingReceivables: 0, internalRechargesCount: 0, totalInternalRechargeAmount: 0 },
        recentWorkOrders: [],
      }),
    }) as any;

    await act(async () => { render(<DashboardPage />); });

    await waitFor(() => {
      // Should see DashboardView (operations overview), NOT Manager workspace
      expect(screen.getByText(/operations overview/i)).toBeTruthy();
      expect(screen.queryByText(/operational workspace/i)).toBeNull();
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. Supervisor-specific scope behaviour
// ─────────────────────────────────────────────────────────────────────────────

describe('ManagerDashboardView — Supervisor user rendering', () => {
  it('23. Supervisor sees workspace with correct role label', async () => {
    const sup = {
      ...supervisorUser,
      role: { ...supervisorUser.role, name: 'Supervisor' },
    };

    mockUseAuth.mockReturnValue({
      user: sup,
      loading: false,
      selectedBranch: 'Accra HQ',
      logout: vi.fn(),
    });

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => emptyMetrics,
    }) as any;

    await act(async () => { render(<ManagerDashboardView />); });

    await waitFor(() => {
      expect(screen.getByText(/supervisor operational workspace/i)).toBeTruthy();
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. Admin dashboard preservation
// ─────────────────────────────────────────────────────────────────────────────

describe('Admin dashboard preservation', () => {
  it('24. Admin wildcard user does NOT see ManagerDashboardView', async () => {
    mockUseAuth.mockReturnValue({
      user: adminUser,
      loading: false,
      selectedBranch: 'Accra HQ',
      logout: vi.fn(),
    });

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        source: 'database', isDemoData: false,
        organization: { companyName: 'ZemiFix Ltd', baseCurrency: 'GHS', accessScope: 'Company', totalBranches: 2, totalDepartments: 4, totalStaff: 20, branchesList: [], departmentsList: [] },
        workOrders: { total: 0, open: 0, assigned: 0, inProgress: 0, onHold: 0, completed: 0, overdue: 0, pendingRequests: 0 },
        assets: { total: 0, operational: 0, down: 0, inMaintenance: 0, availabilityPercentage: 100, totalDowntimeMinutes: 0 },
        inventory: { totalPartCount: 0, totalStockValue: 0, lowStockCount: 0 },
        procurement: { pendingRequisitions: 0, issuedPurchaseOrders: 0, totalProcurementSpend: 0 },
        slaAndContracts: { activeContracts: 0, slaBreachCount: 0 },
        finance: { totalInvoicedAmount: 0, paidAmount: 0, outstandingReceivables: 0, internalRechargesCount: 0, totalInternalRechargeAmount: 0 },
        recentWorkOrders: [],
      }),
    }) as any;

    await act(async () => { render(<DashboardPage />); });

    await waitFor(() => {
      // Admin sees DashboardView, NOT Manager workspace
      expect(screen.getByText(/operations overview/i)).toBeTruthy();
      expect(screen.queryByText(/operational workspace/i)).toBeNull();
    });
  });

  it('25. DashboardView still mounts and renders without crashing', async () => {
    mockUseAuth.mockReturnValue({
      user: adminUser,
      loading: false,
      selectedBranch: 'Accra HQ',
      logout: vi.fn(),
    });

    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({ error: 'Service unavailable' }),
    }) as any;

    await act(async () => {
      const { DashboardView } = await import('../components/dashboard/DashboardView');
      render(<DashboardView />);
    });

    // Should show error banner, not crash
    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeTruthy();
    });
  });
});
