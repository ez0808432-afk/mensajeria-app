/**
 * Llamadas.jsx
 * Pantalla de llamada activa — audio y video — estilo WhatsApp.
 * Se renderiza desde LlamadaOverlay encima de cualquier ruta.
 */
import { useEffect, useRef, useState } from 'react'
import useWebRTC from '../hooks/useWebRTC'
import { useLlamada } from '../context/LlamadaContext'

/* ── helpers ────────────────────────────────────────────────── */
const initials = name =>
  (name||'?').split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase()
const COLORS = ['#0f766e','#2563eb','#7c3aed','#d97706','#e11d48','#0891b2','#059669','#ea580c']
const aColor  = e => COLORS[[...(e||'a')].reduce((a,c)=>a+c.charCodeAt(0),0) % COLORS.length]

/* ══════════════════════════════════════════════════════════════
   COMPONENTE PRINCIPAL
══════════════════════════════════════════════════════════════ */
export default function Llamadas({ llamadaId, tipo, esSaliente, contacto, onTerminar }) {
  const esVideo = tipo === 'video'
  const { minimizarLlamada } = useLlamada()

  const remotoRef = useRef(null)
  const localRef  = useRef(null)
  const hideTimer = useRef(null)

  const [showCtrl, setShowCtrl] = useState(true)

  const {
    estado, streamLocal, streamRemoto,
    mutedAudio, mutedVideo, altavoz, duracion,
    terminar, toggleAudio, toggleVideo, toggleAltavoz,
  } = useWebRTC({ llamadaId, esVideo, esSaliente, onTerminar })

  /* ── conectar streams ───────────────────────────────────── */
  useEffect(() => {
    if (remotoRef.current && streamRemoto) remotoRef.current.srcObject = streamRemoto
  }, [streamRemoto])

  useEffect(() => {
    if (localRef.current && streamLocal) localRef.current.srcObject = streamLocal
  }, [streamLocal])

  /* ── auto-ocultar controles en video ────────────────────── */
  const resetHide = () => {
    clearTimeout(hideTimer.current)
    setShowCtrl(true)
    if (esVideo && estado === 'conectado') {
      hideTimer.current = setTimeout(() => setShowCtrl(false), 4000)
    }
  }
  useEffect(() => { resetHide(); return () => clearTimeout(hideTimer.current) }, [estado, esVideo])

  const nombre = contacto?.contactoNombre || 'Desconocido'
  const foto   = contacto?.foto || null
  const email  = contacto?.contactoEmail || ''

  const estadoTxt = {
    iniciando:  'Iniciando...',
    llamando:   esSaliente ? 'Llamando...' : 'Conectando...',
    conectando: 'Conectando...',
    conectado:  duracion,
    terminado:  'Llamada terminada',
    error:      'Error de conexión',
  }[estado] || estado

  /* ════════════════════════════════════════════════════
     RENDER AUDIO
  ════════════════════════════════════════════════════ */
  if (!esVideo) return (
    <div style={{
      position:'fixed', inset:0, zIndex:9998,
      background:'linear-gradient(160deg,#0a1628 0%,#0d2137 60%,#0a1628 100%)',
      display:'flex', flexDirection:'column',
      alignItems:'center', justifyContent:'space-between',
      fontFamily:'system-ui,sans-serif', padding:'60px 24px 48px',
    }}>
      <RingBg conectado={estado==='conectado'} />

      {/* Info */}
      <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:16, zIndex:1 }}>
        <p style={{ color:'rgba(255,255,255,0.5)', fontSize:13, letterSpacing:'0.08em', textTransform:'uppercase', margin:0 }}>
          📞 Llamada de voz
        </p>
        <div style={{
          width:100, height:100, borderRadius:'50%',
          background: foto ? 'transparent' : aColor(email),
          overflow:'hidden', display:'flex', alignItems:'center', justifyContent:'center',
          border:'3px solid rgba(255,255,255,0.15)',
          boxShadow: estado==='conectado'
            ? '0 0 0 10px rgba(16,185,129,0.15)'
            : '0 0 0 10px rgba(255,255,255,0.05)',
          transition:'box-shadow 0.5s',
        }}>
          {foto
            ? <img src={foto} alt="" style={{ width:'100%', height:'100%', objectFit:'cover' }}/>
            : <span style={{ color:'#fff', fontWeight:700, fontSize:36 }}>{initials(nombre)}</span>
          }
        </div>
        <h2 style={{ color:'#fff', fontSize:26, fontWeight:700, margin:0, textAlign:'center' }}>{nombre}</h2>
        <p style={{ color: estado==='conectado' ? '#4ade80' : 'rgba(255,255,255,0.45)', fontSize:15, margin:0, transition:'color 0.3s' }}>
          {estadoTxt}
        </p>
      </div>

      {estado==='conectado' && <OndaAudio />}

      {/* Controles */}
      <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:24, zIndex:1, width:'100%' }}>
        <div style={{ display:'flex', gap:28, justifyContent:'center' }}>
          <BtnCtrl icon={mutedAudio?'🔇':'🎤'} label={mutedAudio?'Activar mic':'Silenciar'}   active={mutedAudio} onClick={toggleAudio}  />
          <BtnCtrl icon={altavoz?'🔊':'🔈'}    label={altavoz?'Altavoz':'Auricular'}          active={!altavoz}   onClick={toggleAltavoz}/>
          <BtnCtrl icon="⬇️"                   label="Minimizar"                                                  onClick={minimizarLlamada}/>
        </div>
        <BtnColgar onClick={terminar} />
      </div>
    </div>
  )

  /* ════════════════════════════════════════════════════
     RENDER VIDEO
  ════════════════════════════════════════════════════ */
  return (
    <div onClick={resetHide} style={{
      position:'fixed', inset:0, zIndex:9998,
      background:'#000', fontFamily:'system-ui,sans-serif',
    }}>
      {/* Video remoto — fondo */}
      {streamRemoto
        ? <video ref={remotoRef} autoPlay playsInline style={{ position:'absolute', inset:0, width:'100%', height:'100%', objectFit:'cover' }}/>
        : (
          <div style={{ position:'absolute', inset:0, background:'linear-gradient(160deg,#0a1628,#0d2137)', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:20 }}>
            <RingBg conectado={estado==='conectado'} />
            <div style={{ width:120, height:120, borderRadius:'50%', background: foto?'transparent':aColor(email), overflow:'hidden', display:'flex', alignItems:'center', justifyContent:'center', border:'3px solid rgba(255,255,255,0.15)', zIndex:1 }}>
              {foto ? <img src={foto} alt="" style={{ width:'100%', height:'100%', objectFit:'cover' }}/> : <span style={{ color:'#fff', fontWeight:700, fontSize:44 }}>{initials(nombre)}</span>}
            </div>
            <h2 style={{ color:'#fff', fontSize:22, fontWeight:700, margin:0, zIndex:1 }}>{nombre}</h2>
            <p style={{ color:'rgba(255,255,255,0.5)', fontSize:14, margin:0, zIndex:1 }}>{estadoTxt}</p>
          </div>
        )
      }

      {/* Video local — miniatura */}
      <div style={{
        position:'absolute', top:20, right:16, width:100, height:150,
        borderRadius:16, overflow:'hidden',
        border:'2px solid rgba(255,255,255,0.25)',
        boxShadow:'0 4px 20px rgba(0,0,0,0.5)',
        background:'#111', zIndex:10,
      }}>
        {streamLocal
          ? <video ref={localRef} autoPlay playsInline muted style={{ width:'100%', height:'100%', objectFit:'cover', transform:'scaleX(-1)' }}/>
          : <div style={{ width:'100%', height:'100%', display:'flex', alignItems:'center', justifyContent:'center', color:'rgba(255,255,255,0.3)', fontSize:11 }}>Sin cámara</div>
        }
        {mutedVideo && <div style={{ position:'absolute', inset:0, background:'rgba(0,0,0,0.6)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:24 }}>📵</div>}
      </div>

      {/* Overlay controles — se oculta automáticamente */}
      <div style={{
        position:'absolute', inset:0, zIndex:20,
        background: showCtrl ? 'linear-gradient(to bottom,rgba(0,0,0,0.4) 0%,transparent 30%,transparent 60%,rgba(0,0,0,0.65) 100%)' : 'transparent',
        display:'flex', flexDirection:'column', justifyContent:'space-between',
        padding:'24px 20px 44px',
        opacity: showCtrl ? 1 : 0,
        transition:'opacity 0.35s',
        pointerEvents: showCtrl ? 'auto' : 'none',
      }}>
        <div>
          <h3 style={{ color:'#fff', fontSize:20, fontWeight:700, margin:0 }}>{nombre}</h3>
          <p style={{ color: estado==='conectado'?'#4ade80':'rgba(255,255,255,0.65)', fontSize:14, margin:'4px 0 0', transition:'color 0.3s' }}>{estadoTxt}</p>
        </div>
        <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:20 }}>
          <div style={{ display:'flex', gap:20, justifyContent:'center' }}>
            <BtnCtrl icon={mutedAudio?'🔇':'🎤'} label={mutedAudio?'Activar':'Silenciar'} active={mutedAudio} onClick={toggleAudio}  glass />
            <BtnCtrl icon={mutedVideo?'📵':'📹'} label={mutedVideo?'Activar':'Cámara'}    active={mutedVideo} onClick={e=>{e.stopPropagation();toggleVideo()}} glass />
            <BtnCtrl icon="⬇️" label="Minimizar" onClick={e=>{e.stopPropagation();minimizarLlamada()}} glass />
          </div>
          <BtnColgar onClick={e=>{e.stopPropagation();terminar()}} />
        </div>
      </div>
    </div>
  )
}

