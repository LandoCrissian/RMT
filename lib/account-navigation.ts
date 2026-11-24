export type AccountContinuation = {href: string; label: string; context: string};

/** Only application destinations are permitted; never echo an arbitrary redirect URL. */
export function accountContinuation(value: unknown): AccountContinuation | null {
  if (typeof value !== 'string' || value.length > 180 || /[\u0000-\u0020\u007f\\]/.test(value)) return null;
  if (/^\/#claim\/[a-zA-Z0-9][a-zA-Z0-9-]{0,119}$/.test(value)) {
    return {href: value, label: 'Continue to your project', context: 'Your project’s ownership claim is ready to continue after sign-in.'};
  }
  if (/^(?:\/projects\/|\/#project\/)[a-zA-Z0-9][a-zA-Z0-9-]{0,119}$/.test(value)) {
    return {href: value, label: 'Continue to your project', context: 'Return to the project you were exploring after sign-in.'};
  }
  if (/^\/(?:\?studio=(?:projects|claims))?#studio$/.test(value)) {
    return {href: value, label: 'Continue to Builder Studio', context: value.includes('studio=projects') ? 'Your project management workspace is ready after sign-in.' : value.includes('studio=claims') ? 'Return to your ownership claims after sign-in.' : 'Continue your project application in Builder Studio after sign-in.'};
  }
  if (value === '/#library') return {href: value, label: 'Continue to your library', context: 'Return to your saved projects after sign-in.'};
  if (/^\/#(?:discover|games|music|tools)$/.test(value)) return {href: value, label: 'Continue exploring', context: 'Return to the directory you were exploring after sign-in.'};
  return null;
}

export function signInHref(returnTo = '/#account'): string {
  const next = accountContinuation(returnTo);
  return next ? '/?continue=' + encodeURIComponent(next.href) + '#account' : '/#account';
}

export function continuationFromSearch(search: string): AccountContinuation | null {
  if (search.length > 2048) return null;
  const values = new URLSearchParams(search).getAll('continue');
  return values.length === 1 ? accountContinuation(values[0]) : null;
}

export function studioSectionFromSearch(search: string): 'add' | 'projects' | 'claims' {
  const values = new URLSearchParams(search).getAll('studio');
  return values.length === 1 && (values[0] === 'projects' || values[0] === 'claims') ? values[0] : 'add';
}
