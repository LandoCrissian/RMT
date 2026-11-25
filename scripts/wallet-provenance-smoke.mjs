import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {initializeApp,deleteApp} from 'firebase/app';
import {getAuth,connectAuthEmulator,createUserWithEmailAndPassword,signOut,signInWithCustomToken,getIdTokenResult} from 'firebase/auth';
import {generateKeyPair,SignJWT} from 'jose';
const projectId='demo-rmt-wallet24',origin='http://127.0.0.1:9240';
const app=initializeApp({projectId,apiKey:'demo',authDomain:projectId+'.firebaseapp.com'});
const auth=getAuth(app);connectAuthEmulator(auth,origin,{disableWarnings:true});
try {
 const user=(await createUserWithEmailAndPassword(auth,randomUUID()+'@example.test',randomUUID())).user;
 const uid=user.uid;await signOut(auth);
 const response=await fetch(origin+'/identitytoolkit.googleapis.com/v1/projects/'+projectId+'/accounts:update',{method:'POST',headers:{authorization:'Bearer owner','content-type':'application/json'},body:JSON.stringify({localId:uid,emailVerified:true})});
 assert.ok(response.ok,'fixture email verification '+response.status);
 const {privateKey}=await generateKeyPair('RS256');
 const signer='qa@demo-rmt-wallet24.iam.gserviceaccount.com',link=randomUUID();
 const custom=await new SignJWT({uid,claims:{rmt_wallet_link:link,rmt_wallet_generation:1}}).setProtectedHeader({alg:'RS256'}).setIssuer(signer).setSubject(signer).setAudience('https://identitytoolkit.googleapis.com/google.identity.identitytoolkit.v1.IdentityToolkit').setIssuedAt().setExpirationTime('5m').sign(privateKey);
 const signed=(await signInWithCustomToken(auth,custom)).user;
 for(const refresh of [false,true]){
 const t=await getIdTokenResult(signed,refresh);
 const metrics={refresh,uidMatches:t.claims.sub===uid,verified:t.claims.email_verified===true,provider:t.signInProvider,linkMatches:t.claims.rmt_wallet_link===link,generationMatches:t.claims.rmt_wallet_generation===1,authTimePresent:typeof t.claims.auth_time==='number'};
 console.log(JSON.stringify(metrics));
 assert.ok(metrics.uidMatches&&metrics.verified&&metrics.provider==='custom'&&metrics.linkMatches&&metrics.generationMatches&&metrics.authTimePresent);
 }
}finally{await signOut(auth);await deleteApp(app);}
