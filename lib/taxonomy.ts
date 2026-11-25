export type TaxonomyCategory={id:string;name:string;position:number;archived:boolean};
export type Classification={primary:string;secondary:string[];labels:Record<string,string>};
export const defaultCategories:TaxonomyCategory[]=[["nft","NFTs & Collectibles"],["gaming","Gaming"],["defi","DeFi"],["trading","Trading & Analytics"],["ai","AI & Agents"],["apps","Apps & Utilities"],["devtools","Developer Tools"],["communities","Communities"],["art","Art & Entertainment"],["infrastructure","Infrastructure"],["education","Education"],["tokens","Tokens"]].map(([id,name],position)=>({id,name,position,archived:false}));
export const legacyPrimary={Games:'gaming',Music:'art',Tools:'apps',Community:'communities'} as const;
export function legacyCategory(id:string):keyof typeof legacyPrimary{return id==='gaming'?'Games':id==='art'?'Music':['nft','communities','tokens'].includes(id)?'Community':'Tools';}
export function validSelection(value:unknown):value is string[]{return Array.isArray(value)&&value.length>=1&&value.length<=32&&value.every(k=>typeof k==='string'&&/^[a-z][a-z0-9-]{0,59}$/.test(k))&&new Set(value).size===value.length;}
