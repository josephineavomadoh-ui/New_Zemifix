// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  canUserAccessNavItem,
  facilityNavigationGroups,
  contractorNavigationGroups,
  combinedNavigationGroups,
  type AppSidebarUser,
  type NavItem,
} from '../components/layout/AppSidebar';
import type { UserSession } from '../lib/auth-context';

describe('AppSidebar Permission Reconciliation & Verification (Phase 1D + 1E)', () => {
  const getVisibleItems = (
    user: UserSession | AppSidebarUser | null | undefined,
    groups = facilityNavigationGroups
  ) => {
    return groups
      .map((g) => ({
        group: g.group,
        items: g.items.filter((item) => canUserAccessNavItem(user, item)),
      }))
      .filter((g) => g.items.length > 0);
  };

  const getVisibleItemNames = (
    user: UserSession | AppSidebarUser | null | undefined,
    groups = facilityNavigationGroups
  ) => {
    return getVisibleItems(user, groups).flatMap((g) => g.items.map((i) => i.name));
  };

  const getVisibleGroupNames = (
    user: UserSession | AppSidebarUser | null | undefined,
    groups = facilityNavigationGroups
  ) => {
    return getVisibleItems(user, groups).map((g) => g.group);
  };

  /* ------------------------------------------------------------------ */
  /* 1. Authoritative Backend Permission Catalogue Conformance          */
  /* ------------------------------------------------------------------ */

  it('1. Authoritative catalogue check: All navigation permissions conform to verified backend permissions', () => {
    const verifiedBackendResources = new Set([
      'work_order',
      'asset',
      'inventory',
      'stock',
      'invoice',
      'settings',
      'audit',
      'report',
      '*',
    ]);

    const verifiedBackendActions = new Set([
      'read',
      'create',
      'update',
      'issue',
      'approve_issue',
      'approve',
      'verify',
      'close',
      'manage',
      '*',
    ]);

    // Inspect all facility navigation items
    for (const group of facilityNavigationGroups) {
      for (const item of group.items) {
        if (!item.permission) continue; // Public to staff (e.g. Dashboard)
        for (const reqPerm of item.permission.permissions) {
          expect(
            verifiedBackendResources.has(reqPerm.resource),
            `Resource "${reqPerm.resource}" in "${item.name}" must be an authoritative backend resource`
          ).toBe(true);

          if (reqPerm.action) {
            expect(
              verifiedBackendActions.has(reqPerm.action),
              `Action "${reqPerm.action}" in "${item.name}" must be an authoritative backend action`
            ).toBe(true);
          }
        }
      }
    }
  });

  /* ------------------------------------------------------------------ */
  /* 2. Nine Standard Roles Coverage with Authoritative Permissions      */
  /* ------------------------------------------------------------------ */

  it('2. Admin with full authoritative permissions sees all facility navigation groups and items', () => {
    const adminUser: UserSession = {
      id: 'usr-admin-1',
      name: 'Nana Yaw Addo',
      email: 'admin@zemifix.local',
      role: {
        id: 'role-admin',
        name: 'Admin',
        permissions: [
          { permission: { resource: '*', action: '*' } },
        ],
      },
      branch: { id: 'br-hq', name: 'HQ', code: 'HQ-ACC', type: 'HeadOffice' },
      accessScope: 'Company',
    };

    const groupNames = getVisibleGroupNames(adminUser);
    const itemNames = getVisibleItemNames(adminUser);

    expect(groupNames).toContain('Operations');
    expect(groupNames).toContain('Assets');
    expect(groupNames).toContain('Inventory');
    expect(groupNames).toContain('Procurement');
    expect(groupNames).toContain('Finance');
    expect(groupNames).toContain('Organization');
    expect(groupNames).toContain('Administration');
    expect(groupNames).toContain('Commercial');

    expect(itemNames).toContain('Dashboard');
    expect(itemNames).toContain('Work Orders');
    expect(itemNames).toContain('Asset Register');
    expect(itemNames).toContain('Parts');
    expect(itemNames).toContain('Stores');
    expect(itemNames).toContain('Requisitions');
    expect(itemNames).toContain('Invoices');
    expect(itemNames).toContain('Financial Reports');
    expect(itemNames).toContain('Settings');
    expect(itemNames).toContain('Users & Roles');
    expect(itemNames).toContain('Worker Monitoring');
    expect(itemNames).toContain('Data Import');
  });

  it('3. Manager sees operations, assets, inventory, procurement, finance, org, admin, and commercial items', () => {
    const managerUser: UserSession = {
      id: 'usr-mgr-1',
      name: 'Kwesi Appiah',
      email: 'k.appiah@zemifix.local',
      role: {
        id: 'role-mgr',
        name: 'Manager',
        permissions: [
          { permission: { resource: 'work_order', action: 'read' } },
          { permission: { resource: 'asset', action: 'read' } },
          { permission: { resource: 'inventory', action: 'read' } },
          { permission: { resource: 'invoice', action: 'read' } },
          { permission: { resource: 'settings', action: 'manage' } },
          { permission: { resource: 'report', action: 'read' } },
        ],
      },
      branch: { id: 'br-hq', name: 'HQ', code: 'HQ-ACC', type: 'HeadOffice' },
      accessScope: 'Branch',
    };

    const groupNames = getVisibleGroupNames(managerUser);
    const itemNames = getVisibleItemNames(managerUser);

    expect(groupNames).toContain('Operations');
    expect(groupNames).toContain('Assets');
    expect(groupNames).toContain('Inventory');
    expect(groupNames).toContain('Procurement');
    expect(groupNames).toContain('Finance');
    expect(groupNames).toContain('Organization');
    expect(groupNames).toContain('Administration');
    expect(groupNames).toContain('Commercial');

    expect(itemNames).toContain('Work Orders');
    expect(itemNames).toContain('Asset Register');
    expect(itemNames).toContain('Parts');
    expect(itemNames).toContain('Purchase Orders');
    expect(itemNames).toContain('Invoices');
    expect(itemNames).toContain('Financial Reports');
    expect(itemNames).toContain('Settings');
  });

  it('4. Supervisor sees work orders, assets, service requests, PM, calendar, and reports, but NOT Settings or Stores', () => {
    const supervisorUser: UserSession = {
      id: 'usr-sup-1',
      name: 'Kofi Mensah',
      email: 'k.mensah@zemifix.local',
      role: {
        id: 'role-sup',
        name: 'Supervisor',
        permissions: [
          { permission: { resource: 'work_order', action: 'read' } },
          { permission: { resource: 'asset', action: 'read' } },
          { permission: { resource: 'report', action: 'read' } },
        ],
      },
      branch: { id: 'br-hq', name: 'HQ', code: 'HQ-ACC', type: 'HeadOffice' },
      accessScope: 'Branch',
    };

    const groupNames = getVisibleGroupNames(supervisorUser);
    const itemNames = getVisibleItemNames(supervisorUser);

    expect(groupNames).toContain('Operations');
    expect(groupNames).toContain('Assets');
    expect(groupNames).toContain('Administration');

    expect(itemNames).toContain('Work Orders');
    expect(itemNames).toContain('Service Requests');
    expect(itemNames).toContain('Preventive Maintenance');
    expect(itemNames).toContain('Calendar');
    expect(itemNames).toContain('Asset Register');
    expect(itemNames).toContain('Reports');

    // Negative assertions
    expect(groupNames).not.toContain('Inventory');
    expect(groupNames).not.toContain('Procurement');
    expect(groupNames).not.toContain('Organization');
    expect(groupNames).not.toContain('Commercial');
    expect(itemNames).not.toContain('Settings');
    expect(itemNames).not.toContain('Users & Roles');
    expect(itemNames).not.toContain('Stores');
    expect(itemNames).not.toContain('Invoices');
  });

  it('5. Planner sees Operations and Assets only, but NOT Finance, Inventory, or Settings', () => {
    const plannerUser: UserSession = {
      id: 'usr-plan-1',
      name: 'Efua Appiah',
      email: 'e.appiah@zemifix.local',
      role: {
        id: 'role-plan',
        name: 'Planner',
        permissions: [
          { permission: { resource: 'work_order', action: 'read' } },
          { permission: { resource: 'asset', action: 'read' } },
        ],
      },
      branch: { id: 'br-hq', name: 'HQ', code: 'HQ-ACC', type: 'HeadOffice' },
      accessScope: 'Branch',
    };

    const groupNames = getVisibleGroupNames(plannerUser);
    const itemNames = getVisibleItemNames(plannerUser);

    expect(groupNames).toContain('Operations');
    expect(groupNames).toContain('Assets');

    expect(itemNames).toContain('Work Orders');
    expect(itemNames).toContain('Service Requests');
    expect(itemNames).toContain('Preventive Maintenance');
    expect(itemNames).toContain('Calendar');
    expect(itemNames).toContain('Asset Register');

    // Negative assertions
    expect(groupNames).not.toContain('Inventory');
    expect(groupNames).not.toContain('Procurement');
    expect(groupNames).not.toContain('Finance');
    expect(groupNames).not.toContain('Organization');
    expect(itemNames).not.toContain('Settings');
    expect(itemNames).not.toContain('Invoices');
  });

  it('6. Technician sees Operations only (Work Orders, Calendar, PM, Requests) and Dashboard', () => {
    const technicianUser: UserSession = {
      id: 'usr-tech-1',
      name: 'Yaw Boateng',
      email: 'y.boateng@zemifix.local',
      role: {
        id: 'role-tech',
        name: 'Technician',
        permissions: [
          { permission: { resource: 'work_order', action: 'read' } },
        ],
      },
      branch: { id: 'br-hq', name: 'HQ', code: 'HQ-ACC', type: 'HeadOffice' },
      accessScope: 'Self',
    };

    const groupNames = getVisibleGroupNames(technicianUser);
    const itemNames = getVisibleItemNames(technicianUser);

    expect(groupNames).toEqual(['Operations']);
    expect(itemNames).toContain('Dashboard');
    expect(itemNames).toContain('Work Orders');
    expect(itemNames).toContain('Service Requests');
    expect(itemNames).toContain('Preventive Maintenance');
    expect(itemNames).toContain('Calendar');

    // Must NOT see Assets, Inventory, Procurement, Finance, Org, Admin
    expect(groupNames).not.toContain('Assets');
    expect(groupNames).not.toContain('Inventory');
    expect(groupNames).not.toContain('Procurement');
    expect(groupNames).not.toContain('Finance');
    expect(groupNames).not.toContain('Organization');
    expect(itemNames).not.toContain('Asset Register');
    expect(itemNames).not.toContain('Settings');
    expect(itemNames).not.toContain('Invoices');
  });

  it('7. Storekeeper with inventory:read + stock:issue sees Inventory AND Procurement, but NOT Work Orders, Assets, Finance, or Settings', () => {
    const storekeeperUser: UserSession = {
      id: 'usr-store-1',
      name: 'Kojo Mensah',
      email: 'k.mensah@zemifix.local',
      role: {
        id: 'role-store',
        name: 'Storekeeper',
        permissions: [
          { permission: { resource: 'inventory', action: 'read' } },
          { permission: { resource: 'stock', action: 'issue' } },
        ],
      },
      branch: { id: 'br-hq', name: 'HQ', code: 'HQ-ACC', type: 'HeadOffice' },
      accessScope: 'Branch',
    };

    const groupNames = getVisibleGroupNames(storekeeperUser);
    const itemNames = getVisibleItemNames(storekeeperUser);

    expect(groupNames).toContain('Operations'); // Holds Dashboard
    expect(groupNames).toContain('Inventory');
    expect(groupNames).toContain('Procurement');

    expect(itemNames).toContain('Dashboard');
    expect(itemNames).toContain('Parts');
    expect(itemNames).toContain('Stores');
    expect(itemNames).toContain('Stock Transactions');
    expect(itemNames).toContain('Reorder Queue');
    expect(itemNames).toContain('Returns');
    expect(itemNames).toContain('Requisitions');
    expect(itemNames).toContain('Purchase Orders');
    expect(itemNames).toContain('Receipts');
    expect(itemNames).toContain('Suppliers');

    // Negative assertions
    expect(itemNames).not.toContain('Work Orders');
    expect(itemNames).not.toContain('Asset Register');
    expect(groupNames).not.toContain('Finance');
    expect(groupNames).not.toContain('Organization');
    expect(itemNames).not.toContain('Settings');
    expect(itemNames).not.toContain('Users & Roles');
    expect(itemNames).not.toContain('Invoices');
  });

  it('8. Finance user sees Finance, Commercial, and Reports, but NOT Inventory Stores or Worker Monitoring', () => {
    const financeUser: UserSession = {
      id: 'usr-fin-1',
      name: 'Abena Osei',
      email: 'a.osei@zemifix.local',
      role: {
        id: 'role-fin',
        name: 'Finance',
        permissions: [
          { permission: { resource: 'invoice', action: 'read' } },
          { permission: { resource: 'report', action: 'read' } },
        ],
      },
      branch: { id: 'br-hq', name: 'HQ', code: 'HQ-ACC', type: 'HeadOffice' },
      accessScope: 'Company',
    };

    const groupNames = getVisibleGroupNames(financeUser);
    const itemNames = getVisibleItemNames(financeUser);

    expect(groupNames).toContain('Operations'); // Holds Dashboard
    expect(groupNames).toContain('Finance');
    expect(groupNames).toContain('Administration');
    expect(groupNames).toContain('Commercial');

    expect(itemNames).toContain('Dashboard');
    expect(itemNames).toContain('Invoices');
    expect(itemNames).toContain('Financial Reports'); // Satisfies report:read AND invoice:read
    expect(itemNames).toContain('Reports');
    expect(itemNames).toContain('Customers');
    expect(itemNames).toContain('Contracts & SLA');

    // Negative assertions
    expect(groupNames).not.toContain('Inventory');
    expect(groupNames).not.toContain('Procurement');
    expect(itemNames).not.toContain('Stores');
    expect(itemNames).not.toContain('Parts');
    expect(itemNames).not.toContain('Worker Monitoring');
    expect(itemNames).not.toContain('Settings');
  });

  it('9. Cashier Inconsistency Corrected: Cashier sees Invoices ONLY, and is strictly EXCLUDED from Financial Reports', () => {
    const cashierUser: UserSession = {
      id: 'usr-cash-1',
      name: 'Akosua Darko',
      email: 'a.darko@zemifix.local',
      role: {
        id: 'role-cash',
        name: 'Cashier',
        permissions: [
          { permission: { resource: 'invoice', action: 'read' } },
          { permission: { resource: 'invoice', action: 'create' } },
        ],
      },
      branch: { id: 'br-hq', name: 'HQ', code: 'HQ-ACC', type: 'HeadOffice' },
      accessScope: 'Branch',
    };

    const groupNames = getVisibleGroupNames(cashierUser);
    const itemNames = getVisibleItemNames(cashierUser);

    // Cashier sees Invoices and Commercial billing entities
    expect(groupNames).toContain('Finance');
    expect(itemNames).toContain('Invoices');

    // CRITICAL CORRECTION: Financial Reports requires BOTH report:read AND invoice:read (mode: 'all')
    // Since Cashier lacks report:read, Financial Reports MUST NOT be visible!
    expect(itemNames).not.toContain('Financial Reports');

    // Negative assertions: cannot access inventory, procurement, admin, org
    expect(groupNames).not.toContain('Inventory');
    expect(groupNames).not.toContain('Procurement');
    expect(groupNames).not.toContain('Organization');
    expect(groupNames).not.toContain('Administration');
    expect(itemNames).not.toContain('Reports');
    expect(itemNames).not.toContain('Settings');
    expect(itemNames).not.toContain('Users & Roles');
    expect(itemNames).not.toContain('Worker Monitoring');
  });

  it('10. Auditor sees Reports, Worker Monitoring, and Stock Transactions via audit:read, but no mutation views', () => {
    const auditorUser: UserSession = {
      id: 'usr-aud-1',
      name: 'Samuel Mensah',
      email: 's.mensah@zemifix.local',
      role: {
        id: 'role-aud',
        name: 'Auditor',
        permissions: [
          { permission: { resource: 'audit', action: 'read' } },
          { permission: { resource: 'report', action: 'read' } },
        ],
      },
      branch: { id: 'br-hq', name: 'HQ', code: 'HQ-ACC', type: 'HeadOffice' },
      accessScope: 'Company',
    };

    const groupNames = getVisibleGroupNames(auditorUser);
    const itemNames = getVisibleItemNames(auditorUser);

    expect(groupNames).toContain('Operations');
    expect(groupNames).toContain('Inventory');
    expect(groupNames).toContain('Administration');

    expect(itemNames).toContain('Dashboard');
    expect(itemNames).toContain('Stock Transactions'); // Via audit:read
    expect(itemNames).toContain('Reports');
    expect(itemNames).toContain('Worker Monitoring');

    // Negative assertions: cannot see Financial Reports (requires invoice:read AND report:read), Settings, Users, Invoices
    expect(itemNames).not.toContain('Financial Reports');
    expect(itemNames).not.toContain('Settings');
    expect(itemNames).not.toContain('Users & Roles');
    expect(itemNames).not.toContain('Invoices');
    expect(itemNames).not.toContain('Work Orders');
  });

  /* ------------------------------------------------------------------ */
  /* 3. Multiple-Permission Semantics Verification                      */
  /* ------------------------------------------------------------------ */

  it('11. Multiple-Permission ALL mode: Grants access when ALL required permissions are satisfied', () => {
    const testItemAll: NavItem = {
      name: 'Audit Invoices',
      href: '/finance/audit',
      icon: () => null,
      permission: {
        permissions: [
          { resource: 'invoice', action: 'read' },
          { resource: 'audit', action: 'read' },
        ],
        mode: 'all',
      },
    };

    const userWithBoth: UserSession = {
      id: 'usr-both',
      name: 'Dual Officer',
      email: 'dual@zemifix.local',
      role: {
        id: 'role-dual',
        name: 'DualOfficer',
        permissions: [
          { permission: { resource: 'invoice', action: 'read' } },
          { permission: { resource: 'audit', action: 'read' } },
        ],
      },
      branch: { id: 'br-hq', name: 'HQ', code: 'HQ-ACC', type: 'HeadOffice' },
      accessScope: 'Company',
    };

    expect(canUserAccessNavItem(userWithBoth, testItemAll)).toBe(true);
  });

  it('12. Multiple-Permission ALL mode: Rejects access (fails closed) when only a subset of permissions is held', () => {
    const testItemAll: NavItem = {
      name: 'Audit Invoices',
      href: '/finance/audit',
      icon: () => null,
      permission: {
        permissions: [
          { resource: 'invoice', action: 'read' },
          { resource: 'audit', action: 'read' },
        ],
        mode: 'all',
      },
    };

    const userWithOne: UserSession = {
      id: 'usr-one',
      name: 'Single Officer',
      email: 'one@zemifix.local',
      role: {
        id: 'role-one',
        name: 'SingleOfficer',
        permissions: [
          { permission: { resource: 'invoice', action: 'read' } },
          // Missing audit:read!
        ],
      },
      branch: { id: 'br-hq', name: 'HQ', code: 'HQ-ACC', type: 'HeadOffice' },
      accessScope: 'Company',
    };

    expect(canUserAccessNavItem(userWithOne, testItemAll)).toBe(false);
  });

  it('13. Multiple-Permission ANY mode: Grants access when at least one permission is satisfied', () => {
    const testItemAny: NavItem = {
      name: 'Transactions View',
      href: '/inventory/transactions',
      icon: () => null,
      permission: {
        permissions: [
          { resource: 'inventory', action: 'read' },
          { resource: 'audit', action: 'read' },
        ],
        mode: 'any',
      },
    };

    const userWithAuditOnly: UserSession = {
      id: 'usr-aud-only',
      name: 'Auditor Only',
      email: 'aud@zemifix.local',
      role: {
        id: 'role-aud',
        name: 'Auditor',
        permissions: [
          { permission: { resource: 'audit', action: 'read' } },
        ],
      },
      branch: { id: 'br-hq', name: 'HQ', code: 'HQ-ACC', type: 'HeadOffice' },
      accessScope: 'Company',
    };

    expect(canUserAccessNavItem(userWithAuditOnly, testItemAny)).toBe(true);
  });

  it('14. Multiple-Permission ANY mode: Rejects access when none of the listed permissions are satisfied', () => {
    const testItemAny: NavItem = {
      name: 'Transactions View',
      href: '/inventory/transactions',
      icon: () => null,
      permission: {
        permissions: [
          { resource: 'inventory', action: 'read' },
          { resource: 'audit', action: 'read' },
        ],
        mode: 'any',
      },
    };

    const userWithUnrelated: UserSession = {
      id: 'usr-unrelated',
      name: 'Tech User',
      email: 'tech@zemifix.local',
      role: {
        id: 'role-tech',
        name: 'Technician',
        permissions: [
          { permission: { resource: 'work_order', action: 'read' } },
        ],
      },
      branch: { id: 'br-hq', name: 'HQ', code: 'HQ-ACC', type: 'HeadOffice' },
      accessScope: 'Self',
    };

    expect(canUserAccessNavItem(userWithUnrelated, testItemAny)).toBe(false);
  });

  /* ------------------------------------------------------------------ */
  /* 4. Multi-Responsibility & Custom Permission Scenarios              */
  /* ------------------------------------------------------------------ */

  it('15. Multi-responsibility: Storekeeper with additional work_order:read sees Inventory AND Operations', () => {
    const multiRoleUser: UserSession = {
      id: 'usr-multi-1',
      name: 'Kwame Dual-Role',
      email: 'k.dual@zemifix.local',
      role: {
        id: 'role-store',
        name: 'Storekeeper',
        permissions: [
          { permission: { resource: 'inventory', action: 'read' } },
          { permission: { resource: 'work_order', action: 'read' } },
        ],
      },
      branch: { id: 'br-acc', name: 'Accra HQ', code: 'HQ-ACC', type: 'HeadOffice' },
      accessScope: 'Branch',
    };

    const groupNames = getVisibleGroupNames(multiRoleUser);
    const itemNames = getVisibleItemNames(multiRoleUser);

    expect(groupNames).toContain('Inventory');
    expect(itemNames).toContain('Parts');
    expect(itemNames).toContain('Stores');

    expect(groupNames).toContain('Operations');
    expect(itemNames).toContain('Work Orders');
    expect(itemNames).toContain('Calendar');

    expect(itemNames).not.toContain('Settings');
    expect(itemNames).not.toContain('Users & Roles');
  });

  it('16. Multi-responsibility: Finance user with additional inventory:read sees Finance, Inventory AND Procurement', () => {
    const multiRoleFin: UserSession = {
      id: 'usr-multi-fin',
      name: 'Ama Multi-Fin',
      email: 'a.fin@zemifix.local',
      role: {
        id: 'role-fin',
        name: 'Finance',
        permissions: [
          { permission: { resource: 'invoice', action: 'read' } },
          { permission: { resource: 'inventory', action: 'read' } },
        ],
      },
      branch: { id: 'br-acc', name: 'Accra HQ', code: 'HQ-ACC', type: 'HeadOffice' },
      accessScope: 'Branch',
    };

    const groupNames = getVisibleGroupNames(multiRoleFin);
    const itemNames = getVisibleItemNames(multiRoleFin);

    expect(groupNames).toContain('Finance');
    expect(itemNames).toContain('Invoices');

    expect(groupNames).toContain('Inventory');
    expect(itemNames).toContain('Parts');
    expect(itemNames).toContain('Stores');

    // Phase 1E: inventory:read now grants Procurement visibility (stock:issue no longer triggers procurement)
    expect(groupNames).toContain('Procurement');
    expect(itemNames).toContain('Requisitions');
    expect(itemNames).toContain('Purchase Orders');

    expect(itemNames).not.toContain('Settings');
    expect(itemNames).not.toContain('Work Orders');
  });

  it('17. Multi-responsibility: Technician with additional asset:read sees Operations AND Assets', () => {
    const multiTech: UserSession = {
      id: 'usr-multi-tech',
      name: 'Kofi Tech-Asset',
      email: 'k.tech@zemifix.local',
      role: {
        id: 'role-tech',
        name: 'Technician',
        permissions: [
          { permission: { resource: 'work_order', action: 'read' } },
          { permission: { resource: 'asset', action: 'read' } },
        ],
      },
      branch: { id: 'br-acc', name: 'Accra HQ', code: 'HQ-ACC', type: 'HeadOffice' },
      accessScope: 'Self',
    };

    const groupNames = getVisibleGroupNames(multiTech);
    const itemNames = getVisibleItemNames(multiTech);

    expect(groupNames).toContain('Operations');
    expect(itemNames).toContain('Work Orders');

    expect(groupNames).toContain('Assets');
    expect(itemNames).toContain('Asset Register');
    expect(itemNames).toContain('Locations');

    expect(itemNames).not.toContain('Invoices');
    expect(itemNames).not.toContain('Settings');
  });

  it('18. Custom permission: Bespoke user with only report:read sees Dashboard and Reports only', () => {
    const bespokeUser: UserSession = {
      id: 'usr-custom-1',
      name: 'Custom Reporter',
      email: 'reporter@zemifix.local',
      role: {
        id: 'role-custom',
        name: 'CustomReporterRole',
        permissions: [
          { permission: { resource: 'report', action: 'read' } },
        ],
      },
      branch: { id: 'br-acc', name: 'Accra HQ', code: 'HQ-ACC', type: 'HeadOffice' },
      accessScope: 'Company',
    };

    const itemNames = getVisibleItemNames(bespokeUser);
    expect(itemNames).toContain('Dashboard');
    expect(itemNames).toContain('Reports');

    // Must NOT see Financial Reports (requires both report:read and invoice:read)
    expect(itemNames).not.toContain('Financial Reports');
    expect(itemNames).not.toContain('Work Orders');
    expect(itemNames).not.toContain('Asset Register');
    expect(itemNames).not.toContain('Settings');
    expect(itemNames).not.toContain('Parts');
  });

  it('19. Permissions revoked: Nominal Manager role with only asset:read granted sees ONLY Dashboard and Assets', () => {
    const revokedManager: UserSession = {
      id: 'usr-revoked-1',
      name: 'Restricted Manager',
      email: 'restricted@zemifix.local',
      role: {
        id: 'role-mgr',
        name: 'Manager', // Nominal role name is Manager
        permissions: [
          { permission: { resource: 'asset', action: 'read' } }, // BUT only asset:read is granted
        ],
      },
      branch: { id: 'br-acc', name: 'Accra HQ', code: 'HQ-ACC', type: 'HeadOffice' },
      accessScope: 'Branch',
    };

    const groupNames = getVisibleGroupNames(revokedManager);
    const itemNames = getVisibleItemNames(revokedManager);

    expect(groupNames).toEqual(['Operations', 'Assets']);
    expect(itemNames).toContain('Dashboard');
    expect(itemNames).toContain('Asset Register');

    expect(itemNames).not.toContain('Work Orders');
    expect(itemNames).not.toContain('Settings');
    expect(itemNames).not.toContain('Invoices');
    expect(itemNames).not.toContain('Parts');
  });

  /* ------------------------------------------------------------------ */
  /* 5. Executive Role Investigation Verification                        */
  /* ------------------------------------------------------------------ */

  it('20. Executive Role investigation: Simulated Executive with company-wide read-only permissions accesses read views without mutation bypass', () => {
    // Inspection established that "Executive" does NOT exist as a seeded backend role.
    // If represented as a custom executive permission bundle:
    const executiveUser: UserSession = {
      id: 'usr-exec-1',
      name: 'Chief Executive Officer',
      email: 'ceo@zemifix.local',
      role: {
        id: 'role-exec-custom',
        name: 'Executive',
        permissions: [
          { permission: { resource: 'report', action: 'read' } },
          { permission: { resource: 'audit', action: 'read' } },
          { permission: { resource: 'work_order', action: 'read' } },
          { permission: { resource: 'asset', action: 'read' } },
          { permission: { resource: 'inventory', action: 'read' } },
          { permission: { resource: 'invoice', action: 'read' } },
        ],
      },
      branch: { id: 'br-hq', name: 'HQ', code: 'HQ-ACC', type: 'HeadOffice' },
      accessScope: 'Company',
    };

    const itemNames = getVisibleItemNames(executiveUser);

    // Executive sees read-level destinations across departments
    expect(itemNames).toContain('Dashboard');
    expect(itemNames).toContain('Work Orders');
    expect(itemNames).toContain('Asset Register');
    expect(itemNames).toContain('Parts');
    expect(itemNames).toContain('Invoices');
    expect(itemNames).toContain('Financial Reports');
    expect(itemNames).toContain('Reports');
    expect(itemNames).toContain('Worker Monitoring');

    // Does NOT see Administrative Configuration / Settings / Users (requires settings:manage)
    expect(itemNames).not.toContain('Settings');
    expect(itemNames).not.toContain('Users & Roles');
    expect(itemNames).not.toContain('Data Import');
  });

  /* ------------------------------------------------------------------ */
  /* 6. Negative and Fail-Closed Security Scenarios                     */
  /* ------------------------------------------------------------------ */

  it('21. Fail-Closed: Missing permissions array fails closed (only Dashboard visible)', () => {
    const missingPermsUser = {
      name: 'No Perms User',
      email: 'noperms@zemifix.local',
      role: {
        id: 'role-1',
        name: 'Admin', // Even with Admin role name!
      },
    } as unknown as UserSession;

    expect(getVisibleItemNames(missingPermsUser)).toEqual(['Dashboard']);
  });

  it('22. Fail-Closed: Empty permissions array fails closed (only Dashboard visible)', () => {
    const emptyPermsUser: UserSession = {
      id: 'usr-empty-1',
      name: 'Empty Perms User',
      email: 'empty@zemifix.local',
      role: {
        id: 'role-admin',
        name: 'Admin',
        permissions: [],
      },
      branch: { id: 'br-acc', name: 'Accra HQ', code: 'HQ-ACC', type: 'HeadOffice' },
      accessScope: 'Company',
    };

    expect(getVisibleItemNames(emptyPermsUser)).toEqual(['Dashboard']);
  });

  it('23. Fail-Closed: Malformed permissions entries are handled gracefully and fail closed', () => {
    const malformedUser = {
      name: 'Malformed Perms User',
      email: 'malformed@zemifix.local',
      role: {
        id: 'role-test',
        name: 'Manager',
        permissions: [
          null,
          undefined,
          {},
          { permission: null },
          { permission: { resource: '', action: 'read' } },
          { permission: { resource: 123, action: 'read' } },
        ],
      },
    } as unknown as UserSession;

    expect(getVisibleItemNames(malformedUser)).toEqual(['Dashboard']);
  });

  it('24. Fail-Closed: Unknown resource names do NOT grant access', () => {
    const unknownResourceUser: UserSession = {
      id: 'usr-unk-1',
      name: 'Unknown Resource User',
      email: 'unk@zemifix.local',
      role: {
        id: 'role-test',
        name: 'CustomRole',
        permissions: [
          { permission: { resource: 'quantum_reactor', action: 'read' } },
          { permission: { resource: 'secret_facility', action: 'manage' } },
        ],
      },
      branch: { id: 'br-acc', name: 'Accra HQ', code: 'HQ-ACC', type: 'HeadOffice' },
      accessScope: 'Company',
    };

    expect(getVisibleItemNames(unknownResourceUser)).toEqual(['Dashboard']);
  });

  it('25. Fail-Closed: Unknown action names for known resources do NOT grant access where read is required', () => {
    const unknownActionUser: UserSession = {
      id: 'usr-act-1',
      name: 'Unknown Action User',
      email: 'unkact@zemifix.local',
      role: {
        id: 'role-test',
        name: 'CustomRole',
        permissions: [
          { permission: { resource: 'work_order', action: 'explode' } },
          { permission: { resource: 'settings', action: 'shred' } },
        ],
      },
      branch: { id: 'br-hq', name: 'HQ', code: 'HQ-ACC', type: 'HeadOffice' },
      accessScope: 'Company',
    };

    expect(getVisibleItemNames(unknownActionUser)).toEqual(['Dashboard']);
  });

  it('26. Fail-Closed: Role name alone as string without permissions fails closed for Admin and Manager', () => {
    const adminRoleString: AppSidebarUser = {
      name: 'String Admin',
      role: 'Admin',
      email: 'admin_str@zemifix.local',
    };

    const managerRoleString: AppSidebarUser = {
      name: 'String Manager',
      role: 'Manager',
      email: 'mgr_str@zemifix.local',
    };

    expect(getVisibleItemNames(adminRoleString)).toEqual(['Dashboard']);
    expect(getVisibleItemNames(managerRoleString)).toEqual(['Dashboard']);
  });

  it('27. Fail-Closed: Unauthenticated (null or undefined) user cannot access any item, including Dashboard', () => {
    const testItem = facilityNavigationGroups[0].items[0]; // Dashboard
    expect(canUserAccessNavItem(null, testItem)).toBe(false);
    expect(canUserAccessNavItem(undefined, testItem)).toBe(false);
  });

  /* ------------------------------------------------------------------ */
  /* 7. Phase 1E — Procurement Permission Boundary (stock:issue leakage) */
  /* ------------------------------------------------------------------ */

  it('28. Phase 1E: Storekeeper with ONLY stock:issue (no inventory:read) sees Inventory but NOT Procurement', () => {
    // This is the key Phase 1E regression test.
    // stock:issue alone should NOT grant Procurement navigation.
    // inventory:read is required to see Procurement destinations.
    const stockIssueOnlyUser: UserSession = {
      id: 'usr-stock-only-1',
      name: 'Yaw Issuer',
      email: 'y.issuer@zemifix.local',
      role: {
        id: 'role-stock-only',
        name: 'Storekeeper',
        permissions: [
          { permission: { resource: 'stock', action: 'issue' } },
          // Deliberately NO inventory:read
        ],
      },
      branch: { id: 'br-hq', name: 'HQ', code: 'HQ-ACC', type: 'HeadOffice' },
      accessScope: 'Branch',
    };

    const groupNames = getVisibleGroupNames(stockIssueOnlyUser);
    const itemNames = getVisibleItemNames(stockIssueOnlyUser);

    // stock:issue still grants access to Inventory section destinations
    expect(groupNames).toContain('Inventory');
    expect(itemNames).toContain('Parts');
    expect(itemNames).toContain('Stores');
    expect(itemNames).toContain('Stock Transactions');
    expect(itemNames).toContain('Reorder Queue');
    expect(itemNames).toContain('Returns');

    // CRITICAL: stock:issue alone must NOT grant Procurement access (Phase 1E fix)
    expect(groupNames).not.toContain('Procurement');
    expect(itemNames).not.toContain('Requisitions');
    expect(itemNames).not.toContain('Purchase Orders');
    expect(itemNames).not.toContain('Receipts');
    expect(itemNames).not.toContain('Suppliers');

    // Also blocked from Finance, Org, Admin
    expect(groupNames).not.toContain('Finance');
    expect(groupNames).not.toContain('Organization');
    expect(itemNames).not.toContain('Settings');
    expect(itemNames).not.toContain('Invoices');
  });

  it('29. Phase 1E: Storekeeper with stock:approve_issue only does NOT see Procurement', () => {
    // stock:approve_issue is seeded for supervisory approval of stock issues.
    // It carries no procurement authorisation. Fail closed.
    const approveIssueUser: UserSession = {
      id: 'usr-approve-1',
      name: 'Kofi Approver',
      email: 'k.approver@zemifix.local',
      role: {
        id: 'role-approve',
        name: 'StoreApprover',
        permissions: [
          { permission: { resource: 'stock', action: 'approve_issue' } },
        ],
      },
      branch: { id: 'br-hq', name: 'HQ', code: 'HQ-ACC', type: 'HeadOffice' },
      accessScope: 'Branch',
    };

    const groupNames = getVisibleGroupNames(approveIssueUser);
    const itemNames = getVisibleItemNames(approveIssueUser);

    // stock:approve_issue grants NO procurement or inventory navigation
    expect(groupNames).not.toContain('Procurement');
    expect(groupNames).not.toContain('Inventory');
    expect(itemNames).not.toContain('Requisitions');
    expect(itemNames).not.toContain('Parts');
    expect(itemNames).not.toContain('Invoices');

    // Only Dashboard is visible (via Operations group, no permission required)
    expect(itemNames).toContain('Dashboard');
  });

  it('30. Combined Mode displays exactly one Dashboard link across merged navigation groups', () => {
    const adminUser: UserSession = {
      id: 'usr-admin-1',
      name: 'Nana Yaw Addo',
      email: 'admin@zemifix.local',
      role: {
        id: 'role-admin',
        name: 'Admin',
        permissions: [
          { permission: { resource: '*', action: '*' } },
        ],
      },
      branch: { id: 'br-hq', name: 'HQ', code: 'HQ-ACC', type: 'HeadOffice' },
      accessScope: 'Company',
    };

    const combinedItems = getVisibleItemNames(adminUser, combinedNavigationGroups as any);
    const dashboardCount = combinedItems.filter((name) => name === 'Dashboard').length;

    expect(dashboardCount).toBe(1);
  });
});
