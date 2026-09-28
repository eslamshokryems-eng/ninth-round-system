-- Deterministic fingerprint of every NON-race object in the database, used by
-- run.sh to prove race migrations change nothing that already existed.
-- One line per object; race_* objects (and race_* policies, which are the
-- only additive grant onto an existing table) are excluded.
with lines(l) as (
  -- relations (tables, views, sequences, indexes) incl. RLS flags and ACLs
  select format('rel %s.%s kind=%s rls=%s force=%s acl=%s', n.nspname, c.relname, c.relkind,
                c.relrowsecurity, c.relforcerowsecurity, c.relacl)
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname in ('public', 'auth', 'storage') and c.relname not like 'race\_%'
    and c.relname not like 'idx\_race\_%' and c.relname not like 'uq\_race\_%'
  union all
  -- columns
  select format('col %s.%s %s %s notnull=%s default=%s acl=%s', c.relname, a.attname,
                format_type(a.atttypid, a.atttypmod), a.attnum, a.attnotnull,
                pg_get_expr(d.adbin, d.adrelid), a.attacl)
  from pg_attribute a join pg_class c on c.oid = a.attrelid join pg_namespace n on n.oid = c.relnamespace
  left join pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
  where n.nspname in ('public', 'auth', 'storage') and c.relkind in ('r', 'v', 'p')
    and c.relname not like 'race\_%' and a.attnum > 0 and not a.attisdropped
  union all
  -- constraints
  select format('con %s.%s %s', c.relname, k.conname, pg_get_constraintdef(k.oid))
  from pg_constraint k join pg_class c on c.oid = k.conrelid join pg_namespace n on n.oid = c.relnamespace
  where n.nspname in ('public', 'auth', 'storage') and c.relname not like 'race\_%'
  union all
  -- indexes
  select format('idx %s', pg_get_indexdef(i.indexrelid))
  from pg_index i join pg_class c on c.oid = i.indrelid join pg_namespace n on n.oid = c.relnamespace
  where n.nspname in ('public', 'auth', 'storage') and c.relname not like 'race\_%'
  union all
  -- triggers
  select format('trg %s.%s %s', c.relname, t.tgname, pg_get_triggerdef(t.oid))
  from pg_trigger t join pg_class c on c.oid = t.tgrelid join pg_namespace n on n.oid = c.relnamespace
  where not t.tgisinternal and n.nspname in ('public', 'auth', 'storage') and c.relname not like 'race\_%'
  union all
  -- policies (race_* policies on existing tables are listed separately by run.sh)
  select format('pol %s.%s %s %s using=%s check=%s', p.schemaname, p.tablename, p.policyname, p.cmd,
                p.qual, p.with_check)
  from pg_policies p
  where p.schemaname in ('public', 'auth', 'storage') and p.tablename not like 'race\_%'
    and p.policyname not like 'race %'
  union all
  -- functions: signature + md5 of full definition + ACL
  select format('fn %s.%s(%s) md5=%s acl=%s', n.nspname, p.proname, pg_get_function_identity_arguments(p.oid),
                md5(pg_get_functiondef(p.oid)), p.proacl)
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname in ('public', 'auth', 'storage') and p.proname not like 'race\_%' and p.prokind in ('f', 'p')
  union all
  -- types / enum labels
  select format('enum %s %s %s', t.typname, e.enumsortorder, e.enumlabel)
  from pg_enum e join pg_type t on t.oid = e.enumtypid
  where t.typname not like 'race\_%'
  union all
  -- permission catalog data (race.* rows are additive and listed separately)
  select format('perm %s %s', key, category) from public.permissions where key not like 'race.%'
  union all
  select format('roleperm %s %s', role, permission_key) from public.role_permissions where permission_key not like 'race.%'
)
select l from lines order by l;
