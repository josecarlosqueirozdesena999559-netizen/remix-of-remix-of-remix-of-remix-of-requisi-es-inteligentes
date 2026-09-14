do $$
declare
  audit_table text;
begin
  foreach audit_table in array array[
    'whatsapp_webhook_message_audit',
    'whatsapp_outbound_message_audit'
  ]
  loop
    if exists (
      select 1
      from information_schema.tables
      where table_schema = 'public'
        and table_name = audit_table
    ) and not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = audit_table
    ) then
      execute format('alter publication supabase_realtime add table public.%I', audit_table);
    end if;
  end loop;
end $$;
