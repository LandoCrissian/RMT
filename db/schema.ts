import { sql } from "drizzle-orm";
import { sqliteTable, text, integer, index, uniqueIndex, check, primaryKey } from "drizzle-orm/sqlite-core";

export const submissions = sqliteTable("submissions", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  accountEmail: text("account_email").notNull(),
  name: text("name").notNull(),
  normalizedName: text("normalized_name").notNull(),
  summary: text("summary").notNull(),
  category: text("category").notNull(),
  stage: text("stage").notNull().default("building"),
  website: text("website").notNull(),
  normalizedHost: text("normalized_host").notNull(),
  launchUrl: text("launch_url").notNull(),
  xProfile: text("x_profile").notNull(),
  contactEmail: text("contact_email").notNull().default(""),
  ownershipEvidence: text("ownership_evidence").notNull(),
  verificationCode: text("verification_code").notNull(),
  status: text("status").notNull().default("pending"),
  reviewNote: text("review_note").notNull().default(""),
  revision: integer("revision").notNull().default(1),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
}, table => [
  uniqueIndex("submissions_unique_active_host").on(table.normalizedHost).where(sql`${table.status} <> 'rejected'`),
  uniqueIndex("submissions_unique_active_name").on(table.normalizedName).where(sql`${table.status} <> 'rejected'`),
  index("submissions_user_created").on(table.userId, table.createdAt),
  index("submissions_status_created").on(table.status, table.createdAt),
  check("submissions_valid_status", sql`${table.status} IN ('pending','needs_changes','approved','rejected','suspended')`),
  check("submissions_valid_category", sql`${table.category} IN ('Games','Music','Tools','Community')`),
]);

export const reviewEvents = sqliteTable("review_events", {
  id: text("id").primaryKey(),
  submissionId: text("submission_id").notNull().references(() => submissions.id),
  reviewerId: text("reviewer_id").notNull(),
  previousStatus: text("previous_status").notNull(),
  nextStatus: text("next_status").notNull(),
  note: text("note").notNull(),
  revision: integer("revision").notNull(),
  createdAt: integer("created_at").notNull(),
}, table => [index("review_events_submission").on(table.submissionId, table.createdAt)]);

