import test from 'node:test';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
const root=fileURLToPath(new URL('../',import.meta.url));
const compiled=await build({stdin:{contents:"export * from './lib/client/control';",resolveDir:root,loader:'ts'},absWorkingDir:root,bundle:true,write:false,platform:'node',format:'esm',target:'node24'});
const api=await import('data:text/javascript;base64,'+Buffer.from(compiled.outputFiles[0].text).toString('base64'));
const now=1795543200000,id='51111111-1111-4111-8111-111111111111';
const response=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json'}});
const member={id:'known-member',displayName:'A builder',email:'builder@example.test',providers:['password'],emailVerified:true,firstSeenAt:now,lastSeenAt:now,historicalSinceAt:null,status:'active',statusReason:'',revision:0,role:'member',roleRevision:0,protectedOwner:false,profile:null,projectCount:1,submissionCount:1};
const image={id,kind:'logo',width:256,height:256,mime:'image/png',byteSize:1024,previewUrl:'/api/control/artwork/'+id,createdAt:now};
const project={project:{id:'sample',slug:'sample',name:'Sample project',tagline:'A sample project for the RMT directory.',description:'A sample project for the RMT directory.',category:'Tools',links:[],cover:'/projects/sample.png',initials:'SP',accent:'#ccff00'},revision:1,listingRevision:1,visibility:'public',featured:null,origin:'curated',sourceStatus:'curated',publiclyAvailable:true,updatedAt:now,owner:null,artworkOverride:true,logoAssetId:id,bannerAssetId:null,content:{name:'Sample project',summary:'A sample project for the RMT directory.',category:'Tools',stage:'building',website:'https://example.org/',launchUrl:'',xProfile:'',links:[]}};

test('control responses clear the workspace when identity or permission changed, including non-JSON rejection',async()=>{
 for(const value of [response({error:'Sign in required'},401),response({error:'Access removed'},403),response({error:'Account changed',code:'account_changed'},409),new Response('<html>Sign in</html>',{status:401}),new Response('',{status:403})])await assert.rejects(api.controlResponseData(value,true),error=>error instanceof api.ControlRequestError&&error.accountChanged&&!error.needsRefresh);
});
test('unknown save outcomes and revision conflicts require reconciliation, validation errors remain editable',async()=>{
 for(const value of [response({error:'Changed elsewhere'},409),response({error:'Storage unavailable'},503),response(null),new Response('not json')])await assert.rejects(api.controlResponseData(value,true),error=>error instanceof api.ControlRequestError&&error.needsRefresh&&!error.accountChanged);
 await assert.rejects(api.controlResponseData(response({error:'Use a valid HTTPS destination'},400),true),error=>!error.needsRefresh&&!error.accountChanged);
});
test('member response preserves known timestamps, accepts explicitly unknown history and excludes unrequested private fields',()=>{
 assert.deepEqual(api.memberResponse({member:{...member,credential:'not-for-ui'}}),member);
 assert.equal(api.memberResponse({member:{...member,emailVerified:null,firstSeenAt:null,lastSeenAt:null}}).firstSeenAt,null);
 for(const delta of [{id:undefined},{role:'superuser'},{revision:-1},{emailVerified:'true'},{lastSeenAt:9e17},{profile:{handle:'builder',displayName:'Builder',visibility:'hidden'}}])assert.throws(()=>api.memberResponse({member:{...member,...delta}}),api.ControlRequestError);
});
test('paged results reject a false continuation and malformed operational records',()=>{
 assert.deepEqual(api.membersResponse({items:[],hasMore:false,nextCursor:null,observedSince:now}),{items:[],hasMore:false,nextCursor:null,observedSince:now});
 assert.throws(()=>api.membersResponse({items:[member],hasMore:true,nextCursor:null,observedSince:now}),api.ControlRequestError);
 assert.throws(()=>api.auditResponse({items:[{id:'audit',actorId:'actor',action:'member.suspend',entityType:'member',entityId:'target',reason:'A reason',createdAt:'yesterday'}],nextCursor:null,hasMore:false}),api.ControlRequestError);
 assert.throws(()=>api.csvExportResponse({csv:'id,name\n1,a',hasMore:true,nextCursor:null}),api.ControlRequestError);
});
test('control links and displayed images cannot navigate to scripts, credentials, external trackers or private image APIs',()=>{
 for(const url of ['javascript:alert(1)','http://example.org/','https://user:secret@example.org/','//example.org/','/api/session'])assert.equal(api.safeControlLink(url),null);
 assert.equal(api.safeControlLink('https://example.org/path'),'https://example.org/path');assert.equal(api.safeControlLink('/projects/vamps#updates'),'/projects/vamps#updates');
 for(const url of ['https://tracker.example.org/image.png','//tracker.example.org/image.png','/projects/../secret','/api/control/artwork/'+id,'/media/control-project-artwork/not-an-id'])assert.equal(api.safeControlImage(url),null);
 for(const url of ['/projects/sample.webp','/media/project-artwork/'+id,'/media/control-project-artwork/'+id])assert.equal(api.safeControlImage(url),url);
});
test('administrator image data requires the exact private endpoint, valid identifiers and bounded PNG content',()=>{
 assert.deepEqual(api.artworkResponse({artwork:image}),image);
 for(const delta of [{id:'invalid'},{previewUrl:'/api/control/artwork/another'},{previewUrl:'/media/control-project-artwork/'+id},{previewUrl:'https://tracker.example.org/'} ,{mime:'image/svg+xml'},{byteSize:2*1024*1024+1},{height:0}])assert.throws(()=>api.artworkResponse({artwork:{...image,...delta}}),api.ControlRequestError);
 assert.throws(()=>api.artworkBlobResponse(new Blob(['<svg/>'],{type:'image/svg+xml'})),api.ControlRequestError);
 assert.throws(()=>api.artworkBlobResponse(new Blob([],{type:'image/png'})),api.ControlRequestError);
});
test('project control parsing preserves artwork override state and refuses missing selection metadata',()=>{
 assert.equal(api.controlProjectResponse({project}).artworkOverride,true);assert.equal(api.controlProjectResponse({project}).logoAssetId,id);
 assert.throws(()=>api.controlProjectResponse({project:{...project,artworkOverride:undefined}}),api.ControlRequestError);
 assert.throws(()=>api.controlProjectResponse({project:{...project,logoAssetId:'unverified-image'}}),api.ControlRequestError);
 assert.throws(()=>api.controlProjectResponse({project:{...project,visibility:'deleted'}}),api.ControlRequestError);
});
test('overview roles and exact metrics are validated instead of silently inventing a zero dashboard',()=>{
 const metrics={members:3,observedMembers:2,activeLast7Days:2,listedProjects:1,confirmedBuilders:1,pendingSubmissions:0,pendingClaims:0,pendingEdits:0,pendingUpdates:0,suspendedMembers:0,publicProfiles:1},value={role:'moderator',capabilities:['overview','review','content'],metrics,observedSince:now,generatedAt:now};
 assert.deepEqual(api.overviewResponse(value),value);
 for(const delta of [{role:'operator'},{capabilities:['delete_everything']},{metrics:{...metrics,members:undefined}},{metrics:{...metrics,members:-1}}])assert.throws(()=>api.overviewResponse({...value,...delta}),api.ControlRequestError);
});