/* ── Sub-componentes ────────────────────────────────────────── */

function BtnCtrl({ icon, label, active, onClick, glass }) {
  return (
    <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:6 }}>
      <button onClick={onClick} style={{
        width:56, height:56, borderRadius:'50%', border:'none', cursor:'pointer',
        background: active ? 'rgba(255,255,255,0.9)' : glass ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.12)',
        fontSize:20, display:'flex', alignItems:'center', justifyContent:'center',
        backdropFilter:'blur(8px)',
        boxShadow: active ? '0 2px 12px rgba(255,255,255,0.3)' : 'none',
        transition:'transform 0.15s, background 0.15s',
      }}
        onMouseEnter={e => e.currentTarget.style.transform='scale(1.1)'}
        onMouseLeave={e => e.currentTarget.style.transform='scale(1)'}
      >{icon}</button>
      {label && <span style={{ color:'rgba(255,255,255,0.65)', fontSize:11, fontWeight:500 }}>{label}</span>}
    </div>
  )
}

function BtnColgar({ onClick }) {
  return (
    <button onClick={onClick} style={{
      width:68, height:68, borderRadius:'50%',
      background:'#ef4444', border:'none', cursor:'pointer',
      fontSize:26, display:'flex', alignItems:'center', justifyContent:'center',
      boxShadow:'0 8px 32px rgba(239,68,68,0.6)',
      transform:'rotate(135deg)', transition:'box-shadow 0.15s',
    }}
      onMouseEnter={e => e.currentTarget.style.boxShadow='0 8px 48px rgba(239,68,68,0.9)'}
      onMouseLeave={e => e.currentTarget.style.boxShadow='0 8px 32px rgba(239,68,68,0.6)'}
    >📞</button>
  )
}

