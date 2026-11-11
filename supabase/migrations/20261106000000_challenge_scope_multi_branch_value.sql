-- Scope enum expansion, split out of 20261106000001 because PostgreSQL refuses to USE a
-- newly added enum value in the same transaction that added it (SQLSTATE 55P04), and
-- Supabase applies each migration file as one transaction. Same pattern as
-- 20260809000002_sales_employee_role.sql. Behaviour is unchanged: these two statements
-- ran first in 20261106000001 already.
alter type challenge_scope rename value 'ALL_BRANCHES' to 'GLOBAL';
alter type challenge_scope add value 'MULTI_BRANCH';
