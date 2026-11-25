import {recoveryTables} from './recovery-capacity';

export const snapshotMaxRows = 10_000;
export const snapshotMaxWireBytes = 8 * 1024 * 1024;
const snapshotMaxRowBytes = 1024 * 1024;
const snapshotMaxSchemaBytes = 256 * 1024;
const allowedTables = new Set<string>([...recoveryTables, 'd1_migrations', '__drizzle_migrations', 'sqlite_sequence']);
const platformNames = ['_cf_METADATA', 'sqlite_stat1', 'sqlite_stat2', 'sqlite_stat3', 'sqlite_stat4'];
const ignored = platformNames.map(name => "'" + name + "'").join(',');
const schemaQuery = `SELECT type, name, tbl_name, sql FROM sqlite_schema WHERE sql IS NOT NULL AND name NOT IN (${ignored}) AND tbl_name NOT IN (${ignored}) ORDER BY type,name`;
const encoder = new TextEncoder();
const ident = (value:string) => '"' + value.replace(/"/g, '""') + '"';
const literal = (value:string) => "'" + value.replace(/'/g, "''") + "'";

export type SchemaEntry={type:string;name:string;tbl_name:string;sql:string};
type SqlColumn={name:string;pk:number;hidden:number};
type SqlTable={name:string;type:string;wr:number};
export type SnapshotTable={name:string;columns:string[];rowidAlias:string|null;rows:string[]};
type TablePlan=Omit<SnapshotTable,'rows'>&{query:string;wire:string;source:string};
type Count={n:number;bytes:number;largest:number};
type PackedRow=Count&{wire:string|null};

function schemaFits(schema:SchemaEntry[]) {
  const names = schema.filter(entry=>entry.type==='table').map(entry=>entry.name);
  const set = new Set(names);
  if (!schema.length || schema.length > 512 ||
      encoder.encode(JSON.stringify(schema)).length > snapshotMaxSchemaBytes ||
      names.some(name=>!allowedTables.has(name)) ||
      recoveryTables.some(name=>!set.has(name)) ||
      schema.some(entry=>!['table','index','trigger','view'].includes(entry.type) ||
        (entry.type!=='view' && !allowedTables.has(entry.tbl_name)))) throw new Error('Unexpected database schema');
  return [...names.filter(name=>name!=='sqlite_sequence'),...names.filter(name=>name==='sqlite_sequence')];
}

/** Tag SQLite values before crossing the JS boundary (binary, NUL and int64 included). */
function encoded(value:string) {
  return `json_quote(CASE typeof(${value}) WHEN 'null' THEN NULL WHEN 'integer' THEN 'i'||CAST(${value} AS TEXT) WHEN 'real' THEN 'r'||printf('%!.26g', ${value}) WHEN 'text' THEN 't'||hex(CAST(${value} AS BLOB)) WHEN 'blob' THEN 'b'||hex(${value}) END)`;
}

function planTable(name:string, table:SqlTable|undefined, fields:SqlColumn[]):TablePlan {
  if (table?.type!=='table' || ![0,1].includes(table.wr) || !fields.length || fields.length>80 ||
      fields.some(field=>field.hidden!==0 || !field.name || field.name.length>128)) throw new Error('Unsupported SQLite table');
  const names = new Set(fields.map(field=>field.name.toLowerCase()));
  const columns = fields.map(field=>field.name);
  const rowidAlias = table.wr ? null : (['_rowid_','rowid','oid'].find(alias=>!names.has(alias)) ?? null);
  const ordered = fields.filter(field=>field.pk>0).sort((a,b)=>a.pk-b.pk).map(field=>ident(field.name));
  if ((!table.wr && !rowidAlias) || (table.wr && !ordered.length)) throw new Error('Unaddressable SQLite rows');
  const sourceColumns = (rowidAlias ? [rowidAlias,...columns] : columns).map(ident);
  const wire = "'['||" + sourceColumns.map(col=>encoded('d1_rows.'+col)).join("||','||") + "||']'";
  const width = [String(sourceColumns.length+1), ...sourceColumns.map(col=>
    `(CASE typeof(${col}) WHEN 'null' THEN 4 WHEN 'text' THEN 3+2*length(CAST(${col} AS BLOB)) WHEN 'blob' THEN 3+2*length(${col}) ELSE length(${encoded(col)}) END)`,
  )].join('+');
  const order = rowidAlias ? ident(rowidAlias) : ordered.join(',');
  // Size text and blobs without allocating their hex representation. Over-budget data
  // never leaves D1, including if the size grows between preflight and the atomic batch.
  const query = `WITH sizes AS (SELECT ${width} AS bytes FROM ${ident(name)} ORDER BY ${order} LIMIT ${snapshotMaxRows+1}),
    totals AS MATERIALIZED (SELECT count(*) AS n, coalesce(sum(bytes),0) AS bytes, coalesce(max(bytes),0) AS largest FROM sizes)`;
  return {name,columns,rowidAlias,query,wire,source:ident(name)};
}

function countOK(x:Count|undefined):x is Count {
  return !!x && Number.isSafeInteger(x.n) && x.n>=0 && x.n<=snapshotMaxRows &&
    Number.isSafeInteger(x.bytes) && x.bytes>=0 && x.bytes<=snapshotMaxWireBytes &&
    Number.isSafeInteger(x.largest) && x.largest>=0 && x.largest<=snapshotMaxRowBytes;
}

function resultsOf<T>(result:D1Result<T>|undefined) {
  if (!result?.success || !Array.isArray(result.results)) throw new Error('Incomplete SQLite results');
  return result.results;
}

async function planDatabase(db:D1Database) {
  // Discovery and sizing are not the snapshot. The final batch retains all data and its schema
  // in one transaction and fails closed if schema or any memory budget changes in the gap.
  const schema = resultsOf(await db.prepare(schemaQuery).all<SchemaEntry>());
  const names = schemaFits(schema);
  const [tableInfo,...columnInfo] = await db.batch<SqlTable|SqlColumn>([
    db.prepare('PRAGMA table_list'), ...names.map(name=>db.prepare(`PRAGMA table_xinfo(${literal(name)})`)),
  ]);
  const tableByName = new Map((resultsOf(tableInfo) as SqlTable[]).map(row=>[row.name,row]));
  const plans = names.map((name,i)=>planTable(name,tableByName.get(name),resultsOf(columnInfo[i]) as SqlColumn[]));
  const budgets = (await db.batch<Count>(plans.map(plan=>db.prepare(
    `${plan.query} SELECT n,bytes,largest FROM totals`,
  )))).map(result=>resultsOf(result)[0]);
  if (budgets.length!==plans.length || budgets.some(value=>!value ||
      !Number.isSafeInteger(value.n) || !Number.isSafeInteger(value.bytes) || !Number.isSafeInteger(value.largest))) {
    throw new Error('Incomplete SQLite sizing');
  }
  const wireBytes = budgets.reduce((sum,box)=>sum+box.bytes,0);
  const transferBudgetBytes = budgets.reduce((sum,box)=>sum+box.bytes+box.n*48,0);
  const fits = budgets.every(countOK)&&transferBudgetBytes<=snapshotMaxWireBytes;
  return {schema,plans,budgets,wireBytes,transferBudgetBytes,fits};
}

export async function assessDatabaseTransfer(db:D1Database) {
  const {plans,budgets,wireBytes,transferBudgetBytes,fits}=await planDatabase(db);
  return {fits,wireBytes,transferBudgetBytes,rowLimit:snapshotMaxRows,byteLimit:snapshotMaxWireBytes,
    singleRowByteLimit:snapshotMaxRowBytes,countsCapped:budgets.some(b=>b.n>snapshotMaxRows),
    tables:plans.map((table,i)=>({name:table.name,rows:budgets[i].n,wireBytes:budgets[i].bytes,largestRowBytes:budgets[i].largest,
      countCapped:budgets[i].n>snapshotMaxRows}))};
}

export async function captureDatabase(db:D1Database) {
  const {schema,plans,budgets,fits}=await planDatabase(db);
  if(!fits) throw new Error('Database exceeds bounded transfer capacity');
  const startedAt = new Date().toISOString();
  const [snapSchema,...packedTables] = await db.batch<SchemaEntry|PackedRow>([
    db.prepare(schemaQuery),
    ...plans.map((plan,i)=>db.prepare(`${plan.query}
      SELECT n, bytes, largest, NULL AS wire FROM totals
      UNION ALL SELECT NULL, NULL, NULL, ${plan.wire} FROM totals CROSS JOIN ${plan.source} AS d1_rows
        WHERE totals.n <= ?1 AND totals.bytes <= ?2 AND totals.largest <= ?3`)
      .bind(budgets[i].n,budgets[i].bytes,snapshotMaxRowBytes)),
  ]);
  const completedAt = new Date().toISOString();
  if (JSON.stringify(resultsOf(snapSchema))!==JSON.stringify(schema)) throw new Error('Database schema changed');
  const tables:SnapshotTable[] = plans.map(({name,columns,rowidAlias},i)=>{
    const [stats,...lines] = resultsOf(packedTables[i]) as PackedRow[];
    const rows = lines.map(line=>line.wire);
    if (!countOK(stats) || stats.wire!==null || stats.n!==rows.length || stats.n>budgets[i].n || stats.bytes>budgets[i].bytes ||
        !rows.every((row):row is string=>typeof row==='string') ||
        stats.bytes!==rows.reduce((sum,row)=>sum+(row?.length??0),0)) throw new Error('Database changed beyond transfer capacity');
    return {name,columns,rowidAlias,rows};
  });
  return {startedAt,completedAt,schema,tables};
}