export const projectClaims = sqliteTable('project_claims', {
  id: text('id').primaryKey(), projectId: text('project_id').notNull(), projectName: text('project_name').notNull(),
  userId: text('user_id').notNull(), accountEmail: text('account_email').notNull(), method: text('method').notNull(),
  officialChannelUrl: text('official_channel_url').notNull(), verificationCode: text('verification_code').notNull(),
  proofUrl: text('proof_url').notNull().default(''), note: text('note').notNull().default(''),
  status: text('status').notNull().default('draft'), reviewNote: text('review_note').notNull().default(''),
  revision: integer('revision').notNull().default(1), expiresAt: integer('expires_at').notNull(),
  createdAt: integer('created_at').notNull(), updatedAt: integer('updated_at').notNull(),
}, table => [
  index('claims_user_created').on(table.userId,table.createdAt), index('claims_project_status').on(table.projectId,table.status),
  check('claims_valid_status',sql`${table.status} IN ('draft','pending','approved','rejected','revoked')`),
  check('claims_valid_method',sql`${table.method} IN ('website','x','opensea')`),
]);
export const claimReviewEvents = sqliteTable('claim_review_events', {
  id:text('id').primaryKey(), claimId:text('claim_id').notNull().references(()=>projectClaims.id), reviewerId:text('reviewer_id').notNull(),
  previousStatus:text('previous_status').notNull(), nextStatus:text('next_status').notNull(), note:text('note').notNull(),
  revision:integer('revision').notNull(), createdAt:integer('created_at').notNull(),
},table=>[index('claim_events_claim').on(table.claimId,table.createdAt)]);
export const projectOwners = sqliteTable('project_owners', {
  projectId:text('project_id').primaryKey(), userId:text('user_id').notNull(), claimId:text('claim_id'),
  status:text('status').notNull().default('active'), revision:integer('revision').notNull().default(1),
  createdAt:integer('created_at').notNull(), updatedAt:integer('updated_at').notNull(),
},table=>[index('owners_user_status').on(table.userId,table.status),check('owner_valid_status',sql`${table.status} IN ('active','revoked')`)]);
export const projectEdits = sqliteTable('project_edits', {
  id:text('id').primaryKey(), projectId:text('project_id').notNull(), projectName:text('project_name').notNull(), userId:text('user_id').notNull(),
  ownershipRevision:integer('ownership_revision').notNull(), baseRevision:integer('base_revision').notNull(), payloadJson:text('payload_json').notNull(),
  status:text('status').notNull().default('pending'), reviewNote:text('review_note').notNull().default(''), revision:integer('revision').notNull().default(1),
  createdAt:integer('created_at').notNull(), updatedAt:integer('updated_at').notNull(),
},table=>[
  uniqueIndex('edits_one_pending_project').on(table.projectId).where(sql`${table.status} = 'pending'`),
  index('edits_user_created').on(table.userId,table.createdAt),index('edits_status_created').on(table.status,table.createdAt),
  check('edit_valid_status',sql`${table.status} IN ('pending','approved','rejected')`),
]);
export const projectOverrides = sqliteTable('project_overrides', {
  projectId:text('project_id').primaryKey(), payloadJson:text('payload_json').notNull(), revision:integer('revision').notNull(),
  editId:text('edit_id').notNull().references(()=>projectEdits.id), updatedAt:integer('updated_at').notNull(),
});
export const editReviewEvents = sqliteTable('edit_review_events', {
  id:text('id').primaryKey(),editId:text('edit_id').notNull().references(()=>projectEdits.id),reviewerId:text('reviewer_id').notNull(),
  previousStatus:text('previous_status').notNull(),nextStatus:text('next_status').notNull(),note:text('note').notNull(),
  revision:integer('revision').notNull(),createdAt:integer('created_at').notNull(),
},table=>[index('edit_events_edit').on(table.editId,table.createdAt)]);
export const notificationOutbox = sqliteTable('notification_outbox', {
  id:text('id').primaryKey(), eventKey:text('event_key').notNull(), kind:text('kind').notNull(), entityId:text('entity_id').notNull(),
  projectName:text('project_name').notNull(),channel:text('channel').notNull(),status:text('status').notNull().default('pending'),
  attemptCount:integer('attempt_count').notNull().default(0),providerId:text('provider_id').notNull().default(''),lastError:text('last_error').notNull().default(''),
  payloadJson:text('payload_json').notNull().default(''),firstAttemptAt:integer('first_attempt_at'),sentAt:integer('sent_at'),
  createdAt:integer('created_at').notNull(),updatedAt:integer('updated_at').notNull(),
},table=>[
  uniqueIndex('outbox_event_channel').on(table.eventKey,table.channel),index('outbox_status_created').on(table.status,table.createdAt),
  check('outbox_valid_kind',sql`${table.kind} IN ('submission','claim','edit','update')`),check('outbox_valid_channel',sql`${table.channel} IN ('email','sms')`),
  check('outbox_valid_status',sql`${table.status} IN ('pending','sending','sent','failed','unconfigured','uncertain')`),
]);

export const savedProjects = sqliteTable('saved_projects', {
  userId: text('user_id').notNull(),
  projectId: text('project_id').notNull(),
  createdAt: integer('created_at').notNull(),
}, table => [
  primaryKey({columns: [table.userId, table.projectId]}),
  index('saved_projects_user_created').on(table.userId, table.createdAt),
]);

export const reviewAlertReceipts = sqliteTable('review_alert_receipts', {
  reviewerId: text('reviewer_id').notNull(),
  eventKey: text('event_key').notNull(),
  acknowledgedAt: integer('acknowledged_at').notNull(),
}, table => [
  primaryKey({columns: [table.reviewerId, table.eventKey]}),
  index('review_alert_receipts_reviewer_acknowledged').on(table.reviewerId, table.acknowledgedAt),
]);

export const accountLinks = sqliteTable("account_links", {
  firebaseUid: text("firebase_uid").primaryKey(),
  legacyUserId: text("legacy_user_id").notNull().unique(),
  createdAt: integer("created_at").notNull(),
});

