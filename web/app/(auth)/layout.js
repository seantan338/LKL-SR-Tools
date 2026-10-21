export default function AuthLayout({ children }) {
  return (
    <div className="app-wrapper" style={{ alignItems: 'center', justifyContent: 'center' }}>
      {/* Background elements to match the general theme */}
      <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', zIndex: -1 }}>
         <div style={{
           position: 'absolute', top: '20%', left: '10%', width: '40vw', height: '40vw', 
           background: 'radial-gradient(circle, rgba(59, 130, 246, 0.08) 0%, transparent 60%)', filter: 'blur(40px)' 
         }}></div>
         <div style={{
           position: 'absolute', bottom: '10%', right: '10%', width: '35vw', height: '35vw', 
           background: 'radial-gradient(circle, rgba(139, 92, 246, 0.08) 0%, transparent 60%)', filter: 'blur(40px)' 
         }}></div>
      </div>
      
      {children}
    </div>
  );
}
