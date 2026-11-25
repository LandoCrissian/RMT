import {ImageResponse} from 'next/og';
import {eventCardTime} from '../event-export';

export function renderEventCard(event:{title:string;projectName:string;startsAt:number;status:string},art:string) {
  const titleLength=Array.from(event.title).length;
  return new ImageResponse(<div style={{height:'100%',width:'100%',display:'flex',background:'#10120f',color:'#f4f5ed',padding:'40px',fontFamily:'sans-serif'}}>
    <div style={{display:'flex',flexDirection:'column',width:676,height:'100%',justifyContent:'space-between',paddingRight:40}}>
      <div style={{display:'flex',color:'#caff36',fontSize:32,fontWeight:700}}>RMT · Calendar</div>
      <div style={{display:'flex',flexDirection:'column',gap:16}}>
        <div style={{display:'flex',fontSize:29,color:'#c6c9ba'}}>{event.projectName}</div>
        <div style={{display:'flex',fontSize:titleLength>78?43:titleLength>45?52:65,fontWeight:700,lineHeight:1.05,overflowWrap:'anywhere'}}>{event.title}</div>
      </div>
      <div style={{display:'flex',fontSize:24,color:'#caff36',borderTop:'2px solid #45483e',paddingTop:17}}>{event.status==='cancelled'?'Cancelled · ':''}{eventCardTime(event.startsAt)}</div>
    </div>
    <div style={{display:'flex',width:444,height:550,background:'#181b17',borderRadius:20,overflow:'hidden',alignItems:'center',justifyContent:'center'}}>
      <img src={art} width={432} height={526} style={{objectFit:'contain'}}/>
    </div>
  </div>,{width:1200,height:630}).arrayBuffer();
}