export const projectArtwork = sqliteTable('project_artwork', {
  id: text('id').primaryKey(), projectId: text('project_id').notNull(), userId: text('user_id').notNull(),
  ownershipRevision: integer('ownership_revision').notNull(), kind: text('kind').notNull(),
  objectKey: text('object_key').notNull(), mime: text('mime').notNull(), width: integer('width').notNull(),
  height: integer('height').notNull(), byteSize: integer('byte_size').notNull(), digest: text('digest').notNull(),
  status: text('status').notNull().default('uploading'), createdAt: integer('created_at').notNull(),
}, table => [
  index('artwork_user_created').on(table.userId, table.createdAt),
  index('artwork_project_status').on(table.projectId, table.status),
  uniqueIndex('artwork_object_key').on(table.objectKey),
  check('artwork_valid_kind', sql`${table.kind} IN ('logo','banner')`),
  check('artwork_valid_mime', sql`${table.mime} IN ('image/png','image/jpeg','image/webp')`),
  check('artwork_valid_status', sql`${table.status} IN ('uploading','ready','failed')`),
]);


export const projectUpdates = sqliteTable('project_updates', {
  id: text('id').primaryKey(), projectId: text('project_id').notNull(), projectName: text('project_name').notNull(),
  userId: text('user_id').notNull(), ownershipRevision: integer('ownership_revision').notNull(),
  kind: text('kind').notNull(), title: text('title').notNull(), body: text('body').notNull(),
  linkLabel: text('link_label').notNull().default(''), linkUrl: text('link_url').notNull().default(''),
  status: text('status').notNull().default('draft'), reviewNote: text('review_note').notNull().default(''),
  revision: integer('revision').notNull().default(1), publishedAt: integer('published_at'),
  createdAt: integer('created_at').notNull(), updatedAt: integer('updated_at').notNull(),
}, table => [
  uniqueIndex('updates_one_pending_project').on(table.projectId).where(sql`${table.status} = 'pending'`),
  index('updates_user_updated').on(table.userId, table.updatedAt, table.id),
  index('updates_project_published').on(table.projectId, table.status, table.publishedAt, table.id),
  index('updates_review_updated').on(table.status, table.updatedAt, table.id),
  check('updates_valid_status', sql`${table.status} IN ('draft','pending','approved','rejected','archived')`),
  check('updates_valid_kind', sql`${table.kind} IN ('announcement','progress','release')`),
]);
export const projectUpdateEvents = sqliteTable('project_update_events', {
  id: text('id').primaryKey(), updateId: text('update_id').notNull().references(() => projectUpdates.id),
  actorId: text('actor_id').notNull(), action: text('action').notNull(), previousStatus: text('previous_status').notNull(),
  nextStatus: text('next_status').notNull(), note: text('note').notNull().default(''),
  revision: integer('revision').notNull(), createdAt: integer('created_at').notNull(),
}, table => [
  index('update_events_update_created').on(table.updateId, table.createdAt),
  index('update_events_actor_action_created').on(table.actorId, table.action, table.createdAt),
]);

