import {legacyProjectRedirect} from '../lib/project-permalinks';
import handler from "vinext/server/fetch-handler";
import { runWithConnectorBinding } from "../lib/connector-context";
import type { ConnectorBinding } from "../lib/connector-contract.mjs";
import { proxyFirebaseAuth } from "../lib/server/firebase-auth-proxy";
import { maintenanceResponse, normalizedRoutePath } from "../lib/server/site-availability";

const worker = {
  fetch(request: Request, env: Cloudflare.Env, ctx: ExecutionContext<{ CONNECTORS?: ConnectorBinding }>) {
    // Next treats underscore-prefixed directories as private. Handle Firebase's
    // exact reserved helper routes before the application router.
    const authHelper = proxyFirebaseAuth(request);
    if (authHelper) return authHelper;
    let binding = ctx.props?.CONNECTORS;
    // Local preview emulates the same request-scoped capability. This branch and
    // the auxiliary service binding are absent from production builds.
    if (import.meta.env.DEV && !binding && env.CONNECTORS) {
      const preview = env.CONNECTORS;
      const expiresAt = Date.now() + 60_000;
      binding = {
        async getContext() {
          if (Date.now() >= expiresAt) return { status: "request_context_expired" };
          return preview.getContext?.() ?? { status: "binding_unavailable" };
        },
        async invoke(connectorId, actionName, args) {
          if (Date.now() >= expiresAt) {
            return { status: "request_context_expired", message: "This request has expired. Please try again." };
          }
          return preview.invoke(connectorId, actionName, args);
        },
      };
    }
    return runWithConnectorBinding(binding, async () => {
      const siteDb=(env as Cloudflare.Env & {DB?:D1Database}).DB;
      if(siteDb){const unavailable=await maintenanceResponse(request,siteDb);if(unavailable)return unavailable;}
      const redirect=legacyProjectRedirect(request);
      if(redirect)return redirect;
      const response = await handler.fetch(request, env, ctx);
      // A member can hide a profile at any time. Never retain profile HTML/RSC
      // or a missing-profile result in a browser or edge cache.
      const path=normalizedRoutePath(new URL(request.url).pathname);
      if (path!=='/'&&path!=='/calendar'&&!/^\/lammb-vault(?:\/|$)/.test(path)&&!path.startsWith('/events/')&&!path.startsWith('/u/')&&!/^\/projects\/[A-Za-z0-9_-]+\/?$/.test(path)) return response;
      const headers = new Headers(response.headers);
      headers.set('Cache-Control', 'no-store');
      headers.set('CDN-Cache-Control', 'no-store');
      headers.set('Cloudflare-CDN-Cache-Control', 'no-store');
      if(path.startsWith('/u/'))headers.set('X-Robots-Tag', 'noindex, noarchive');
      return new Response(response.body, {status: response.status, statusText: response.statusText, headers});
    });
  },
};

export default worker;
