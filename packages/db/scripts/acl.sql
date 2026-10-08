with target_roles as (select oid,rolname from pg_roles where rolname in ('authenticated','asisteam_api','asisteam_jobs','asisteam_auth','asisteam_invitation','asisteam_billing')),
grants as (
 select format('GRANT %s ON TABLE %I.%I TO %I;',a.privilege_type,n.nspname,c.relname,r.rolname) as statement
 from pg_class c join pg_namespace n on n.oid=c.relnamespace cross join lateral aclexplode(c.relacl) a join target_roles r on r.oid=a.grantee
 where n.nspname in ('public','app_private') and c.relkind in ('r','p','v','m')
 union all
 select format('GRANT %s (%I) ON TABLE %I.%I TO %I;',a.privilege_type,x.attname,n.nspname,c.relname,r.rolname)
 from pg_attribute x join pg_class c on c.oid=x.attrelid join pg_namespace n on n.oid=c.relnamespace cross join lateral aclexplode(x.attacl) a join target_roles r on r.oid=a.grantee
 where n.nspname in ('public','app_private')
 union all
 select format('GRANT EXECUTE ON FUNCTION %I.%I(%s) TO %I;',n.nspname,p.proname,pg_get_function_identity_arguments(p.oid),r.rolname)
 from pg_proc p join pg_namespace n on n.oid=p.pronamespace cross join lateral aclexplode(p.proacl) a join target_roles r on r.oid=a.grantee
 where n.nspname in ('public','app_private') and a.privilege_type='EXECUTE'
) select statement from grants order by statement;
