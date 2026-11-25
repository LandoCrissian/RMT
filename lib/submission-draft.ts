// Account-bound, per-tab recovery only. A sign-out or successful submission
// clears the draft. No form data travels in a sign-in link or diagnostics.
import {validSelection} from './taxonomy';
import type {Submission, ProjectStage} from '../components/studio-shared';

export type SubmissionForm = {
  categoryIds?:string[]; name:string; summary:string; category:Submission['category']; stage:ProjectStage;
  website:string; launchUrl:string; xProfile:string; contactEmail:string; ownershipEvidence:string; companyFax:string;
};
type Edit = Pick<Submission,'id'|'revision'|'reviewNote'|'reviewerNote'>;
const key = 'rmt.studio.draft.v1';
const ttl = 60 * 60 * 1000;
type Draft = {owner:string; expires:number; form:SubmissionForm; edit:Pick<Edit,'id'|'revision'> | null};
let memory:Draft | null = null;

export function forgetSubmissionDraft() {
  memory = null;
  try {window.sessionStorage.removeItem(key);} catch { /* Tab storage is unavailable. */ }
}
export function saveSubmissionDraft(owner:string, form:SubmissionForm, edit:Edit | null) {
  memory = {owner, expires:Date.now()+ttl, form:{...form,companyFax:''}, edit:edit ? {id:edit.id,revision:edit.revision} : null};
  try {window.sessionStorage.setItem(key,JSON.stringify(memory));} catch { /* Keep the draft in this page's memory. */ }
}
export function restoreSubmissionDraft(owner:string): Draft | null {
  let item = memory;
  if (!item) {
    try {item = JSON.parse(window.sessionStorage.getItem(key) ?? 'null');} catch {return null;}
  }
  if (!item) return null;
  if (!Number.isFinite(item.expires) || item.expires < Date.now() || item.expires > Date.now()+ttl || item.owner !== owner) {forgetSubmissionDraft(); return null;}
  if (!item.form || (item.form.categoryIds!==undefined && !validSelection(item.form.categoryIds)) || ['name','summary','website','launchUrl','xProfile','contactEmail','ownershipEvidence'].some(k=>typeof item.form[k as keyof SubmissionForm] !== 'string' || String(item.form[k as keyof SubmissionForm]).length>2048) ||
    !['Games','Music','Tools','Community'].includes(item.form.category) || !['starting','building','beta','live'].includes(item.form.stage) ||
    (item.edit && (typeof item.edit.id !== 'string' || !Number.isSafeInteger(item.edit.revision)))) return null;
  return {...item, form:{...item.form, companyFax:''}};
}
