import {InputError} from '@/lib/submission-validation';

export const recoveryTables = ["account_links","analytics_daily","analytics_events","analytics_meta","calendar_events","calendar_history","calendar_members","calendar_types","claim_eligibility_cache","claim_review_events","claim_rpc_usage","control_audit_events","control_content","control_installation","control_members","control_metric_events","control_project_artwork","control_roles","control_settings","discovery_config","discovery_members","discovery_reads","edit_review_events","lammb_vault_limits","lammb_vault_receipts","lammb_vault_treasury","lammb_vault_wallets","notification_outbox","profile_artwork","profile_events","profiles","project_artwork","project_categories","project_claims","project_controls","project_edits","project_follows","project_overrides","project_owners","project_update_events","project_updates","review_alert_receipts","review_events","saved_projects","source_suggestions","submissions","taxonomy_categories","taxonomy_reviews","wallet_claim_challenges","wallet_claim_checks","wallet_claim_evidence"] as const;
const applicationTables = new Set<string>(recoveryTables);
export const recoveryMigrationLedgers = ['d1_migrations','__drizzle_migrations','__appgarden_migrations'] as const;
const ledgers = new Set<string>(recoveryMigrationLedgers);
const inventoryQuery = "SELECT name FROM sqlite_schema WHERE type='table' AND name <> '_cf_METADATA' ORDER BY name";
const rowLimit = 2000;
const approaching = 1600;
const serializedLimitBytes = 12 * 1024 * 1024;

export async function recoveryCapacity(db:D1Database) {
  const startedAt = new Date().toISOString();
  const [inventory,...counts] = await db.batch<{name?:string; total?:number}>([
    db.prepare(inventoryQuery),
    ...recoveryTables.map(table => db.prepare(`SELECT count(*) AS total FROM "${table}"`)),
  ]);
  const names = inventory.results.map(row => row.name ?? '');
  const missing = recoveryTables.filter(table => !names.includes(table));
  const unrecognizedTableCount = names.filter(name => !applicationTables.has(name) && !ledgers.has(name) &&
    !name.startsWith('sqlite_')).length;
  const tables = recoveryTables.map((table,index) => {
    const rowCount = counts[index].results[0]?.total;
    if (rowCount === undefined || !Number.isSafeInteger(rowCount) || rowCount < 0) {
      throw new InputError('Capacity result is incomplete.',503);
    }
    return {table,rowCount};
  });
  const largest = tables.reduce((a,b) => b.rowCount > a.rowCount ? b : a);
  const databaseBytes = inventory.meta.size_after;
  return {
    startedAt, completedAt:new Date().toISOString(),
    applicationTableCount:tables.length,
    totalRows:tables.reduce((total,table) => total + table.rowCount,0),
    tables, largest,
    approachingRowLimit:tables.filter(table => table.rowCount >= approaching && table.rowCount <= rowLimit),
    exceedingRowLimit:tables.filter(table => table.rowCount > rowLimit),
    rowLimit, serializedLimitBytes, serializedSizeStatus:'unverified' as const,
    largestTableRowLimitUtilization:largest.rowCount / rowLimit,
    databaseSizeBytes:Number.isSafeInteger(databaseBytes) && databaseBytes > 0 ? databaseBytes : null,
    expectedTableInventoryMatches:missing.length === 0 && unrecognizedTableCount === 0,
    unrecognizedTableCount,
    migrationLedgerTables:names.filter(name => ledgers.has(name)),
    sequencesPresent:names.includes('sqlite_sequence'),
  };
}
