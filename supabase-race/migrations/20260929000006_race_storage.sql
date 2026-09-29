-- THE NINTH — storage. Its own buckets in its own Supabase project: race evidence never touches any other system's storage.
--
--   race-evidence       PRIVATE  rowing photos and other judge evidence. Judges of the event upload; Event Manager / Master
--                                Control (and the uploader) read. Immutable: nobody can update or delete an object through the API.
--   race-athlete-photos PRIVATE  optional athlete photos. Front-of-house (Event Manager, Master Control, Reception) upload and read.
--   race-event-assets   PUBLIC   logos, posters, sponsor art shown on the public pages. Anyone reads; only the Event Manager writes.
--   race-documents      PRIVATE  waivers, results sheets, run-of-show. Event staff read; only the Event Manager writes.
--
-- Object path convention: <event_id>/<anything…> — the FIRST folder is the event, and every policy authorises against THAT event's
-- race_staff rows. A path whose first folder is not an existing event is refused.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('race-evidence',       'race-evidence',       false, 10485760, array['image/jpeg', 'image/png', 'image/webp']),
  ('race-athlete-photos', 'race-athlete-photos', false,  5242880, array['image/jpeg', 'image/png', 'image/webp']),
  ('race-event-assets',   'race-event-assets',   true,  10485760, array['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml', 'application/pdf']),
  ('race-documents',      'race-documents',      false, 20971520, array['application/pdf', 'image/jpeg', 'image/png'])
on conflict (id) do update
  set public = excluded.public, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

-- The event an object belongs to: the first path folder, if it is the id of an existing event; otherwise NULL (→ refused).
create or replace function race_storage_event(p_name text)
returns uuid
language plpgsql stable security definer
set search_path = ''
as $$
declare
  v_folder text := (storage.foldername(p_name))[1];
  v_id uuid;
begin
  if v_folder is null or v_folder !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return null;
  end if;
  select e.id into v_id from public.race_events e where e.id = v_folder::uuid;
  return v_id;
end;
$$;

-- race-evidence -------------------------------------------------------------------------------------------------------------------------
create policy "race evidence: judges and control upload for their event" on storage.objects for insert to authenticated
  with check (bucket_id = 'race-evidence' and race_storage_event(name) is not null
              and (public.race_is_super_admin() or public.race_has_role(race_storage_event(name), array['EVENT_MANAGER', 'MASTER_CONTROL', 'JUDGE']::public.race_role[])));
create policy "race evidence: control and the uploader read" on storage.objects for select to authenticated
  using (bucket_id = 'race-evidence' and race_storage_event(name) is not null
         and (public.race_is_control(race_storage_event(name)) or (owner = auth.uid() and public.race_auth_active())));
-- no UPDATE or DELETE policy: evidence is immutable through the API.

-- race-athlete-photos -------------------------------------------------------------------------------------------------------------------
create policy "race athlete photos: front of house upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'race-athlete-photos' and race_storage_event(name) is not null and public.race_is_ops(race_storage_event(name)));
create policy "race athlete photos: front of house read" on storage.objects for select to authenticated
  using (bucket_id = 'race-athlete-photos' and race_storage_event(name) is not null and public.race_is_ops(race_storage_event(name)));
create policy "race athlete photos: manager deletes" on storage.objects for delete to authenticated
  using (bucket_id = 'race-athlete-photos' and race_storage_event(name) is not null and public.race_is_manager(race_storage_event(name)));

-- race-event-assets (public) ------------------------------------------------------------------------------------------------------------
create policy "race event assets: everyone reads" on storage.objects for select to anon, authenticated
  using (bucket_id = 'race-event-assets');
create policy "race event assets: manager writes" on storage.objects for insert to authenticated
  with check (bucket_id = 'race-event-assets' and race_storage_event(name) is not null and public.race_is_manager(race_storage_event(name)));
create policy "race event assets: manager updates" on storage.objects for update to authenticated
  using (bucket_id = 'race-event-assets' and race_storage_event(name) is not null and public.race_is_manager(race_storage_event(name)))
  with check (bucket_id = 'race-event-assets' and race_storage_event(name) is not null and public.race_is_manager(race_storage_event(name)));
create policy "race event assets: manager deletes" on storage.objects for delete to authenticated
  using (bucket_id = 'race-event-assets' and race_storage_event(name) is not null and public.race_is_manager(race_storage_event(name)));

-- race-documents ------------------------------------------------------------------------------------------------------------------------
create policy "race documents: event staff read" on storage.objects for select to authenticated
  using (bucket_id = 'race-documents' and race_storage_event(name) is not null and public.race_is_event_staff(race_storage_event(name)));
create policy "race documents: manager writes" on storage.objects for insert to authenticated
  with check (bucket_id = 'race-documents' and race_storage_event(name) is not null and public.race_is_manager(race_storage_event(name)));
create policy "race documents: manager updates" on storage.objects for update to authenticated
  using (bucket_id = 'race-documents' and race_storage_event(name) is not null and public.race_is_manager(race_storage_event(name)))
  with check (bucket_id = 'race-documents' and race_storage_event(name) is not null and public.race_is_manager(race_storage_event(name)));
create policy "race documents: manager deletes" on storage.objects for delete to authenticated
  using (bucket_id = 'race-documents' and race_storage_event(name) is not null and public.race_is_manager(race_storage_event(name)));
