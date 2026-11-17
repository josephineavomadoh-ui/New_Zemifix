-- 1. Hardened Fail-Closed GUC Getter Functions
CREATE OR REPLACE FUNCTION app_access_scope() RETURNS TEXT AS $$
  SELECT COALESCE(NULLIF(current_setting('app.current_access_scope', true), ''), 'Own');
$$ LANGUAGE sql STABLE;

CREATE OR REPLACE FUNCTION app_realm() RETURNS TEXT AS $$
  SELECT COALESCE(NULLIF(current_setting('app.current_realm', true), ''), 'STAFF');
$$ LANGUAGE sql STABLE;

CREATE OR REPLACE FUNCTION app_user_id() RETURNS TEXT AS $$
  SELECT NULLIF(current_setting('app.current_user_id', true), '');
$$ LANGUAGE sql STABLE;

CREATE OR REPLACE FUNCTION app_branch_id() RETURNS TEXT AS $$
  SELECT NULLIF(current_setting('app.current_branch_id', true), '');
$$ LANGUAGE sql STABLE;

CREATE OR REPLACE FUNCTION app_branch_path() RETURNS TEXT AS $$
  SELECT NULLIF(current_setting('app.current_branch_path', true), '');
$$ LANGUAGE sql STABLE;

CREATE OR REPLACE FUNCTION app_department_id() RETURNS TEXT AS $$
  SELECT NULLIF(current_setting('app.current_department_id', true), '');
$$ LANGUAGE sql STABLE;

CREATE OR REPLACE FUNCTION app_customer_id() RETURNS TEXT AS $$
  SELECT NULLIF(current_setting('app.current_customer_id', true), '');
$$ LANGUAGE sql STABLE;

-- 2. Re-create Work Orders RLS Policy with explicit USING and WITH CHECK
DROP POLICY IF EXISTS work_orders_rls_policy ON "work_orders";
CREATE POLICY work_orders_rls_policy ON "work_orders"
FOR ALL TO zemifix_app_user
USING (
  app_realm() = 'WORKER'
  OR app_access_scope() = 'Company'
  OR (app_realm() = 'STAFF' AND app_access_scope() = 'BranchAndBelow' AND app_branch_path() IS NOT NULL AND ("branchId"::text IN (SELECT id::text FROM branches WHERE path LIKE app_branch_path() || '%')))
  OR (app_realm() = 'STAFF' AND app_access_scope() = 'Branch' AND app_branch_id() IS NOT NULL AND "branchId"::text = app_branch_id())
  OR (app_realm() = 'STAFF' AND app_access_scope() = 'Department' AND app_department_id() IS NOT NULL AND "departmentId"::text = app_department_id())
  OR (app_realm() = 'STAFF' AND app_access_scope() = 'Own' AND app_user_id() IS NOT NULL AND ("assignedUserId"::text = app_user_id() OR "supervisorUserId"::text = app_user_id()))
  OR (app_realm() = 'CUSTOMER' AND app_customer_id() IS NOT NULL AND "customerId"::text = app_customer_id())
)
WITH CHECK (
  app_realm() = 'WORKER'
  OR app_access_scope() = 'Company'
  OR (app_realm() = 'STAFF' AND app_access_scope() = 'BranchAndBelow' AND app_branch_path() IS NOT NULL AND ("branchId"::text IN (SELECT id::text FROM branches WHERE path LIKE app_branch_path() || '%')))
  OR (app_realm() = 'STAFF' AND app_access_scope() = 'Branch' AND app_branch_id() IS NOT NULL AND "branchId"::text = app_branch_id())
  OR (app_realm() = 'STAFF' AND app_access_scope() = 'Department' AND app_department_id() IS NOT NULL AND "departmentId"::text = app_department_id())
  OR (app_realm() = 'STAFF' AND app_access_scope() = 'Own' AND app_user_id() IS NOT NULL AND ("assignedUserId"::text = app_user_id() OR "supervisorUserId"::text = app_user_id()))
  OR (app_realm() = 'CUSTOMER' AND app_customer_id() IS NOT NULL AND "customerId"::text = app_customer_id())
);

-- 3. Re-create Assets RLS Policy with explicit USING and WITH CHECK
DROP POLICY IF EXISTS assets_rls_policy ON "assets";
CREATE POLICY assets_rls_policy ON "assets"
FOR ALL TO zemifix_app_user
USING (
  app_realm() = 'WORKER'
  OR app_access_scope() = 'Company'
  OR (app_realm() = 'STAFF' AND app_access_scope() = 'BranchAndBelow' AND app_branch_path() IS NOT NULL AND ("branchId"::text IN (SELECT id::text FROM branches WHERE path LIKE app_branch_path() || '%')))
  OR (app_realm() = 'STAFF' AND app_access_scope() = 'Branch' AND app_branch_id() IS NOT NULL AND "branchId"::text = app_branch_id())
  OR (app_realm() = 'STAFF' AND app_access_scope() = 'Department' AND app_department_id() IS NOT NULL AND "responsibleDepartmentId"::text = app_department_id())
  OR (app_realm() = 'STAFF' AND app_access_scope() = 'Own' AND app_user_id() IS NOT NULL AND ("responsibleUserId"::text = app_user_id() OR "custodianUserId"::text = app_user_id()))
  OR (app_realm() = 'CUSTOMER' AND app_customer_id() IS NOT NULL AND "ownerCustomerId"::text = app_customer_id())
)
WITH CHECK (
  app_realm() = 'WORKER'
  OR app_access_scope() = 'Company'
  OR (app_realm() = 'STAFF' AND app_access_scope() = 'BranchAndBelow' AND app_branch_path() IS NOT NULL AND ("branchId"::text IN (SELECT id::text FROM branches WHERE path LIKE app_branch_path() || '%')))
  OR (app_realm() = 'STAFF' AND app_access_scope() = 'Branch' AND app_branch_id() IS NOT NULL AND "branchId"::text = app_branch_id())
  OR (app_realm() = 'STAFF' AND app_access_scope() = 'Department' AND app_department_id() IS NOT NULL AND "responsibleDepartmentId"::text = app_department_id())
  OR (app_realm() = 'STAFF' AND app_access_scope() = 'Own' AND app_user_id() IS NOT NULL AND ("responsibleUserId"::text = app_user_id() OR "custodianUserId"::text = app_user_id()))
  OR (app_realm() = 'CUSTOMER' AND app_customer_id() IS NOT NULL AND "ownerCustomerId"::text = app_customer_id())
);