function RingBg({ conectado }) {
  return (
    <div style={{ position:'absolute', inset:0, overflow:'hidden', pointerEvents:'none' }}>
      {[0,1,2,3].map(i => (
        <div key={i} style={{
          position:'absolute', top:'42%', left:'50%',
          width:`${180+i*80}px`, height:`${180+i*80}px`,
          borderRadius:'50%',
          border:`1px solid ${conectado?'rgba(16,185,129,0.12)':'rgba(255,255,255,0.06)'}`,
          transform:'translate(-50%,-50%)',
          animation:`rbRing 4s ease-out infinite`, animationDelay:`${i*0.8}s`,
        }}/>
      ))}
      <style>{`@keyframes rbRing { 0%{transform:translate(-50%,-50%) scale(0.8);opacity:0.5} 100%{transform:translate(-50%,-50%) scale(2.2);opacity:0} }`}</style>
    </div>
  )
}

function OndaAudio() {
  return (
    <div style={{ display:'flex', alignItems:'center', gap:4, height:48, zIndex:1 }}>
      {[...Array(9)].map((_,i) => (
        <div key={i} style={{
          width:4, borderRadius:4, background:'rgba(16,185,129,0.7)',
          animation:`onda 1.4s ease-in-out infinite`, animationDelay:`${i*0.1}s`,
        }}/>
      ))}
      <style>{`@keyframes onda { 0%,100%{height:8px;opacity:0.4} 50%{height:32px;opacity:1} }`}</style>
    </div>
  )
}