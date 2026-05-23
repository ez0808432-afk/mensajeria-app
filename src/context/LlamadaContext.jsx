/**
 * LlamadaContext.jsx
 * ─────────────────────────────────────────────────────────────
 * Contexto global de llamadas estilo WhatsApp.
 *
 * Responsabilidades:
 *  • Escuchar llamadas entrantes desde CUALQUIER pantalla
 *  • Mostrar modal de llamada entrante (ring + avatar + botones)
 *  • Auto-rechazar a los 45 s
 *  • Gestionar llamada activa (estado compartido)
 *  • Burbuja minimizada flotante con timer y botón colgar
 *
 * Uso en main.jsx:
 *   <BrowserRouter>
 *     <LlamadaProvider>
 *       <App />
 *     </LlamadaProvider>
 *   </BrowserRouter>
 */

import {
  createContext, useContext, useEffect,
  useRef, useState, useCallback
} from 'react'
import { useNavigate } from 'react-router-dom'
import { db } from '../firebase'
import {
  collection, onSnapshot, query, where,
  getDocs, doc, updateDoc, addDoc, serverTimestamp
} from 'firebase/firestore'

const LlamadaCtx = createContext(null)
export const useLlamada = () => useContext(LlamadaCtx)

/* ── helpers ────────────────────────────────────────────────── */
const initials = name =>
  (name || '?').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
const AVATAR_COLORS = ['#0f766e','#2563eb','#7c3aed','#d97706','#e11d48','#0891b2']
const avatarColor = e =>
  AVATAR_COLORS[[...(e||'a')].reduce((a,c) => a + c.charCodeAt(0), 0) % AVATAR_COLORS.length]

