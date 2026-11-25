import {digestDate,digestEntryUrl,digestSections,type WeeklyDigest} from '@/lib/weekly-digest';

export default function WeeklyDigestTemplate({digest}: {digest:WeeklyDigest}) {
  const sections=digestSections(digest).filter(section=>section.entries.length);
  return <article aria-label="Weekly digest" style={{background:'#121814',color:'#eef3e9',fontFamily:'Arial, sans-serif',padding:'18px',borderRadius:'10px'}}>
    <header style={{borderBottom:'1px solid #3a473d',paddingBottom:'12px'}}>
      <h3 style={{color:'#ccff44',fontSize:'22px',margin:0}}>RMT Weekly</h3>
      <p style={{margin:'6px 0 0',fontSize:'13px'}}>{digestDate(digest.from)} – {digestDate(digest.through)} UTC</p>
    </header>
    {sections.length===0 && <p>There are no updates, upcoming events or new listings for this edition.</p>}
    {sections.map(section=><section key={section.label}>
      <h4 style={{fontSize:'16px',margin:'18px 0 8px'}}>{section.label}</h4>
      <ul style={{margin:0,padding:0,listStyle:'none'}}>
        {section.entries.map(item=><li key={item.id} style={{padding:'7px 0',overflowWrap:'anywhere'}}>
          <a style={{color:'#daefbe',fontWeight:600}} href={digestEntryUrl(item.path)}>{item.title}</a><br/>
          <small style={{color:'#b5c4b6'}}>{item.project} · {digestDate(item.at)}</small>
        </li>)}
      </ul>
    </section>)}
  </article>;
}
