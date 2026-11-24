export default function ProjectNotFound() {
  return <main style={{minHeight: '100dvh', display: 'grid', placeItems: 'center', padding: '32px', background: '#10110f', color: '#f4f5ef'}}>
    <div style={{maxWidth: '480px'}}>
      <p style={{color: '#c6ff42', fontSize: '13px', letterSpacing: '0.12em', fontWeight: 700}}>RMT · PROJECT DIRECTORY</p>
      <h1 style={{fontSize: 'clamp(32px, 6vw, 48px)', lineHeight: 1.1}}>This project isn’t available.</h1>
      <p style={{color: '#b6bab1', lineHeight: 1.7}}>The link may have changed, or the listing may no longer be in the directory.</p>
      <a href="/" style={{display: 'inline-flex', marginTop: '16px', padding: '14px 20px', borderRadius: '12px', background: '#c6ff42', color: '#15170f', fontWeight: 700, textDecoration: 'none'}}>Explore RMT</a>
    </div>
  </main>;
}
