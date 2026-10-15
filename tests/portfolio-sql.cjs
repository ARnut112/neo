'use strict';
// Optional integration check: install @electric-sql/pglite in a temporary test directory.
// Uses actual PostgreSQL SQL/RLS, with minimal auth/storage tables standing in for Supabase.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
let PGlite;
try { ({ PGlite } = require('@electric-sql/pglite')); } catch (error) { if (error.code !== 'MODULE_NOT_FOUND') throw error; }
test('portfolio SQL preserves seed records and protects admin tables and storage writes', {skip: !PGlite && 'Optional @electric-sql/pglite dependency not installed'}, async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      create role anon; create role authenticated; create role service_role bypassrls;
      create schema auth; create schema storage;
      create table auth.users(id uuid primary key, email text, email_confirmed_at timestamptz);
      insert into auth.users values('11111111-1111-4111-8111-111111111111','arnut369@gmail.com',now());
      create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
      create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text references storage.buckets(id),name text);
      alter table storage.objects enable row level security;
      grant usage on schema storage to anon, authenticated;
      grant select,insert,update,delete on storage.objects to anon,authenticated;
      create policy existing_other_bucket_policy on storage.objects for all to anon,authenticated using(true) with check(true);
      insert into storage.buckets values('unrelated','unrelated',true,null,null);
    `);
    const sql=fs.readFileSync(path.join(__dirname,'..','supabase','portfolio.sql'),'utf8');
    await db.exec(sql);
    assert.equal((await db.query('select count(*)::int as total from public.portfolio_photos')).rows[0].total,64);
    assert.equal((await db.query('select count(*)::int as total from public.portfolio_admins')).rows[0].total,1);
    const photo=(await db.query("select * from public.portfolio_photos where channel='production' limit 1")).rows[0];
    await db.query('update public.portfolio_photos set published=false where id=$1',[photo.id]);
    await db.exec(sql);
    assert.equal((await db.query('select count(*)::int as total from public.portfolio_photos')).rows[0].total,64,'repeat setup does not duplicate photos');
    assert.equal((await db.query('select published from public.portfolio_photos where id=$1',[photo.id])).rows[0].published,false,'repeat setup preserves visibility');
    await db.exec('set role anon');
    await assert.rejects(db.query('select * from public.portfolio_photos'),{code:'42501'});
    await assert.rejects(db.query("insert into storage.objects(bucket_id,name) values('portfolio-images','forged.jpg')"),{code:'42501'});
    await db.query("insert into storage.objects(bucket_id,name) values('unrelated','allowed.jpg')");
    await db.exec('reset role; set role authenticated');
    await assert.rejects(db.query("insert into portfolio_admins(user_id) values('11111111-1111-4111-8111-111111111111')"),{code:'42501'});
    await assert.rejects(db.query("insert into storage.objects(bucket_id,name) values('portfolio-images','forged.jpg')"),{code:'42501'});
    await db.exec('reset role; set role service_role');
    assert.equal((await db.query('select count(*)::int as total from portfolio_photos')).rows[0].total,64);
    await assert.rejects(db.query('delete from portfolio_admins'),{code:'42501'});
    await assert.rejects(db.query("insert into portfolio_photos(channel,category,local_path,alt,width,height,published,ready) values('preview','wedding','img/../secret.jpg','Invalid',32,16,true,true)"),{code:'23514'});
    await assert.rejects(db.query("insert into portfolio_photos(channel,category,storage_path,alt,width,height,published,ready) values('preview','wedding','production/wedding/22222222-2222-4222-8222-222222222222.jpg','Wrong channel',32,16,true,true)"),{code:'23514'});
    await assert.rejects(db.query("insert into portfolio_photos(channel,category,storage_path,alt,width,height,published,ready) values('preview','wedding','preview/wedding/22222222-2222-4222-8222-222222222222.jpg','Incomplete',32,16,true,false)"),{code:'23514'});
    await db.exec('reset role');
  } finally { await db.close(); }
});
