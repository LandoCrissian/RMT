// Candidates require an official source and explicit evidence of present functionality.
const rules=[
 ['nft',/\b(?:NFT collection|collectible avatars?|ERC-721|ERC-1155)\b/i],
 ['gaming',/\b(?:play (?:now|the game)|playable game|browser game|game arcade)\b/i],
 ['defi',/\b(?:liquidity pools?|stake tokens|decentralized exchange|token swaps?)\b/i],
 ['trading',/\b(?:DEX analytics|swap volume|trading terminal|price charts?)\b/i],
 ['ai',/\b(?:AI agents?|agent runtime)\b/i],['apps',/\b(?:web app|creator software|wallet manager)\b/i],
 ['devtools',/\b(?:developer SDK|API reference|developer toolkit)\b/i],['art',/\b(?:art gallery|music player|digital art exhibition)\b/i],
 ['education',/\b(?:interactive lessons|learning courses?)\b/i],['tokens',/\b(?:fungible token|ERC-20 token)\b/i],
 ['infrastructure',/\b(?:RPC network|block explorer service|validator infrastructure)\b/i],['communities',/\b(?:community forum|member community)\b/i]
];
export function suggestCategories(records){
 const suggestions=new Map();
 for(const record of records){
  if(!['website','explorer','opensea'].includes(record.kind)||!/^https:\/\//.test(record.url))continue;
  const texts=[record.shortDescription,...Object.values(record.destinations??{}).map(item=>item?.copy)].filter(t=>typeof t==='string');
  for(const text of texts)for(const sentence of text.split(/[.!?\n]+/)){
   if(/\b(?:soon|upcoming|will|planned|roadmap|intends?|aims?|future|not|no longer|concept)\b/i.test(sentence))continue;
   for(const [id,re] of rules)if(re.test(sentence)&&!suggestions.has(id))suggestions.set(id,{id,source:record.url,evidence:sentence.trim().slice(0,300)});
  }
 }
 return [...suggestions.values()];
}
