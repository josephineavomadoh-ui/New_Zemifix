-- Helper GUC Getter Functions
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

CREATE OR REPLACE FUNCTION app_access_scope() RETURNS TEXT AS $$
  SELECT COALESCE(NULLIF(current_setting('app.current_access_scope', true), ''), 'Company');
$$ LANGUAGE sql STABLE;

CREATE OR REPLACE FUNCTION app_realm() RETURNS TEXT AS $$
  SELECT COALESCE(NULLIF(current_setting('app.current_realm', true), ''), 'STAFF');
$$ LANGUAGE sql STABLE;

CREATE OR REPLACE FUNCTION app_customer_id() RETURNS TEXT AS $$
  SELECT NULLIF(current_setting('app.current_customer_id', true), '');
$$ LANGUAGE sql STABLE;

-- 1. Enable & Force Row-Level Security on Core Domain Tables
ALTER TABLE "work_orders" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "work_orders" FORCE ROW LEVEL SECURITY;

ALTER TABLE "assets" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "assets" FORCE ROW LEVEL SECURITY;

ALTER TABLE "customers" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "customers" FORCE ROW LEVEL SECURITY;

ALTER TABLE "customer_sites" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "customer_sites" FORCE ROW LEVEL SECURITY;

ALTER TABLE "invoices" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "invoices" FORCE ROW LEVEL SECURITY;

ALTER TABLE "quotes" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "quotes" FORCE ROW LEVEL SECURITY;

ALTER TABLE "audit_logs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "audit_logs" FORCE ROW LEVEL SECURITY;

-- 2. Drop existing policies if any
DROP POLICY IF EXISTS work_orders_rls_policy ON "work_orders";
DROP POLICY IF EXISTS assets_rls_policy ON "assets";
DROP POLICY IF EXISTS customers_rls_policy ON "customers";
DROP POLICY IF EXISTS customer_sites_rls_policy ON "customer_sites";
DROP POLICY IF EXISTS invoices_rls_policy ON "invoices";
DROP POLICY IF EXISTS quotes_rls_policy ON "quotes";
DROP POLICY IF EXISTS audit_logs_select_policy ON "audit_logs";
DROP POLICY IF EXISTS audit_logs_insert_policy ON "audit_logs";

-- 3. Create RLS Policies for zemifix_app_user

-- Work Orders RLS Policy
CREATE POLICY work_orders_rls_policy ON "work_orders"
FOR ALL TO zemifix_app_user
USING (
  app_realm() = 'WORKER'
  OR app_access_scope() = 'Company'
  OR (app_realm() = 'STAFF' AND app_access_scope() = 'BranchAndBelow' AND ("branchId"::text IN (SELECT id::text FROM branches WHERE path LIKE app_branch_path() || '%')))
  OR (app_realm() = 'STAFF' AND app_access_scope() = 'Branch' AND "branchId"::text = app_branch_id())
  OR (app_realm() = 'STAFF' AND app_access_scope() = 'Department' AND "departmentId"::text = app_department_id())
  OR (app_realm() = 'STAFF' AND app_access_scope() = 'Own' AND ("assignedUserId"::text = app_user_id() OR "supervisorUserId"::text = app_user_id()))
  OR (app_realm() = 'CUSTOMER' AND "customerId"::text = app_customer_id())
);

-- Assets RLS Policy
CREATE POLICY assets_rls_policy ON "assets"
FOR ALL TO zemifix_app_user
USING (
  app_realm() = 'WORKER'
  OR app_access_scope() = 'Company'
  OR (app_realm() = 'STAFF' AND app_access_scope() = 'BranchAndBelow' AND ("branchId"::text IN (SELECT id::text FROM branches WHERE path LIKE app_branch_path() || '%')))
  OR (app_realm() = 'STAFF' AND app_access_scope() = 'Branch' AND "branchId"::text = app_branch_id())
  OR (app_realm() = 'STAFF' AND app_access_scope() = 'Department' AND "responsibleDepartmentId"::text = app_department_id())
  OR (app_realm() = 'STAFF' AND app_access_scope() = 'Own' AND ("responsibleUserId"::text = app_user_id() OR "custodianUserId"::text = app_user_id()))
  OR (app_realm() = 'CUSTOMER' AND "ownerCustomerId"::text = app_customer_id())
);

-- Customers RLS Policy
CREATE POLICY customers_rls_policy ON "customers"
FOR ALL TO zemifix_app_user
USING (
  app_realm() = 'WORKER'
  OR app_realm() = 'STAFF'
  OR (app_realm() = 'CUSTOMER' AND "id"::text = app_customer_id())
);

-- Customer Sites RLS Policy
CREATE POLICY customer_sites_rls_policy ON "customer_sites"
FOR ALL TO zemifix_app_user
USING (
  app_realm() = 'WORKER'
  OR app_realm() = 'STAFF'
  OR (app_realm() = 'CUSTOMER' AND "customerId"::text = app_customer_id())
);

-- Invoices RLS Policy
CREATE POLICY invoices_rls_policy ON "invoices"
FOR ALL TO zemifix_app_user
USING (
  app_realm() = 'WORKER'
  OR app_realm() = 'STAFF'
  OR (app_realm() = 'CUSTOMER' AND "customerId"::text = app_customer_id())
);

-- Quotes RLS Policy
CREATE POLICY quotes_rls_policy ON "quotes"
FOR ALL TO zemifix_app_user
USING (
  app_realm() = 'WORKER'
  OR app_realm() = 'STAFF'
  OR (app_realm() = 'CUSTOMER' AND "customerId"::text = app_customer_id())
);

-- Audit Logs RLS Policies
CREATE POLICY audit_logs_select_policy ON "audit_logs"
FOR SELECT TO zemifix_app_user
USING (
  app_realm() = 'WORKER'
  OR (app_realm() = 'STAFF' AND app_access_scope() = 'Company')
);

CREATE POLICY audit_logs_insert_policy ON "audit_logs"
FOR INSERT TO zemifix_app_user
WITH CHECK (true);
