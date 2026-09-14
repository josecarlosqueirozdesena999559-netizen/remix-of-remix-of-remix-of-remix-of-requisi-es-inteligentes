-- Adds optional product images for visual items such as Odontologico, SESB and brocas.
alter table public.itens
  add column if not exists imagem_url text,
  add column if not exists imagem_path text;

insert into storage.buckets (id, name, public)
values ('product-images', 'product-images', true)
on conflict (id) do update
set public = true;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'Authenticated users can read product images'
  ) then
    create policy "Authenticated users can read product images"
    on storage.objects
    for select
    to authenticated
    using (bucket_id = 'product-images');
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'Admins can upload product images'
  ) then
    create policy "Admins can upload product images"
    on storage.objects
    for insert
    to authenticated
    with check (
      bucket_id = 'product-images'
      and exists (
        select 1
        from public.usuarios u
        where u.auth_user_id = auth.uid()
          and u.is_admin = true
      )
    );
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'Admins can update product images'
  ) then
    create policy "Admins can update product images"
    on storage.objects
    for update
    to authenticated
    using (
      bucket_id = 'product-images'
      and exists (
        select 1
        from public.usuarios u
        where u.auth_user_id = auth.uid()
          and u.is_admin = true
      )
    )
    with check (
      bucket_id = 'product-images'
      and exists (
        select 1
        from public.usuarios u
        where u.auth_user_id = auth.uid()
          and u.is_admin = true
      )
    );
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'Admins can delete product images'
  ) then
    create policy "Admins can delete product images"
    on storage.objects
    for delete
    to authenticated
    using (
      bucket_id = 'product-images'
      and exists (
        select 1
        from public.usuarios u
        where u.auth_user_id = auth.uid()
          and u.is_admin = true
      )
    );
  end if;
end $$;