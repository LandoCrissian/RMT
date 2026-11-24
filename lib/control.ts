export type ControlRole = 'owner' | 'admin' | 'moderator' | 'member';
export const CONTROL_CAPABILITIES = ['overview','review','projects','content','members','audit','health','exports','settings','roles'] as const;
export type ControlCapability = typeof CONTROL_CAPABILITIES[number];
export type ControlMember = {
  id:string; displayName:string; email:string; providers:string[]; emailVerified:boolean|null;
  firstSeenAt:number|null; lastSeenAt:number|null; historicalSinceAt:number|null;
  status:'active'|'suspended'; statusReason:string; revision:number; role:ControlRole; roleRevision:number; protectedOwner:boolean;
  profile:{handle:string|null;displayName:string;visibility:'private'|'public'}|null; projectCount:number; submissionCount:number;
};
export type ControlAuditItem={id:string;actorId:string;action:string;entityType:string;entityId:string;reason:string;createdAt:number};
export type ControlPage<T>={items:T[];nextCursor:string|null;hasMore:boolean};
export type ControlOverview={role:Exclude<ControlRole,'member'>;capabilities:ControlCapability[];generatedAt:number;observedSince:number;metrics:{
  members:number;observedMembers:number;activeLast7Days:number;listedProjects:number;confirmedBuilders:number;pendingSubmissions:number;pendingClaims:number;pendingEdits:number;pendingUpdates:number;suspendedMembers:number;publicProfiles:number;
}};
export type ControlHealth={generatedAt:number;checks:Array<{id:string;label:string;status:'ok'|'warning'|'error'|'unknown';detail:string}>;storage:{imageCount:number;imageBytes:number};exports:{datasets:string[];formats:string[];pageLimit:number;fullBackup:false}};
