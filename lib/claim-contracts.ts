/** Reviewed independently of any claim, project edit, or member-supplied URL. */
export type ClaimContract = {
  chainId:4663; address:string; source:string; codeHash:string; model:'owner()';
};
const boredTraders:ClaimContract = {
  chainId:4663,
  address:'0x0c036d11be6b5839cfe2bfe5c4c6e3854193d959',
  source:'https://boredtrader.co/whitepaper',
  codeHash:'0x0771fda08e5d6dc90b951db0a736e5abcc6b5be5ae3c9c21bf363c18aa4990eb',
  model:'owner()',
};
export function claimContract(projectId:string):ClaimContract|null {
  return projectId==='bored-traders'?{...boredTraders}:null;
}
