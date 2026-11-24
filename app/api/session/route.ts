import { identity, database, runtime } from "@/lib/server/runtime";
import { json, handle } from "@/lib/server/http";
import {controlRole,capabilitiesForRole} from '@/lib/server/control-access';
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  return handle(async () => {
    const user = await identity(request);
    const access=user?.emailVerified&&!user.suspended?await controlRole(database(),user.userId,runtime().RMT_ADMIN_USER_IDS):{role:'member' as const,revision:0};
    const capabilities=capabilitiesForRole(access.role);
    const provider=user?.provider==='legacy'?'chatgpt':user&&'signInProvider' in user?user.signInProvider:null;
    const signInMethod=!user?null:provider==='chatgpt'?'chatgpt':provider==='google.com'?'google':provider==='password'?'email':'firebase';
    return json({authenticated: Boolean(user), userId: user?.userId ?? null,
      displayName: user?.displayName ?? null, email:user?.email??null, signInMethod, emailVerified: user?.emailVerified ?? false,
      provider: user?.provider ?? null,isAdmin:capabilities.includes('review'),suspended:user?.suspended??false,controlRole:access.role==='member'?null:access.role,controlCapabilities:capabilities});
  });
}
