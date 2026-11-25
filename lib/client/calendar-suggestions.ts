export type CalendarSuggestion={
  projectId:string;sourceUrl:string;sourceKey:string;title:string;description:string;typeId:string;
  startsAt:number;endsAt:number|null;destination:string;access:string;
};
function https(value:unknown){
  if(typeof value!=='string'||value.length>2048)return false;
  try{const u=new URL(value);return u.protocol==='https:'&&!u.username&&!u.password;}catch{return false;}
}
export function reviewSuggestions(value:unknown,projects:Set<string>):CalendarSuggestion[]{
  const file=value as {version?:unknown;suggestions?:unknown};
  if(file?.version!==1||!Array.isArray(file.suggestions)||file.suggestions.length>500)
    throw Error('Choose a version 1 calendar suggestions file with up to 500 entries.');
  return file.suggestions.map(row=>{
    if(!row||typeof row.sourceKey!=='string'||!/^([a-f0-9]{64})$/.test(row.sourceKey)||!projects.has(row.projectId)||!https(row.sourceUrl)||!https(row.destination)||
       typeof row.title!=='string'||!row.title.trim()||row.title.length>100||typeof row.description!=='string'||row.description.length>2000||
       !Number.isSafeInteger(row.startsAt)||Math.abs(row.startsAt)>8.64e15||
       !(row.endsAt===null||Number.isSafeInteger(row.endsAt)&&row.endsAt>row.startsAt&&row.endsAt<=8.64e15)||
       typeof row.typeId!=='string'||typeof row.access!=='string'||row.access.length>300)
      throw Error('The file contains an unknown project, invalid link, or incomplete event.');
    const {projectId,sourceUrl,sourceKey,title,description,typeId,startsAt,endsAt,destination,access}=row;
    return {projectId,sourceUrl,sourceKey,title,description,typeId,startsAt,endsAt,destination,access};
  });
}
