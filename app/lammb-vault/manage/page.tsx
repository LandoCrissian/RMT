import type {Metadata} from 'next';
import LammbVaultManager from '@/components/LammbVaultManager';

export const metadata:Metadata={title:'LAMMB Vault Owner Console | RMT',robots:{index:false,follow:false},alternates:{canonical:'https://rmtlaunch.fun/lammb-vault/manage'}};
export default function VaultManagementPage(){return <LammbVaultManager/>;}