/* ══════════════════════════════════════════════════════════════
   PROVIDER
══════════════════════════════════════════════════════════════ */
export function LlamadaProvider({ children }) {
  const navigate = useNavigate()
  const user     = JSON.parse(localStorage.getItem('usuario') || '{}')

  // llamada entrante esperando respuesta
  const [llamadaEntrante, setLlamadaEntrante] = useState(null)
  // { llamadaId, chatId, tipo, de, deNombre, deFoto }

  // llamada activa (ya aceptada o saliente marcando)
  const [llamadaActiva, setLlamadaActiva] = useState(null)
  // { llamadaId, chatId, tipo, esSaliente, contacto:{contactoNombre,contactoEmail,foto}, minimizada }

  const audioRef    = useRef(null)
  const timerRef    = useRef(null)
  const unsubsRef   = useRef([])
  const procesados  = useRef(new Set())

  /* ── ring ─────────────────────────────────────────────────── */
  const playRing = useCallback(() => {
    if (audioRef.current) return
    const a = new Audio('https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3')
    a.loop = true; a.volume = 0.6
    a.play().catch(() => {})
    audioRef.current = a
  }, [])

  const stopRing = useCallback(() => {
    audioRef.current?.pause()
    audioRef.current = null
  }, [])

  /* ── escuchar llamadas entrantes ──────────────────────────── */
  useEffect(() => {
    if (!user.email) return

    // Escuchar llamadas donde YO soy el destinatario
    const q = query(
      collection(db, 'llamadas_activas'),
      where('para',   '==', user.email),
      where('estado', '==', 'llamando')
    )

    const unsub = onSnapshot(q, async snap => {
      if (snap.empty) {
        // La llamada desapareció (rechazada/terminada por el llamante)
        setLlamadaEntrante(prev => {
          if (prev) { stopRing(); clearTimeout(timerRef.current) }
          return null
        })
        return
      }

      const llamadaDoc = snap.docs[0]
      const lid  = llamadaDoc.id
      const data = llamadaDoc.data()

      if (procesados.current.has(lid)) return
      procesados.current.add(lid)

      // Si ya hay llamada activa → rechazar silenciosamente
      if (llamadaActiva) {
        await updateDoc(doc(db, 'llamadas_activas', lid), { estado: 'rechazada' })
        procesados.current.delete(lid)
        return
      }

      // Obtener info del llamante desde Firestore
      let deNombre = data.deNombre || data.de
      let deFoto   = data.deFoto   || null
      try {
        const uSnap = await getDocs(
          query(collection(db, 'usuarios'), where('email', '==', data.de))
        )
        if (!uSnap.empty) {
          deNombre = uSnap.docs[0].data().name || deNombre
          deFoto   = uSnap.docs[0].data().foto || deFoto
        }
      } catch {}

      setLlamadaEntrante({ llamadaId:lid, chatId:data.chatId, tipo:data.tipo||'audio', de:data.de, deNombre, deFoto })
      playRing()

      // Auto-rechazar a los 45 s
      clearTimeout(timerRef.current)
      timerRef.current = setTimeout(() => rechazarLlamada(lid), 45000)
    })

    return () => {
      unsub()
      stopRing()
      clearTimeout(timerRef.current)
    }
  }, [user.email, llamadaActiva])

  /* ── rechazar ─────────────────────────────────────────────── */
  const rechazarLlamada = useCallback(async (llamadaId) => {
    clearTimeout(timerRef.current)
    stopRing()
    try { await updateDoc(doc(db,'llamadas_activas',llamadaId), { estado:'rechazada' }) } catch {}
    setLlamadaEntrante(null)
    procesados.current.delete(llamadaId)
  }, [stopRing])

  /* ── aceptar ──────────────────────────────────────────────── */
  const aceptarLlamada = useCallback(async (entrante) => {
    clearTimeout(timerRef.current)
    stopRing()
    try { await updateDoc(doc(db,'llamadas_activas',entrante.llamadaId), { estado:'aceptada' }) } catch {}
    setLlamadaEntrante(null)

    // Obtener info del contacto para mostrar en pantalla
    let contactoNombre = entrante.deNombre
    let foto           = entrante.deFoto

    setLlamadaActiva({
      llamadaId:   entrante.llamadaId,
      chatId:      entrante.chatId,
      tipo:        entrante.tipo,
      esSaliente:  false,
      contacto:    { contactoNombre, contactoEmail: entrante.de, foto },
      minimizada:  false,
    })
  }, [stopRing])

  /* ── iniciar llamada saliente ─────────────────────────────── */
  const iniciarLlamada = useCallback(async ({ chatId, tipo, contacto }) => {
    if (!user.email || !chatId) return

    const ref = await addDoc(collection(db, 'llamadas_activas'), {
      chatId,
      tipo,
      de:       user.email,
      deNombre: user.name || user.email,
      para:     contacto.contactoEmail,
      estado:   'llamando',
      createdAt: serverTimestamp(),
    })

    setLlamadaActiva({
      llamadaId:  ref.id,
      chatId,
      tipo,
      esSaliente: true,
      contacto,
      minimizada: false,
    })
  }, [user])

  /* ── terminar llamada ─────────────────────────────────────── */
  const terminarLlamada = useCallback(async () => {
    if (llamadaActiva?.llamadaId) {
      try {
        await updateDoc(doc(db,'llamadas_activas',llamadaActiva.llamadaId), { estado:'terminada' })
      } catch {}
    }
    setLlamadaActiva(null)
  }, [llamadaActiva])

  /* ── minimizar / restaurar ────────────────────────────────── */
  const minimizarLlamada  = useCallback(() => setLlamadaActiva(p => p ? {...p, minimizada:true}  : null), [])
  const restaurarLlamada  = useCallback(() => setLlamadaActiva(p => p ? {...p, minimizada:false} : null), [])

  /* ══════════════════════════════════════════════════════════
     RENDER
  ══════════════════════════════════════════════════════════ */
  return (
    <LlamadaCtx.Provider value={{
      llamadaEntrante,
      llamadaActiva,
      iniciarLlamada,
      terminarLlamada,
      minimizarLlamada,
      restaurarLlamada,
      rechazarLlamada,
      aceptarLlamada,
    }}>
      {children}

      {/* Modal entrante — por encima de TODO */}
      {llamadaEntrante && !llamadaActiva && (
        <ModalLlamadaEntrante
          llamada={llamadaEntrante}
          onRechazar={() => rechazarLlamada(llamadaEntrante.llamadaId)}
          onAceptar={() => aceptarLlamada(llamadaEntrante)}
        />
      )}

      {/* Burbuja minimizada */}
      {llamadaActiva?.minimizada && (
        <BurbujaLlamada
          llamada={llamadaActiva}
          onRestaurar={restaurarLlamada}
          onTerminar={terminarLlamada}
        />
      )}
    </LlamadaCtx.Provider>
  )
}

