DO $$
DECLARE
  v_table TEXT;
  v_tables TEXT[] := ARRAY[
    'companies',
    'branches',
    'departments',
    'users',
    'roles',
    'permissions',
    'role_permissions',
    'user_scope_grants',
    'customers',
    'customer_sites',
    'customer_contacts',
    'customer_contact_site_grants',
    'portal_sessions',
    'auth_otps',
    'api_keys',
    'approval_rules',
    'approval_requests',
    'approval_steps',
    'approval_actions',
    'audit_logs',
    'audit_anchors',
    'asset_categories',
    'locations',
    'assets',
    'asset_locations_history',
    'asset_status_history',
    'asset_ownership_history',
    'asset_management_history',
    'asset_meters',
    'meter_readings',
    'asset_downtime_logs',
    'asset_boms',
    'work_requests',
    'work_orders',
    'work_order_status_history',
    'work_order_assignment_history',
    'work_order_tasks',
    'work_order_checklist_items',
    'work_order_labor',
    'work_order_parts',
    'failure_codes',
    'work_order_failure_records',
    'parts',
    'stores',
    'stock',
    'stock_transactions',
    'store_transfers',
    'store_transfer_lines',
    'stock_adjustments',
    'stock_adjustment_lines',
    'vendors',
    'purchase_requisitions',
    'purchase_requisition_items',
    'rfqs',
    'rfq_vendors',
    'purchase_orders',
    'purchase_order_items',
    'goods_received_notes',
    'goods_received_note_items',
    'supplier_returns',
    'supplier_return_items',
    'offline_sync_batches',
    'offline_sync_mutations',
    'offline_sync_conflicts',
    'sla_calendars',
    'sla_calendar_holidays',
    'sla_policies',
    'sla_rules',
    'customer_contracts',
    'customer_contract_sites',
    'contract_rate_cards',
    'sla_breach_logs',
    'maintenance_plans',
    'quotes',
    'quote_lines',
    'quote_version_history',
    'quote_decision_logs',
    'work_order_comments',
    'work_order_attachments',
    'public_request_intake',
    'number_sequences',
    'invoices',
    'invoice_lines',
    'payments',
    'payment_allocations',
    'payment_reversals',
    'credit_notes',
    'credit_note_lines',
    'notifications',
    'notification_preferences',
    'notification_templates',
    'notification_email_deliveries',
    'notification_delivery_attempts',
    'internal_recharges',
    'import_batches',
    'rate_limits',
    'background_jobs',
    'background_workers'
  ];
BEGIN
  FOREACH v_table IN ARRAY v_tables LOOP
    EXECUTE pg_catalog.format(
      'ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',
      v_table
    );
    EXECUTE pg_catalog.format(
      'ALTER TABLE public.%I FORCE ROW LEVEL SECURITY',
      v_table
    );
    EXECUTE pg_catalog.format(
      'CREATE POLICY stage2_signed_context_required ON public.%I AS RESTRICTIVE FOR ALL TO zemifix_app_user USING (public.app_security_context_valid()) WITH CHECK (public.app_security_context_valid())',
      v_table
    );
  END LOOP;
END;
$$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
      FROM pg_catalog.pg_class AS relation
      JOIN pg_catalog.pg_namespace AS relation_schema
        ON relation_schema.oid = relation.relnamespace
     WHERE relation_schema.nspname = 'public'
       AND relation.relrowsecurity
       AND pg_catalog.pg_has_role(
         'zemifix_app_user',
         relation.relowner,
         'MEMBER'
       )
  ) THEN
    RAISE EXCEPTION
      'zemifix_app_user must not own or inherit ownership of an RLS-protected table.';
  END IF;
END;
$$;

