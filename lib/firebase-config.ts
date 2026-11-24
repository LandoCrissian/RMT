// Public Firebase web configuration. This is not an administrator credential.
export const firebaseConfig = {
  projectId: 'rmt-launch-auth-20261124',
  appId: '1:719694340242:web:399b13786cf403b3be064b',
  apiKey: 'AIzaSyDxzd7IG2ntLP1Y7R13EiKrXx8ez63KsPQ',
  authDomain: 'rmt-launch-auth-20261124.firebaseapp.com',
};

// These origins have the same-origin auth helper and an explicitly authorized
// OAuth callback. Preview and unknown hosts keep the original Firebase helper.
const sameOriginAuthOrigins: ReadonlySet<string> = new Set([
  'https://rmtlaunch.fun',
  'https://www.rmtlaunch.fun',
  'https://rmt-hub.wise-elf-8473.chatgpt.site',
]);

export function supportsSameOriginFirebaseAuth(origin: string) {
  return sameOriginAuthOrigins.has(origin);
}

export function firebaseConfigForOrigin(origin = '') {
  return supportsSameOriginFirebaseAuth(origin)
    ? {...firebaseConfig, authDomain: new URL(origin).hostname}
    : firebaseConfig;
}
