export type Suggestion={id:string;source:string;evidence:string};
export function suggestCategories(records:{kind:string;url:string;shortDescription?:string;destinations?:Record<string,{copy?:string}|undefined>}[]):Suggestion[];