DROP POLICY IF EXISTS work_orders_rls_policy ON public.work_orders;
DROP POLICY IF EXISTS assets_rls_policy ON public.assets;
DROP POLICY IF EXISTS customers_rls_policy ON public.customers;
DROP POLICY IF EXISTS customer_sites_rls_policy ON public.customer_sites;
DROP POLICY IF EXISTS invoices_rls_policy ON public.invoices;
DROP POLICY IF EXISTS quotes_rls_policy ON public.quotes;
DROP POLICY IF EXISTS audit_logs_select_policy ON public.audit_logs;
DROP POLICY IF EXISTS audit_logs_insert_policy ON public.audit_logs;

CREATE POLICY stage2_company_read ON public.companies
FOR SELECT TO zemifix_app_user
USING (public.app_realm() = 'STAFF');

CREATE POLICY stage2_branch_scope_read ON public.branches
FOR SELECT TO zemifix_app_user
USING (
  public.app_realm() = 'STAFF'
  AND (
    public.app_access_scope() = 'Company'
    OR id::text = public.app_branch_id()
    OR (
      public.app_access_scope() = 'BranchAndBelow'
      AND NULLIF(public.app_branch_path(), '') IS NOT NULL
      AND pg_catalog.starts_with(path, public.app_branch_path())
    )
    OR (
      public.app_access_scope() = 'Own'
      AND (
        "managerUserId"::text = public.app_user_id()
        OR "alternateApproverId"::text = public.app_user_id()
      )
    )
    OR EXISTS (
      SELECT 1
        FROM public.users AS user_row
       WHERE user_row.id::text = public.app_user_id()
         AND user_row."branchId"::text = branches.id::text
    )
    OR EXISTS (
      SELECT 1
        FROM public.user_scope_grants AS grant_row
       WHERE grant_row."userId"::text = public.app_user_id()
         AND grant_row."branchId"::text = branches.id::text
         AND (grant_row."expiresAt" IS NULL OR grant_row."expiresAt" > now())
    )
  )
);

CREATE POLICY stage2_department_scope_read ON public.departments
FOR SELECT TO zemifix_app_user
USING (
  public.app_realm() = 'STAFF'
  AND (
    public.app_access_scope() = 'Company'
    OR id::text = public.app_department_id()
    OR (
      public.app_access_scope() = 'Own'
      AND "headUserId"::text = public.app_user_id()
    )
    OR EXISTS (
      SELECT 1
        FROM public.users AS user_row
       WHERE user_row.id::text = public.app_user_id()
         AND user_row."departmentId"::text = departments.id::text
    )
    OR EXISTS (
      SELECT 1
        FROM public.user_scope_grants AS grant_row
       WHERE grant_row."userId"::text = public.app_user_id()
         AND grant_row."departmentId"::text = departments.id::text
         AND (grant_row."expiresAt" IS NULL OR grant_row."expiresAt" > now())
    )
  )
);

CREATE POLICY stage2_user_self_read ON public.users
FOR SELECT TO zemifix_app_user
USING (
  public.app_realm() = 'STAFF'
  AND (
    id::text = public.app_user_id()
    OR public.app_access_scope() = 'Company'
    OR "branchId"::text = public.app_branch_id()
    OR "departmentId"::text = public.app_department_id()
  )
);

CREATE POLICY stage2_role_read ON public.roles
FOR SELECT TO zemifix_app_user
USING (public.app_realm() = 'STAFF');

CREATE POLICY stage2_permission_read ON public.permissions
FOR SELECT TO zemifix_app_user
USING (public.app_realm() = 'STAFF');

CREATE POLICY stage2_role_permission_read ON public.role_permissions
FOR SELECT TO zemifix_app_user
USING (public.app_realm() = 'STAFF');

CREATE POLICY stage2_user_scope_grant_read ON public.user_scope_grants
FOR SELECT TO zemifix_app_user
USING (
  public.app_realm() = 'STAFF'
  AND "userId"::text = public.app_user_id()
);

CREATE POLICY stage2_auth_otp_scope ON public.auth_otps
FOR ALL TO zemifix_app_user
USING (
  public.app_realm() = 'STAFF'
  AND "userId"::text = public.app_user_id()
)
WITH CHECK (
  public.app_realm() = 'STAFF'
  AND "userId"::text = public.app_user_id()
);

