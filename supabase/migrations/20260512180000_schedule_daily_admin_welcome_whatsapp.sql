create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net with schema extensions;
create extension if not exists supabase_vault with schema vault;

do $$
begin
  if exists (select 1 from cron.job where jobname = 'daily-admin-welcome-whatsapp') then
    perform cron.unschedule('daily-admin-welcome-whatsapp');
  end if;
end $$;

select cron.schedule(
  'daily-admin-welcome-whatsapp',
  '0 10 * * *',
  $$
  select
    net.http_post(
      url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url')
        || '/functions/v1/daily-admin-welcome-whatsapp',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'admin_daily_welcome_cron_secret')
      ),
      body := jsonb_build_object('scheduledAt', now())
    ) as request_id;
  $$
);
