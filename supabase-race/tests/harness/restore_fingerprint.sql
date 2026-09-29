select 'rows ' || table_name || ' ' || (xpath('/row/c/text()', query_to_xml(format('select count(*) as c from public.%I', table_name), false, true, '')))[1]::text
  from information_schema.tables where table_schema = 'public' and table_type = 'BASE TABLE'
union all
select 'fn ' || proname || ' ' || md5(pg_get_functiondef(oid)) from pg_proc where pronamespace = 'public'::regnamespace and proname like 'race\_%'
order by 1;