CREATE POLICY work_orders_rls_policy ON public.work_orders
FOR ALL TO zemifix_app_user
USING (
  (
    public.app_realm() = 'STAFF'
    AND (
      public.app_access_scope() = 'Company'
      OR (
        public.app_access_scope() = 'BranchAndBelow'
        AND NULLIF(public.app_branch_path(), '') IS NOT NULL
        AND "branchId"::text IN (
          SELECT branch_row.id::text
            FROM public.branches AS branch_row
           WHERE pg_catalog.starts_with(branch_row.path, public.app_branch_path())
        )
      )
      OR (
        public.app_access_scope() = 'Branch'
        AND "branchId"::text = public.app_branch_id()
      )
      OR (
        public.app_access_scope() = 'Department'
        AND "departmentId"::text = public.app_department_id()
      )
      OR (
        public.app_access_scope() = 'Own'
        AND (
          "assignedUserId"::text = public.app_user_id()
          OR "supervisorUserId"::text = public.app_user_id()
        )
      )
      OR "assignedUserId"::text = public.app_user_id()
      OR "supervisorUserId"::text = public.app_user_id()
    )
  )
)
WITH CHECK (
  (
    public.app_realm() = 'STAFF'
    AND (
      public.app_access_scope() = 'Company'
      OR (
        public.app_access_scope() = 'BranchAndBelow'
        AND NULLIF(public.app_branch_path(), '') IS NOT NULL
        AND "branchId"::text IN (
          SELECT branch_row.id::text
            FROM public.branches AS branch_row
           WHERE pg_catalog.starts_with(branch_row.path, public.app_branch_path())
        )
      )
      OR (
        public.app_access_scope() = 'Branch'
        AND "branchId"::text = public.app_branch_id()
      )
      OR (
        public.app_access_scope() = 'Department'
        AND "departmentId"::text = public.app_department_id()
      )
      OR (
        public.app_access_scope() = 'Own'
        AND (
          "assignedUserId"::text = public.app_user_id()
          OR "supervisorUserId"::text = public.app_user_id()
        )
      )
    )
  )
);

CREATE POLICY work_orders_customer_read ON public.work_orders
FOR SELECT TO zemifix_app_user
USING (
  public.app_realm() = 'CUSTOMER'
  AND "customerId"::text = public.app_customer_id()
);

CREATE POLICY assets_rls_policy ON public.assets
FOR ALL TO zemifix_app_user
USING (
  (
    public.app_realm() = 'STAFF'
    AND (
      public.app_access_scope() = 'Company'
      OR (
        public.app_access_scope() = 'BranchAndBelow'
        AND NULLIF(public.app_branch_path(), '') IS NOT NULL
        AND "branchId"::text IN (
          SELECT branch_row.id::text
            FROM public.branches AS branch_row
           WHERE pg_catalog.starts_with(branch_row.path, public.app_branch_path())
        )
      )
      OR (
        public.app_access_scope() = 'Branch'
        AND "branchId"::text = public.app_branch_id()
      )
      OR (
        public.app_access_scope() = 'Department'
        AND "responsibleDepartmentId"::text = public.app_department_id()
      )
      OR (
        public.app_access_scope() = 'Own'
        AND (
          "responsibleUserId"::text = public.app_user_id()
          OR "custodianUserId"::text = public.app_user_id()
        )
      )
    )
  )
)
WITH CHECK (
  (
    public.app_realm() = 'STAFF'
    AND (
      public.app_access_scope() = 'Company'
      OR (
        public.app_access_scope() = 'BranchAndBelow'
        AND NULLIF(public.app_branch_path(), '') IS NOT NULL
        AND "branchId"::text IN (
          SELECT branch_row.id::text
            FROM public.branches AS branch_row
           WHERE pg_catalog.starts_with(branch_row.path, public.app_branch_path())
        )
      )
      OR (
        public.app_access_scope() = 'Branch'
        AND "branchId"::text = public.app_branch_id()
      )
      OR (
        public.app_access_scope() = 'Department'
        AND "responsibleDepartmentId"::text = public.app_department_id()
      )
      OR (
        public.app_access_scope() = 'Own'
        AND (
          "responsibleUserId"::text = public.app_user_id()
          OR "custodianUserId"::text = public.app_user_id()
        )
      )
    )
  )
);