/* ══════════════════════════════════════════════════════════════
   MODAL DE LLAMADA ENTRANTE
══════════════════════════════════════════════════════════════ */
function ModalLlamadaEntrante({ llamada, onRechazar, onAceptar }) {
  const [seg, setSeg]         = useState(0)
  const [aceptando, setAcept] = useState(false)

  useEffect(() => {
    const id = setInterval(() => setSeg(p => p + 1), 1000)
    return () => clearInterval(id)
  }, [])

  return (
    <div style={{
      position:'fixed', inset:0, zIndex:99999,
      background:'linear-gradient(160deg,#0a1628 0%,#0d2137 50%,#0a1628 100%)',
      display:'flex', flexDirection:'column',
      alignItems:'center', justifyContent:'center',
      fontFamily:'system-ui,sans-serif',
      animation:'fimFade 0.3s ease',
    }}>
      {/* Anillos de fondo */}
      <div style={{ position:'absolute', inset:0, overflow:'hidden', pointerEvents:'none' }}>
        {[0,1,2].map(i => (
          <div key={i} style={{
            position:'absolute', top:'45%', left:'50%',
            width:`${220+i*100}px`, height:`${220+i*100}px`,
            borderRadius:'50%',
            border:'1px solid rgba(16,185,129,0.15)',
            transform:'translate(-50%,-50%)',
            animation:`fimRing 3s ease-out infinite`,
            animationDelay:`${i}s`,
          }}/>
        ))}
      </div>

      <p style={{ color:'rgba(255,255,255,0.5)', fontSize:13, letterSpacing:'0.1em', textTransform:'uppercase', margin:'0 0 28px', zIndex:1, display:'flex', alignItems:'center', gap:8 }}>
        <span style={{ fontSize:18 }}>{llamada.tipo==='video'?'📹':'📞'}</span>
        {llamada.tipo==='video' ? 'Videollamada entrante' : 'Llamada de voz entrante'}
      </p>

      {/* Avatar */}
      <div style={{ position:'relative', marginBottom:20, zIndex:1 }}>
        <div style={{
          width:120, height:120, borderRadius:'50%',
          background: llamada.deFoto ? 'transparent' : avatarColor(llamada.de),
          overflow:'hidden',
          display:'flex', alignItems:'center', justifyContent:'center',
          border:'3px solid rgba(255,255,255,0.15)',
          boxShadow:'0 0 0 10px rgba(16,185,129,0.08), 0 0 0 20px rgba(16,185,129,0.04)',
          animation:'fimPulse 2s ease-in-out infinite',
        }}>
          {llamada.deFoto
            ? <img src={llamada.deFoto} alt="" style={{ width:'100%', height:'100%', objectFit:'cover' }}/>
            : <span style={{ color:'#fff', fontWeight:700, fontSize:44 }}>{initials(llamada.deNombre)}</span>
          }
        </div>
      </div>

      <h2 style={{ color:'#fff', fontSize:26, fontWeight:700, margin:'0 0 8px', zIndex:1, textAlign:'center', padding:'0 24px' }}>
        {llamada.deNombre}
      </h2>
      <p style={{ color:'rgba(255,255,255,0.4)', fontSize:14, margin:'0 0 56px', zIndex:1 }}>
        {seg < 2 ? 'Llamando...' : `Llamando hace ${seg}s`}
      </p>

      {/* Botones */}
      <div style={{ display:'flex', gap:64, zIndex:1 }}>
        {/* Rechazar */}
        <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:10 }}>
          <button onClick={onRechazar} style={{
            width:72, height:72, borderRadius:'50%', background:'#ef4444',
            border:'none', cursor:'pointer', fontSize:28,
            display:'flex', alignItems:'center', justifyContent:'center',
            boxShadow:'0 8px 24px rgba(239,68,68,0.5)',
            transform:'rotate(135deg)', transition:'box-shadow 0.15s',
          }}>📞</button>
          <span style={{ color:'rgba(255,255,255,0.6)', fontSize:13, fontWeight:500 }}>Rechazar</span>
        </div>
        {/* Aceptar */}
        <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:10 }}>
          <button onClick={() => { setAcept(true); onAceptar() }} disabled={aceptando} style={{
            width:72, height:72, borderRadius:'50%',
            background: aceptando ? '#059669' : '#10b981',
            border:'none', cursor:'pointer', fontSize:28,
            display:'flex', alignItems:'center', justifyContent:'center',
            boxShadow:'0 8px 24px rgba(16,185,129,0.5)',
            animation:'fimGreen 1.5s ease infinite',
            transition:'background 0.2s',
          }}>📞</button>
          <span style={{ color:'rgba(255,255,255,0.6)', fontSize:13, fontWeight:500 }}>Aceptar</span>
        </div>
      </div>

      <style>{`
        @keyframes fimFade  { from{opacity:0} to{opacity:1} }
        @keyframes fimRing  { 0%{transform:translate(-50%,-50%) scale(0.8);opacity:0.6} 100%{transform:translate(-50%,-50%) scale(2);opacity:0} }
        @keyframes fimPulse { 0%,100%{box-shadow:0 0 0 10px rgba(16,185,129,0.08),0 0 0 20px rgba(16,185,129,0.04)} 50%{box-shadow:0 0 0 14px rgba(16,185,129,0.12),0 0 0 28px rgba(16,185,129,0.04)} }
        @keyframes fimGreen { 0%,100%{box-shadow:0 8px 24px rgba(16,185,129,0.5)} 50%{box-shadow:0 8px 40px rgba(16,185,129,0.9)} }
      `}</style>
    </div>
  )
}

