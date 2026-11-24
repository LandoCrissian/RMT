import type {ControlHealth} from '@/lib/control';
import {firebaseConfig} from '@/lib/firebase-config';
import {notificationConfiguration,type NotificationEnvironment} from './notifications';
export async function controlHealth(db:D1Database,env:NotificationEnvironment,now=Date.now()):Promise<ControlHealth>{
 const checks:ControlHealth['checks']=[];
 const dbCheck=await db.prepare('SELECT 1 AS connected').first<{connected:number}>();
 checks.push({id:'database',label:'Application database',status:dbCheck?.connected===1?'ok':'error',detail:dbCheck?.connected===1?'The database answered a live read.':'The database did not answer its check.'});
 const storage=await db.prepare("SELECT COUNT(*) AS image_count,COALESCE(SUM(byte_size),0) AS image_bytes FROM (SELECT byte_size FROM project_artwork WHERE status='ready' UNION ALL SELECT byte_size FROM profile_artwork WHERE status='ready' UNION ALL SELECT byte_size FROM control_project_artwork WHERE status='ready')").first<{image_count:number;image_bytes:number}>();
 checks.push({id:'storage',label:'Artwork storage',status:env.BUCKET?'ok':'warning',detail:env.BUCKET?'The artwork storage binding is configured. Totals below are ready images recorded by RMT.':'The artwork storage binding is not configured.'});
 checks.push({id:'authentication',label:'Sign-in configuration',status:firebaseConfig.projectId?'ok':'warning',detail:firebaseConfig.projectId?'RMT has a dedicated Firebase project. This is a configuration check; provider availability is not continuously monitored.':'Firebase sign-in configuration is missing.'});
 checks.push({id:'owner',label:'Protected owner access',status:env.RMT_ADMIN_USER_IDS?.split(',').some(v=>v.trim())?'ok':'error',detail:'Owner access is protected by server configuration and cannot be removed from the dashboard.'});
 const notification=notificationConfiguration(env).email;
 checks.push({id:'email',label:'Review email alerts',status:notification.configured?'ok':'warning',detail:notification.configured?'Email delivery is configured. Provider acceptance and inbox delivery are different; use the notification panel to inspect outcomes.':'Email setup is incomplete: '+notification.missing.join(', ')+'. Dot monitoring is managed separately.'});
 checks.push({id:'backups',label:'External backups',status:'unknown',detail:'Hosting backup status is not available to this app. Operational exports below do not include Firebase accounts, image files, secrets, or a complete database restore.'});
 return{generatedAt:now,checks,storage:{imageCount:Number(storage?.image_count??0),imageBytes:Number(storage?.image_bytes??0)},exports:{datasets:['members','projects','ownership','audit'],formats:['json','csv'],pageLimit:500,fullBackup:false}};
}
