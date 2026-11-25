import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readdir,readFile} from 'node:fs/promises';
const dir=new URL('../drizzle/',import.meta.url);
const audit=JSON.parse(await readFile(new URL('../lib/category-audit.json',import.meta.url)));
test('migration reproduces all 24 reviewed classifications on existing identities and preserves original rows',async t=>{
 const db=new DatabaseSync(':memory:');t.after(()=>db.close());
 db.exec('PRAGMA foreign_keys=ON');
 for(const name of (await readdir(dir)).filter(n=>/^\d.*\.sql$/.test(n)&&n<'0015').sort())db.exec(await readFile(new URL(name,dir),'utf8'));
 const apex=audit.find(p=>p.projectId.startsWith('community-'));
 db.prepare("INSERT INTO submissions(id,user_id,account_email,name,normalized_name,summary,category,website,normalized_host,launch_url,x_profile,ownership_evidence,verification_code,status,created_at,updated_at) VALUES(?,'existing','private','APEX Rising','apex rising','approved summary','Games','https://apexrising.io/','apexrising.io','https://apexrising.io/','','private','private','approved',100,110)").run(apex.projectId.slice(10));
 db.prepare("INSERT INTO project_owners(project_id,user_id,status,revision,created_at,updated_at) values(?,'existing','active',1,100,110)").run(apex.projectId);
 const tables=db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all();
 const snapshots=tables.map(({name})=>{const columns=db.prepare('pragma table_info('+name+')').all().map(c=>c.name);const sql='select '+columns.join(',')+' from '+name;return [sql,db.prepare(sql).all()];});
 db.exec(await readFile(new URL('0015_project_categories.sql',dir),'utf8'));
 for(const [sql,rows] of snapshots)assert.deepEqual(db.prepare(sql).all(),rows);
 assert.equal(audit.length,24);assert.equal(db.prepare('select count(distinct project_id) n from project_categories').get().n,24);
 for(const row of audit){
  const memberships=db.prepare('select category_id as id,is_primary from project_categories where project_id=?').all(row.projectId);
  assert.deepEqual(memberships.filter(m=>m.is_primary).map(m=>m.id),[row.primary]);
  assert.deepEqual(memberships.filter(m=>!m.is_primary).map(m=>m.id).sort(),[...row.secondary].sort());
  assert.ok(row.sources.length>0&&row.sources.every(url=>url.startsWith('https://')));
 }
 assert.deepEqual(db.prepare('pragma foreign_key_check').all(),[]);
});
