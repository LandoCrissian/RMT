import { sql } from "drizzle-orm";
import { sqliteTable, text, integer, index, uniqueIndex, check } from "drizzle-orm/sqlite-core";

export const submissions = sqliteTable("submissions", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  accountEmail: text("account_email").notNull(),
  name: text("name").notNull(),
  normalizedName: text("normalized_name").notNull(),
  summary: text("summary").notNull(),
  category: text("category").notNull(),
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
