import {ImageResponse} from 'next/og';
import {RMT_PUBLIC_ORIGIN,SOCIAL_IMAGE_HEIGHT,SOCIAL_IMAGE_WIDTH,projectPath,shareCardPlan} from '../project-sharing';
import type {Project} from '../catalog';

export async function renderShareCard(project:Project,plan:ReturnType<typeof shareCardPlan>,hero:string,supporting?:string) {
  if(!plan.style || !plan.title) throw new Error('Missing share card presentation.');
  const accent=/^#[0-9a-f]{6}$/i.test(plan.accent??'')?plan.accent:'#ccff00';
  const url=new URL(RMT_PUBLIC_ORIGIN).host+projectPath(project);
  const panorama=plan.style==='panorama';
  const editorial=plan.style==='editorial';
  const width=panorama?1124:editorial?570:520;
  const height=panorama?304:448;
  const titleSize=Math.min(panorama?81:75, Math.max(35,Math.round((panorama?1700:1000)/Math.max(1,plan.title.length))));
  const gallery=<div style={{display:'flex',position:'relative',width,height,alignItems:'center',justifyContent:'center',backgroundColor:'#171b18',borderBottom:'5px solid '+accent}}>
    <img src={hero} width={width} height={height-5} style={{objectFit:'contain'}}/>
    {supporting && supporting!==hero && <img src={supporting} width={145} height={102} style={{position:'absolute',right:12,bottom:12,objectFit:'contain',backgroundColor:'#111411',border:'2px solid '+accent}}/>}
  </div>;
  const title=<div style={{display:'flex',alignItems:'center',color:'#f4f4ed',fontSize:titleSize,fontWeight:700,lineHeight:1.06,width:panorama?1124:editorial?518:560,paddingRight:12,overflowWrap:'anywhere',overflow:'hidden',maxHeight:panorama?140:374}}>{plan.title}</div>;
  return new ImageResponse(<div style={{height:'100%',width:'100%',display:'flex',flexDirection:'column',backgroundColor:'#0a0e0b',padding:'28px 38px',justifyContent:'space-between'}}>
    <div style={{display:'flex',alignItems:'center',height:48,color:'#ccff00',fontSize:34,fontWeight:700,letterSpacing:1}}>RMT</div>
    <div style={{display:'flex',width:'100%',alignItems:panorama?'flex-start':'center',justifyContent:'space-between',flexDirection:panorama?'column':'row'}}>
      {editorial || panorama?gallery:title}{editorial || panorama?title:gallery}
    </div>
    <div style={{display:'flex',paddingTop:13,borderTop:'1px solid #50574e',color:'#f4f4ed',fontSize:url.length>65?19:26,overflowWrap:'anywhere'}}>{url}</div>
  </div>,{width:SOCIAL_IMAGE_WIDTH,height:SOCIAL_IMAGE_HEIGHT}).arrayBuffer();
}
