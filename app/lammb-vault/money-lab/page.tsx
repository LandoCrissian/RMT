import type {Metadata} from 'next';
import LammbMoneyLab from '@/components/LammbMoneyLab';

export const metadata:Metadata={
  title:'LAMMB Money Lab | RMT',
  description:'Model creator royalties, sponsored spotlight revenue, mining costs and holder access using editable assumptions.',
  alternates:{canonical:'https://rmtlaunch.fun/lammb-vault/money-lab'},
};
export default function MoneyLabPage(){return <LammbMoneyLab/>;}
