export const periods = ['7','30','90','all'] as const;
export type AnalyticsPeriod = typeof periods[number];
export type ProjectMetrics = {
  views:number; clicks:number; followersAdded:number; followersLost:number; saves:number;
  shares:number; announcements:number; impressions:number; discoveryClicks:number;
};
export type BuilderReport = {
  projectId:string; period:AnalyticsPeriod; start:string|null; end:string; measuredSince:string|null;
  truncated:boolean; current:ProjectMetrics; previous:ProjectMetrics|null; unique:number|null;
  followers:number; savedBy:number; trend:{day:string;views:number;clicks:number}[];
  destinations:{label:string;count:number}[]; sources:{label:string;count:number}[];
  legacy:{start:string|null;end:string|null;views:number;clicks:number};
};
