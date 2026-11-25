import type {Metadata} from 'next';
import LammbVault from '@/components/LammbVault';

export const metadata:Metadata={
  title:'LAMMB Vault | RMT',
  description:'Track LAMMBs Genesis creator royalties. Members with five or more Genesis NFTs can open the verified receipt ledger.',
  alternates:{canonical:'https://rmtlaunch.fun/lammb-vault'},
  openGraph:{title:'LAMMB Vault | RMT',description:'Public treasury and verified holder access for LAMMBs Genesis.',url:'https://rmtlaunch.fun/lammb-vault'},
};
export default function VaultPage(){return <LammbVault/>;}