CREATE POLICY assets_customer_read ON public.assets
FOR SELECT TO zemifix_app_user
USING (
  public.app_realm() = 'CUSTOMER'
  AND (
    "ownerCustomerId"::text = public.app_customer_id()
    OR "physicalSiteCustomerId"::text = public.app_customer_id()
  )
);

CREATE POLICY customers_rls_policy ON public.customers
FOR ALL TO zemifix_app_user
USING (
  (public.app_realm() = 'STAFF' AND public.app_access_scope() = 'Company')
)
WITH CHECK (
  public.app_realm() = 'STAFF'
  AND public.app_access_scope() = 'Company'
);

CREATE POLICY customers_customer_read ON public.customers
FOR SELECT TO zemifix_app_user
USING (
  public.app_realm() = 'CUSTOMER'
  AND id::text = public.app_customer_id()
);

CREATE POLICY customer_sites_rls_policy ON public.customer_sites
FOR ALL TO zemifix_app_user
USING (
  public.app_realm() = 'STAFF'
  AND public.app_access_scope() = 'Company'
)
WITH CHECK (
  public.app_realm() = 'STAFF'
  AND public.app_access_scope() = 'Company'
);

CREATE POLICY customer_sites_customer_read ON public.customer_sites
FOR SELECT TO zemifix_app_user
USING (
  public.app_realm() = 'CUSTOMER'
  AND "customerId"::text = public.app_customer_id()
);

CREATE POLICY invoices_rls_policy ON public.invoices
FOR ALL TO zemifix_app_user
USING (
  public.app_realm() = 'STAFF'
  AND public.app_access_scope() = 'Company'
)
WITH CHECK (
  public.app_realm() = 'STAFF'
  AND public.app_access_scope() = 'Company'
);

CREATE POLICY invoices_customer_read ON public.invoices
FOR SELECT TO zemifix_app_user
USING (
  public.app_realm() = 'CUSTOMER'
  AND "customerId"::text = public.app_customer_id()
);

CREATE POLICY quotes_rls_policy ON public.quotes
FOR ALL TO zemifix_app_user
USING (
  public.app_realm() = 'STAFF'
  AND public.app_access_scope() = 'Company'
)
WITH CHECK (
  public.app_realm() = 'STAFF'
  AND public.app_access_scope() = 'Company'
);

CREATE POLICY quotes_customer_read ON public.quotes
FOR SELECT TO zemifix_app_user
USING (
  public.app_realm() = 'CUSTOMER'
  AND "customerId"::text = public.app_customer_id()
);

CREATE POLICY audit_logs_select_policy ON public.audit_logs
FOR SELECT TO zemifix_app_user
USING (
  public.app_realm() = 'STAFF'
  AND (
    public.app_access_scope() = 'Company'
    OR "actorUserId"::text = public.app_user_id()
  )
);

CREATE POLICY audit_logs_insert_policy ON public.audit_logs
FOR INSERT TO zemifix_app_user
WITH CHECK (
  public.app_realm() = 'STAFF'
  AND "actorUserId"::text = public.app_user_id()
);

REVOKE UPDATE ON TABLE public.users FROM PUBLIC, zemifix_app_user;
GRANT UPDATE ("lastLoginAt") ON TABLE public.users TO zemifix_app_user;
CREATE POLICY stage2_user_last_login_update ON public.users
FOR UPDATE TO zemifix_app_user
USING (
  public.app_realm() = 'STAFF'
  AND id::text = public.app_user_id()
)
WITH CHECK (
  public.app_realm() = 'STAFF'
  AND id::text = public.app_user_id()
);