export const profiles = sqliteTable('profiles', {
  userId: text('user_id').primaryKey(), handle: text('handle'), displayName: text('display_name').notNull().default(''),
  bio: text('bio').notNull().default(''), visibility: text('visibility').notNull().default('private'),
  showManagedProjects: integer('show_managed_projects').notNull().default(0),
  avatarAssetId: text('avatar_asset_id'), bannerAssetId: text('banner_asset_id'), linksJson: text('links_json').notNull().default('[]'),
  lastMutationId: text('last_mutation_id').notNull().default(''),
  revision: integer('revision').notNull().default(1), firstPublishedAt: integer('first_published_at'),
  createdAt: integer('created_at').notNull(), updatedAt: integer('updated_at').notNull(),
},table=>[
  uniqueIndex('profiles_unique_handle').on(table.handle),
  check('profiles_valid_visibility',sql`${table.visibility} IN ('private','public')`),
  check('profiles_valid_project_optin',sql`${table.showManagedProjects} IN (0,1)`),
  check('profiles_lowercase_handle',sql`${table.handle} IS NULL OR ${table.handle} = lower(${table.handle})`),
  check('profiles_public_identity',sql`${table.visibility} = 'private' OR (${table.handle} IS NOT NULL AND length(${table.displayName}) >= 2 AND ${table.firstPublishedAt} IS NOT NULL)`),
]);
export const profileEvents = sqliteTable('profile_events', {
  id: text('id').primaryKey(), userId: text('user_id').notNull().references(()=>profiles.userId),
  revision: integer('revision').notNull(), visibility: text('visibility').notNull(), createdAt: integer('created_at').notNull(),
},table=>[
  uniqueIndex('profile_events_revision').on(table.userId,table.revision),
  index('profile_events_user_created').on(table.userId,table.createdAt),
]);
export const profileArtwork = sqliteTable('profile_artwork', {
  id: text('id').primaryKey(), userId: text('user_id').notNull(), kind: text('kind').notNull(), objectKey: text('object_key').notNull(),
  mime: text('mime').notNull(), width: integer('width').notNull(), height: integer('height').notNull(), byteSize: integer('byte_size').notNull(),
  digest: text('digest').notNull(), status: text('status').notNull().default('uploading'), createdAt: integer('created_at').notNull(),
},table=>[
  uniqueIndex('profile_artwork_object_key').on(table.objectKey),
  index('profile_artwork_user_created').on(table.userId,table.createdAt),
  check('profile_artwork_valid_kind',sql`${table.kind} IN ('avatar','banner')`),
  check('profile_artwork_valid_mime',sql`${table.mime} = 'image/png'`),
  check('profile_artwork_valid_status',sql`${table.status} IN ('uploading','ready','failed')`),
]);

