import {siteSettings} from './control-settings';
import {isAdmin} from './runtime';

/** Match the decoded route that the application router will serve. */
export function normalizedRoutePath(path:string){
  try{return decodeURIComponent(path);}catch{return path;}
}
/** Keep account recovery and site management reachable while public work is paused. */
export function maintenanceProtectedPath(path:string,method:string){
  path=normalizedRoutePath(path);
  if(path==='/'||path==='/api/session'||path==='/api/site-settings'||path==='/mcp'||path.startsWith('/api/auth/')||path.startsWith('/api/control/')||path.startsWith('/api/admin/'))return false;
  return path==='/calendar'||/^\/lammb-vault(?:\/|$)/.test(path)||path.startsWith('/events/')||path.startsWith('/api/')||path.startsWith('/media/')||/^\/(?:projects|u)\/[A-Za-z0-9_-]+\/?$/.test(path);
}
export async function maintenanceResponse(request:Request,db:D1Database):Promise<Response|null>{
  const rawPath=new URL(request.url).pathname;
  if(!maintenanceProtectedPath(rawPath,request.method))return null;
  const path=normalizedRoutePath(rawPath);
  const settings=await siteSettings(db);
  if(!settings.maintenance.enabled||await isAdmin(request))return null;
  const headers={'Cache-Control':'no-store','CDN-Cache-Control':'no-store','Cloudflare-CDN-Cache-Control':'no-store','Retry-After':'300','X-Content-Type-Options':'nosniff','X-Robots-Tag':'noindex, noarchive'};
  if(path.startsWith('/api/'))return Response.json({error:settings.maintenance.message,code:'maintenance'}, {status:503,headers});
  if(path.startsWith('/media/'))return new Response(null,{status:503,headers});
  const escape=(value:string)=>value.replace(/[&<>"']/g,character=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[character]!));
  return new Response(`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Back shortly | RMT</title><style>body{margin:0;background:#0d1012;color:#f4f6ed;font:16px/1.6 system-ui;min-height:100vh;display:grid;place-items:center}main{max-width:520px;padding:40px 24px}strong{color:#caff00}h1{font-size:42px;line-height:1.1}a{display:inline-block;color:#caff00;padding:14px 0}</style><main><strong>RMT.</strong><h1>A little work behind the scenes.</h1><p>${escape(settings.maintenance.message)}</p><a href="/#account">Account &amp; site management →</a></main></html>`,{status:503,headers:{...headers,'Content-Type':'text/html; charset=utf-8'}});
}
