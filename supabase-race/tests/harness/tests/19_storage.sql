-- THE NINTH's own Storage: buckets and policies (evidence, athlete photos, event assets, documents).
reset role;
select race_test.ok((select array_agg(id || ':' || public::text order by id) = array['race-athlete-photos:false', 'race-documents:false', 'race-event-assets:true', 'race-evidence:false']
                     from storage.buckets where id like 'race-%'), 'storage: four race buckets — evidence, athlete photos and documents PRIVATE, event assets public');
select race_test.ok((select count(*) = 4 from storage.buckets where id like 'race-%' and file_size_limit is not null and allowed_mime_types is not null), 'storage: every bucket has a size limit and a MIME allow-list');
select race_test.ok(not exists (select 1 from storage.buckets where id not like 'race-%'), 'storage: there is no non-race bucket in this project');
select race_test.ok((select allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp'] from storage.buckets where id = 'race-evidence'), 'storage: evidence accepts photos only');

-- helper: try to insert an object as a user
create function race_test.obj(p_bucket text, p_name text, p_owner text default null) returns void language plpgsql as $$
begin
  insert into storage.objects (bucket_id, name, owner) values (p_bucket, p_name, case when p_owner is null then auth.uid() else race_test.id(p_owner) end);
end $$;
grant execute on function race_test.obj(text, text, text) to anon, authenticated, service_role;

-- Evidence ------------------------------------------------------------------------------------------------------------------------------
-- Phase 10 tightened this: a JUDGE may only upload under <event>/rowing/<result>/ for a result at THEIR station (see 24_rowing_evidence.sql);
-- race control (here the Event Manager) may still upload anywhere under <event>/.
select race_test.login('bm_a');
select race_test.obj('race-evidence', race_test.id('event_a')::text || '/1/rowing-001.jpg');
select race_test.ok(exists (select 1 from storage.objects where bucket_id = 'race-evidence'), 'evidence: the Event Manager can upload under <event>/…');
select race_test.throws($$select race_test.obj('race-evidence', race_test.id('event_b')::text || '/1/x.jpg')$$, 'row-level security', 'evidence: … but not for another event');
select race_test.throws($$select race_test.obj('race-evidence', 'not-an-event/1/x.jpg')$$, 'row-level security', 'evidence: a path whose first folder is not an event is refused');
select race_test.throws($$select race_test.obj('race-evidence', gen_random_uuid()::text || '/1/x.jpg')$$, 'row-level security', 'evidence: … including an unknown event id');
select race_test.login('judge1');
select race_test.throws($$select race_test.obj('race-evidence', race_test.id('event_a')::text || '/1/judge-upload.jpg')$$, 'row-level security', 'evidence: a Judge can no longer upload outside <event>/rowing/<result>/ (Phase 10 tightening)');
select race_test.eq(race_test.count($$select 1 from storage.objects where bucket_id = 'race-evidence'$$), 0::bigint, 'evidence: … and a judge of another station cannot read it');
select race_test.login('bm_a');
select race_test.eq(race_test.count($$select 1 from storage.objects where bucket_id = 'race-evidence'$$), 1::bigint, 'evidence: the uploader reads their own object');
select race_test.eq(race_test.affected($$update storage.objects set name = name || 'x' where bucket_id = 'race-evidence'$$), 0::bigint, 'evidence: nobody can rename evidence (no UPDATE policy)');
select race_test.eq(race_test.affected($$delete from storage.objects where bucket_id = 'race-evidence'$$), 0::bigint, 'evidence: the uploader cannot delete it either (immutable)');
select race_test.login('master');
select race_test.eq(race_test.count($$select 1 from storage.objects where bucket_id = 'race-evidence'$$), 1::bigint, 'evidence: Master Control reads the event''s evidence');
select race_test.login('bm_a');
select race_test.eq(race_test.count($$select 1 from storage.objects where bucket_id = 'race-evidence'$$), 1::bigint, 'evidence: the Event Manager reads it');
select race_test.eq(race_test.affected($$delete from storage.objects where bucket_id = 'race-evidence'$$), 0::bigint, 'evidence: not even the Event Manager can delete it');
select race_test.login('rec');
select race_test.eq(race_test.count($$select 1 from storage.objects where bucket_id = 'race-evidence'$$), 0::bigint, 'evidence: Reception cannot read it');
select race_test.throws($$select race_test.obj('race-evidence', race_test.id('event_a')::text || '/1/r.jpg')$$, 'row-level security', 'evidence: Reception cannot upload it');
select race_test.login('bm_b');
select race_test.eq(race_test.count($$select 1 from storage.objects where bucket_id = 'race-evidence'$$), 0::bigint, 'evidence: another event''s manager cannot read it');
select race_test.login('plain_user');
select race_test.eq(race_test.count($$select 1 from storage.objects where bucket_id = 'race-evidence'$$), 0::bigint, 'evidence: an account with no role cannot read it');
select race_test.throws($$select race_test.obj('race-evidence', race_test.id('event_a')::text || '/1/p.jpg')$$, 'row-level security', 'evidence: … or upload');
select race_test.anon();
select race_test.eq(race_test.count($$select 1 from storage.objects where bucket_id = 'race-evidence'$$), 0::bigint, 'evidence: anonymous cannot read it');
select race_test.throws($$select race_test.obj('race-evidence', race_test.id('event_a')::text || '/1/a.jpg')$$, 'row-level security|permission denied', 'evidence: anonymous cannot upload');
reset role;

-- Athlete photos --------------------------------------------------------------------------------------------------------------------------
select race_test.login('rec');
select race_test.obj('race-athlete-photos', race_test.id('event_a')::text || '/N001.jpg');
select race_test.eq(race_test.count($$select 1 from storage.objects where bucket_id = 'race-athlete-photos'$$), 1::bigint, 'photos: Reception uploads and reads athlete photos of the event');
select race_test.login('judge1');
select race_test.eq(race_test.count($$select 1 from storage.objects where bucket_id = 'race-athlete-photos'$$), 0::bigint, 'photos: a Judge does not see them');
select race_test.login('rec');
select race_test.eq(race_test.affected($$delete from storage.objects where bucket_id = 'race-athlete-photos'$$), 0::bigint, 'photos: Reception cannot delete');
select race_test.login('bm_a');
select race_test.eq(race_test.affected($$delete from storage.objects where bucket_id = 'race-athlete-photos'$$), 1::bigint, 'photos: the Event Manager can delete');
reset role;

-- Event assets (public) ------------------------------------------------------------------------------------------------------------------
select race_test.login('bm_a');
select race_test.obj('race-event-assets', race_test.id('event_a')::text || '/logo.png');
select race_test.login('rec');
select race_test.throws($$select race_test.obj('race-event-assets', race_test.id('event_a')::text || '/x.png')$$, 'row-level security', 'assets: Reception cannot publish event assets');
select race_test.login('bm_b');
select race_test.throws($$select race_test.obj('race-event-assets', race_test.id('event_a')::text || '/x.png')$$, 'row-level security', 'assets: another event''s manager cannot publish into this event');
select race_test.anon();
select race_test.eq(race_test.count($$select 1 from storage.objects where bucket_id = 'race-event-assets'$$), 1::bigint, 'assets: the public reads event assets without signing in');
select race_test.throws($$select race_test.obj('race-event-assets', race_test.id('event_a')::text || '/y.png')$$, 'row-level security|permission denied', 'assets: … but cannot write');
select race_test.eq(race_test.affected($$delete from storage.objects where bucket_id = 'race-event-assets'$$), 0::bigint, 'assets: … or delete');
reset role;

-- Documents ---------------------------------------------------------------------------------------------------------------------------------
select race_test.login('bm_a');
select race_test.obj('race-documents', race_test.id('event_a')::text || '/run-of-show.pdf');
select race_test.login('judge1');
select race_test.eq(race_test.count($$select 1 from storage.objects where bucket_id = 'race-documents'$$), 1::bigint, 'documents: event staff (a Judge) can read them');
select race_test.throws($$select race_test.obj('race-documents', race_test.id('event_a')::text || '/j.pdf')$$, 'row-level security', 'documents: … but only the Event Manager writes');
select race_test.login('plain_user');
select race_test.eq(race_test.count($$select 1 from storage.objects where bucket_id = 'race-documents'$$), 0::bigint, 'documents: an account with no role cannot read them');
select race_test.anon();
select race_test.eq(race_test.count($$select 1 from storage.objects where bucket_id = 'race-documents'$$), 0::bigint, 'documents: anonymous cannot');
reset role;
select race_test.ok(not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname not like 'race %'), 'storage: every policy on storage.objects is a race policy');