// Release 13 management records are additive; runtime owner IDs stay in secrets.
export const controlMembers = sqliteTable('control_members', {
 userId:text('user_id').primaryKey(),email:text('email').notNull().default(''),displayName:text('display_name').notNull().default(''),
 providersJson:text('providers_json').notNull().default('[]'),emailVerified:integer('email_verified'),
 firstSeenAt:integer('first_seen_at'),lastSeenAt:integer('last_seen_at'),historicalSinceAt:integer('historical_since_at'),
 status:text('status').notNull().default('active'),statusReason:text('status_reason').notNull().default(''),revision:integer('revision').notNull().default(1),
 createdAt:integer('created_at').notNull(),updatedAt:integer('updated_at').notNull(),
},table=>[index('control_members_status_user').on(table.status,table.userId),index('control_members_seen').on(table.lastSeenAt),check('control_members_status_valid',sql`${table.status} IN ('active','suspended')`),check('control_members_verified_valid',sql`${table.emailVerified} IS NULL OR ${table.emailVerified} IN (0,1)`)]);
export const controlRoles=sqliteTable('control_roles',{
 userId:text('user_id').primaryKey().references(()=>controlMembers.userId),role:text('role').notNull().default('member'),revision:integer('revision').notNull().default(1),updatedAt:integer('updated_at').notNull(),updatedBy:text('updated_by').notNull(),
},table=>[check('control_roles_valid',sql`${table.role} IN ('member','admin','moderator')`)]);
export const controlAuditEvents=sqliteTable('control_audit_events',{
 id:text('id').primaryKey(),actorId:text('actor_id').notNull(),action:text('action').notNull(),entityType:text('entity_type').notNull(),entityId:text('entity_id').notNull(),reason:text('reason').notNull(),beforeJson:text('before_json').notNull().default('{}'),afterJson:text('after_json').notNull().default('{}'),createdAt:integer('created_at').notNull(),
},table=>[index('control_audit_created').on(table.createdAt,table.id),index('control_audit_entity').on(table.entityType,table.entityId,table.createdAt)]);
export const controlInstallation=sqliteTable('control_installation',{
 id:integer('id').primaryKey(),observedSince:integer('observed_since').notNull(),
},table=>[check('control_installation_singleton',sql`${table.id}=1`)]);
export const projectControls=sqliteTable('project_controls',{
 projectId:text('project_id').primaryKey(),source:text('source').notNull().default('existing'),definitionJson:text('definition_json'),spotlightJson:text('spotlight_json'),presentationJson:text('presentation_json'),nameOverride:text('name_override').notNull().default(''),payloadJson:text('payload_json'),
 normalizedName:text('normalized_name'),normalizedHost:text('normalized_host'),logoAssetId:text('logo_asset_id'),bannerAssetId:text('banner_asset_id'),artworkOverride:integer('artwork_override').notNull().default(0),baseOverrideRevision:integer('base_override_revision').notNull().default(0),visibility:text('visibility').notNull().default('public'),featured:integer('featured'),revision:integer('revision').notNull().default(1),createdAt:integer('created_at').notNull(),updatedAt:integer('updated_at').notNull(),
},table=>[index('project_controls_visibility_updated').on(table.visibility,table.updatedAt),index('project_controls_source_created').on(table.source,table.createdAt),uniqueIndex('project_controls_unique_admin_name').on(table.normalizedName).where(sql`${table.source}='admin' AND ${table.normalizedName} IS NOT NULL`),uniqueIndex('project_controls_unique_admin_host').on(table.normalizedHost).where(sql`${table.source}='admin' AND ${table.normalizedHost} IS NOT NULL`),check('project_controls_source_valid',sql`${table.source} IN ('existing','admin')`),check('project_controls_visibility_valid',sql`${table.visibility} IN ('public','hidden','archived')`),check('project_controls_featured_valid',sql`${table.featured} IS NULL OR ${table.featured} IN (0,1)`),check('project_controls_artwork_override_valid',sql`${table.artworkOverride} IN (0,1)`)]);
export const controlContent=sqliteTable('control_content',{
 entityType:text('entity_type').notNull(),entityId:text('entity_id').notNull(),hidden:integer('hidden').notNull().default(0),reason:text('reason').notNull().default(''),revision:integer('revision').notNull().default(1),createdAt:integer('created_at').notNull(),updatedAt:integer('updated_at').notNull(),
},table=>[primaryKey({columns:[table.entityType,table.entityId]}),index('control_content_hidden_updated').on(table.hidden,table.updatedAt),check('control_content_type_valid',sql`${table.entityType} IN ('profile','update')`),check('control_content_hidden_valid',sql`${table.hidden} IN (0,1)`)]);
export const controlSettings=sqliteTable('control_settings',{
 id:text('id').primaryKey(),payloadJson:text('payload_json').notNull(),revision:integer('revision').notNull(),updatedAt:integer('updated_at').notNull(),updatedBy:text('updated_by').notNull(),
},table=>[check('control_settings_singleton',sql`${table.id}='site'`)]);
export const controlMetricEvents=sqliteTable('control_metric_events',{
 id:text('id').primaryKey(),day:text('day').notNull(),kind:text('kind').notNull(),projectId:text('project_id').notNull().default(''),createdAt:integer('created_at').notNull(),
},table=>[index('control_metric_day_kind').on(table.day,table.kind),index('control_metric_project_day').on(table.projectId,table.day),check('control_metric_kind_valid',sql`${table.kind} IN ('visit','project_view','outbound')`)]);

export const controlProjectArtwork=sqliteTable('control_project_artwork',{
 id:text('id').primaryKey(),projectId:text('project_id').notNull(),uploaderId:text('uploader_id').notNull(),objectKey:text('object_key').notNull(),kind:text('kind').notNull(),mime:text('mime').notNull(),width:integer('width').notNull(),height:integer('height').notNull(),byteSize:integer('byte_size').notNull(),digest:text('digest').notNull(),status:text('status').notNull().default('uploading'),createdAt:integer('created_at').notNull(),
},table=>[uniqueIndex('control_artwork_object_key').on(table.objectKey),index('control_artwork_uploader_created').on(table.uploaderId,table.createdAt),index('control_artwork_project_status').on(table.projectId,table.status),check('control_artwork_kind_valid',sql`${table.kind} IN ('logo','banner')`),check('control_artwork_mime_valid',sql`${table.mime}='image/png'`),check('control_artwork_status_valid',sql`${table.status} IN ('uploading','ready','failed')`)]);

export const projectFollows = sqliteTable('project_follows', {
  userId:text('user_id').notNull(), projectId:text('project_id').notNull(), followedAt:integer('followed_at').notNull(),
}, t=>[primaryKey({columns:[t.userId,t.projectId]}),index('project_follow_counts').on(t.projectId,t.userId),
  index('member_follow_timeline').on(t.userId,t.followedAt,t.projectId)]);