/* ══════════════════════════════════════════════════════════════
   BURBUJA MINIMIZADA
══════════════════════════════════════════════════════════════ */
function BurbujaLlamada({ llamada, onRestaurar, onTerminar }) {
  const [seg, setSeg] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setSeg(p => p + 1), 1000)
    return () => clearInterval(id)
  }, [])
  const mm = String(Math.floor(seg/60)).padStart(2,'0')
  const ss = String(seg%60).padStart(2,'0')

  return (
    <div onClick={onRestaurar} style={{
      position:'fixed', bottom:24, right:24, zIndex:9999,
      background:'linear-gradient(135deg,#0f766e,#0891b2)',
      borderRadius:20, padding:'12px 16px',
      display:'flex', alignItems:'center', gap:12,
      boxShadow:'0 8px 32px rgba(0,0,0,0.3)',
      cursor:'pointer', minWidth:210,
      border:'1px solid rgba(255,255,255,0.15)',
      animation:'burbujaIn 0.3s ease',
      userSelect:'none', fontFamily:'system-ui,sans-serif',
      transition:'transform 0.15s',
    }}
      onMouseEnter={e => e.currentTarget.style.transform='scale(1.03)'}
      onMouseLeave={e => e.currentTarget.style.transform='scale(1)'}
    >
      <div style={{ width:10, height:10, borderRadius:'50%', background:'#4ade80', flexShrink:0, animation:'burbujaDot 1.5s ease infinite' }}/>
      <div style={{ flex:1 }}>
        <p style={{ color:'#fff', fontWeight:700, fontSize:13, margin:0 }}>
          {llamada.tipo==='video'?'📹':'📞'} {llamada.contacto?.contactoNombre || 'Llamada'}
        </p>
        <p style={{ color:'rgba(255,255,255,0.7)', fontSize:11, margin:0 }}>{mm}:{ss}</p>
      </div>
      <button onClick={e => { e.stopPropagation(); onTerminar() }} style={{
        background:'#ef4444', border:'none', borderRadius:10,
        color:'#fff', fontSize:11, fontWeight:700,
        padding:'5px 11px', cursor:'pointer', flexShrink:0,
      }}>FIN</button>
      <style>{`
        @keyframes burbujaIn  { from{transform:translateY(80px);opacity:0} to{transform:translateY(0);opacity:1} }
        @keyframes burbujaDot { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:0.5;transform:scale(1.4)} }
      `}</style>
    </div>
  )
}