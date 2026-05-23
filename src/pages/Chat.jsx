/**
 * Chat.jsx — Tu versión original con un solo cambio:
 * las llamadas se delegan a iniciarLlamada() del LlamadaContext
 * en lugar de manejar estado local de llamada.
 */
import { useState, useEffect, useRef } from 'react'
import { useNavigate, useParams, useLocation } from 'react-router-dom'
import { db } from '../firebase'
import {
  collection, addDoc, onSnapshot, orderBy, query,
  serverTimestamp, updateDoc, deleteDoc, doc, getDocs, where
} from 'firebase/firestore'
import EmojiPicker from 'emoji-picker-react'
import { useLlamada } from '../context/LlamadaContext'

/* ── helpers ─────────────────────────────────────────────── */
const initials = name =>
  (name || '?').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()

const AVATAR_COLORS = [
  '#0f766e','#2563eb','#7c3aed','#d97706',
  '#e11d48','#0891b2','#059669','#ea580c'
]
const avatarColor = email =>
  AVATAR_COLORS[[...(email||'a')].reduce((a,c)=>a+c.charCodeAt(0),0) % AVATAR_COLORS.length]

const formatTime = ts => {
  if (!ts) return ''
  const d = ts.toDate ? ts.toDate() : new Date(ts)
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

const formatLastSeen = ts => {
  if (!ts) return ''
  const d    = ts.toDate ? ts.toDate() : new Date(ts)
  const diff = Math.floor((Date.now() - d) / 60000)
  if (diff < 1)    return 'hace un momento'
  if (diff < 60)   return `hace ${diff} min`
  if (diff < 1440) return `hace ${Math.floor(diff / 60)}h`
  return d.toLocaleDateString()
}

export default function Chat() {
  const navigate   = useNavigate()
  const { chatId } = useParams()
  const location   = useLocation()
  const contacto   = location.state?.contacto
  const user       = JSON.parse(localStorage.getItem('usuario') || '{}')

  // ── El único cambio respecto a tu versión original ──────
  // Usamos el contexto global; ya no hay estado local de llamada
  const { iniciarLlamada } = useLlamada()
  const llamar      = () => iniciarLlamada({ chatId, tipo: 'audio', contacto })
  const videoLlamar = () => iniciarLlamada({ chatId, tipo: 'video', contacto })

  const [messages,      setMessages]      = useState([])
  const [input,         setInput]         = useState('')
  const [contactoInfo,  setContactoInfo]  = useState(null)
  const [showEmoji,     setShowEmoji]     = useState(false)
  const [menuMsg,       setMenuMsg]       = useState(null)
  const [reacting,      setReacting]      = useState(null)
  const [recording,     setRecording]     = useState(false)
  const [dark,          setDark]          = useState(false)
  const [showAttach,    setShowAttach]    = useState(false)
  const [showChatOpts,  setShowChatOpts]  = useState(false)

  const bottomRef    = useRef(null)
  const inputRef     = useRef(null)
  const prevMsgCount = useRef(0)
  const imgRef       = useRef(null)
  const fileRef      = useRef(null)

  /* ── dark mode ──────────────────────────────────────────── */
  useEffect(() => {
    const saved = localStorage.getItem('theme') === 'dark'
    setDark(saved)
    document.documentElement.classList.toggle('dark', saved)
  }, [])

  const toggleDark = () => {
    const next = !dark
    setDark(next)
    localStorage.setItem('theme', next ? 'dark' : 'light')
    document.documentElement.classList.toggle('dark', next)
  }

  /* ── auth + info contacto ───────────────────────────────── */
  useEffect(() => {
    if (!user.email) { navigate('/login'); return }
    if (!chatId)     { navigate('/contactos'); return }
    if (contacto?.contactoEmail) {
      const q     = query(collection(db,'usuarios'), where('email','==',contacto.contactoEmail))
      const unsub = onSnapshot(q, snap => {
        if (!snap.empty) setContactoInfo(snap.docs[0].data())
      })
      return () => unsub()
    }
  }, [chatId])

  /* ── mensajes ───────────────────────────────────────────── */
  useEffect(() => {
    if (!chatId) return
    const q     = query(collection(db,'chats',chatId,'mensajes'), orderBy('createdAt'))
    const unsub = onSnapshot(q, async snap => {
      const msgs = snap.docs.map(d => ({ id: d.id, ...d.data() }))
      setMessages(msgs)

      if (msgs.length > prevMsgCount.current) {
        const ultimo = msgs[msgs.length - 1]
        if (ultimo?.email !== user.email && prevMsgCount.current > 0) {
          new Audio('https://assets.mixkit.co/active_storage/sfx/2354/2354-preview.mp3')
            .play().catch(() => {})
        }
        prevMsgCount.current = msgs.length
      }

      snap.docs.forEach(async d => {
        const data = d.data()
        if (data.email !== user.email && !data.leido)
          await updateDoc(doc(db,'chats',chatId,'mensajes',d.id), { leido: true })
      })
    })
    return () => unsub()
  }, [chatId])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  /* ── enviar texto ───────────────────────────────────────── */
  const send = async () => {
    if (!input.trim()) return
    const text = input.trim()
    setInput('')
    setShowEmoji(false)
    await addDoc(collection(db,'chats',chatId,'mensajes'), {
      text, user: user.name, email: user.email,
      createdAt: serverTimestamp(), leido: false, tipo: 'texto'
    })
  }

  const handleKey = e => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() }
  }

  /* ── enviar imagen ──────────────────────────────────────── */
  const sendImage = async e => {
    const file = e.target.files[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = async ev => {
      await addDoc(collection(db,'chats',chatId,'mensajes'), {
        text: ev.target.result, user: user.name, email: user.email,
        createdAt: serverTimestamp(), leido: false, tipo: 'imagen', fileName: file.name
      })
    }
    reader.readAsDataURL(file)
    e.target.value = ''
    setShowAttach(false)
  }

  /* ── enviar archivo ─────────────────────────────────────── */
  const sendFile = async e => {
    const file = e.target.files[0]
    if (!file) return
    await addDoc(collection(db,'chats',chatId,'mensajes'), {
      text: file.name, user: user.name, email: user.email,
      createdAt: serverTimestamp(), leido: false, tipo: 'archivo', fileName: file.name
    })
    e.target.value = ''
    setShowAttach(false)
  }

  /* ── grabar audio ───────────────────────────────────────── */
  const toggleRecording = async () => {
    if (!recording) {
      try {
        const stream   = await navigator.mediaDevices.getUserMedia({ audio: true })
        const recorder = new MediaRecorder(stream)
        const chunks   = []
        recorder.ondataavailable = e => chunks.push(e.data)
        recorder.onstop = async () => {
          const blob   = new Blob(chunks, { type: 'audio/webm' })
          const reader = new FileReader()
          reader.onload = async ev => {
            await addDoc(collection(db,'chats',chatId,'mensajes'), {
              text: ev.target.result, user: user.name, email: user.email,
              createdAt: serverTimestamp(), leido: false, tipo: 'audio'
            })
          }
          reader.readAsDataURL(blob)
          stream.getTracks().forEach(t => t.stop())
        }
        recorder.start()
        setTimeout(() => recorder.stop(), 30000)
        window._recorder = recorder
        setRecording(true)
      } catch { alert('No se pudo acceder al micrófono') }
    } else {
      window._recorder?.stop()
      window._recorder = null
      setRecording(false)
    }
  }

  const deleteMsgMe  = async id => { await deleteDoc(doc(db,'chats',chatId,'mensajes',id)); setMenuMsg(null) }
  const deleteMsgAll = async id => { await updateDoc(doc(db,'chats',chatId,'mensajes',id), { tipo:'deleted', text:'', leido:true }); setMenuMsg(null) }
  const reactMsg     = async (id, emoji) => { await updateDoc(doc(db,'chats',chatId,'mensajes',id), { reaccion: emoji }); setReacting(null) }

  const clearChat = async () => {
    setShowChatOpts(false)
    if (!window.confirm('¿Vaciar todo el chat? No se puede deshacer.')) return
    const snap = await getDocs(collection(db,'chats',chatId,'mensajes'))
    snap.forEach(d => deleteDoc(doc(db,'chats',chatId,'mensajes',d.id)))
  }

  const contactoFoto   = contactoInfo?.foto   || contacto?.foto   || null
  const contactoNombre = contactoInfo?.name   || contacto?.contactoNombre || 'Chat'
  const contactoOnline = contactoInfo?.online || false
  const contactoEmail  = contacto?.contactoEmail || ''

  const C = {
    appBg:    dark ? '#111b21' : '#e2e8f0',
    panelBg:  dark ? '#111b21' : '#ffffff',
    header:   dark ? '#1f2c34' : '#830000',
    chatBg:   dark ? '#0b141a' : '#f0ede8',
    msgOut:   dark ? '#005c4b' : '#830000',
    msgOutTxt:'#ffffff',
    msgIn:    dark ? '#1f2c34' : '#ffffff',
    msgInTxt: dark ? '#f1f5f9' : '#1e293b',
    deleted:  dark ? '#2a2a2a' : '#f3f4f6',
    deletedTxt:dark?'#6b7280':'#9ca3af',
    inputBar: dark ? '#1f2c34' : '#f8fafc',
    inputBdr: dark ? 'rgba(255,255,255,0.06)' : '#e2e8f0',
    inputBg:  dark ? '#2a3942' : '#ffffff',
    inputFld: dark ? '#e2e8f0' : '#111827',
    menuBg:   dark ? '#233138' : '#ffffff',
    menuBdr:  dark ? 'rgba(255,255,255,0.08)' : '#f1f5f9',
    menuTxt:  dark ? '#f1f5f9' : '#374151',
    subTxt:   dark ? '#64748b' : '#94a3b8',
    timeOut:  'rgba(255,255,255,0.65)',
    timeIn:   dark ? '#64748b' : '#9ca3af',
    divider:  dark ? 'rgba(255,255,255,0.05)' : '#f1f5f9',
    attachBg: dark ? '#1f2c34' : '#ffffff',
    attachBdr:dark ? 'rgba(255,255,255,0.08)' : '#e2e8f0',
    iconClr:  dark ? '#94a3b8' : '#6b7280',
    btnGhost: 'rgba(255,255,255,0.15)',
  }

  return (
    <div
      onClick={() => { setMenuMsg(null); setReacting(null); setShowEmoji(false); setShowAttach(false); setShowChatOpts(false) }}
      style={{ width:'100%', height:'100vh', background:C.appBg, display:'flex', alignItems:'center', justifyContent:'center', fontFamily:'system-ui, sans-serif', transition:'background 0.3s' }}
    >
      <div style={{
        width:'100%', height:'100vh', maxWidth:'520px',
        display:'flex', flexDirection:'column',
        background:C.panelBg, overflow:'hidden', transition:'background 0.3s',
        ...(window.innerWidth >= 768 ? {
          height:'calc(100vh - 40px)', borderRadius:'20px',
          boxShadow:'0 8px 48px rgba(0,0,0,0.18)',
          border: dark?'1px solid rgba(255,255,255,0.05)':'1px solid rgba(0,0,0,0.08)',
        } : {}),
        ...(window.innerWidth >= 1024 ? { maxWidth:'900px' } : {}),
      }}>

        {/* HEADER */}
        <div style={{ background:C.header, padding:'12px 16px', display:'flex', alignItems:'center', gap:'10px', flexShrink:0 }}>
          <button onClick={() => navigate('/contactos')} style={{ background:C.btnGhost, border:'none', color:'#fff', borderRadius:'8px', padding:'6px 10px', fontSize:'16px', cursor:'pointer', flexShrink:0 }}>←</button>

          <div style={{ position:'relative', flexShrink:0 }}>
            {contactoFoto ? (
              <img src={contactoFoto} alt={contactoNombre} style={{ width:'40px', height:'40px', borderRadius:'50%', objectFit:'cover', border:'2px solid rgba(255,255,255,0.25)' }} />
            ) : (
              <div style={{ width:'40px', height:'40px', borderRadius:'50%', background:avatarColor(contactoEmail), display:'flex', alignItems:'center', justifyContent:'center', color:'#fff', fontWeight:'700', fontSize:'14px' }}>
                {initials(contactoNombre)}
              </div>
            )}
            <div style={{ position:'absolute', bottom:'1px', right:'1px', width:'11px', height:'11px', borderRadius:'50%', background:contactoOnline?'#10b981':'#9ca3af', border:`2px solid ${C.header}` }} />
          </div>

          <div style={{ flex:1, minWidth:0 }}>
            <p style={{ color:'#fff', fontWeight:'600', fontSize:'14px', margin:0, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{contactoNombre}</p>
            <p style={{ color:'rgba(255,255,255,0.75)', fontSize:'11px', margin:0 }}>
              {contactoOnline ? '● En línea' : `● Última vez ${formatLastSeen(contactoInfo?.lastSeen)}`}
            </p>
          </div>

          <button onClick={llamar}       title="Llamada de voz" style={{ background:C.btnGhost, border:'none', color:'#fff', borderRadius:'8px', width:'34px', height:'34px', fontSize:'16px', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center' }}>📞</button>
          <button onClick={videoLlamar}  title="Videollamada"   style={{ background:C.btnGhost, border:'none', color:'#fff', borderRadius:'8px', width:'34px', height:'34px', fontSize:'16px', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center' }}>📹</button>
          <button onClick={e=>{e.stopPropagation();toggleDark()}} title="Tema" style={{ background:C.btnGhost, border:'none', color:'#fff', borderRadius:'8px', width:'34px', height:'34px', fontSize:'15px', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center' }}>{dark?'☀️':'🌙'}</button>

          <div style={{ position:'relative' }}>
            <button onClick={e=>{e.stopPropagation();setShowChatOpts(p=>!p)}} style={{ background:C.btnGhost, border:'none', color:'#fff', borderRadius:'8px', width:'34px', height:'34px', fontSize:'20px', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', lineHeight:1 }}>⋮</button>
            {showChatOpts && (
              <div onClick={e=>e.stopPropagation()} style={{ position:'absolute', right:0, top:'100%', marginTop:'6px', background:C.menuBg, border:`1px solid ${C.menuBdr}`, borderRadius:'12px', boxShadow:'0 4px 20px rgba(0,0,0,0.15)', zIndex:200, minWidth:'180px', overflow:'hidden' }}>
                <button onClick={clearChat} style={{ width:'100%', padding:'11px 16px', border:'none', background:'none', textAlign:'left', fontSize:'13px', cursor:'pointer', color:'#f87171', display:'flex', alignItems:'center', gap:'8px' }}>🧹 Vaciar chat</button>
                <button onClick={()=>{setShowChatOpts(false);navigate('/contactos')}} style={{ width:'100%', padding:'11px 16px', border:'none', background:'none', textAlign:'left', fontSize:'13px', cursor:'pointer', color:C.menuTxt, display:'flex', alignItems:'center', gap:'8px' }}>← Contactos</button>
              </div>
            )}
          </div>
        </div>

        {/* MENSAJES */}
        <div style={{ flex:1, overflowY:'auto', padding:'12px 14px', display:'flex', flexDirection:'column', gap:'4px', background:C.chatBg, minHeight:0, transition:'background 0.3s' }}>
          {messages.length === 0 && (
            <p style={{ textAlign:'center', color:C.subTxt, fontSize:'13px', marginTop:'24px' }}>No hay mensajes aún. ¡Di hola! 👋</p>
          )}

          {messages.map(m => {
            const isMe    = m.email === user.email
            const deleted = m.tipo === 'deleted'
            return (
              <div key={m.id} style={{ display:'flex', alignItems:'flex-end', gap:'6px', flexDirection:isMe?'row-reverse':'row' }}>
                {!isMe && (
                  <div style={{ flexShrink:0, marginBottom:'2px' }}>
                    {contactoFoto
                      ? <img src={contactoFoto} alt="" style={{ width:'26px', height:'26px', borderRadius:'50%', objectFit:'cover' }} />
                      : <div style={{ width:'26px', height:'26px', borderRadius:'50%', background:avatarColor(contactoEmail), display:'flex', alignItems:'center', justifyContent:'center', color:'#fff', fontWeight:'700', fontSize:'10px' }}>{initials(contactoNombre)}</div>
                    }
                  </div>
                )}

                <div style={{ display:'flex', flexDirection:'column', alignItems:isMe?'flex-end':'flex-start', maxWidth:'72%', position:'relative' }}>
                  <div
                    onContextMenu={e => { e.preventDefault(); if (!deleted) { setMenuMsg(m.id); setReacting(null) } }}
                    style={{ padding:deleted?'8px 14px':'8px 12px', borderRadius:isMe?'14px 4px 14px 14px':'4px 14px 14px 14px', background:deleted?C.deleted:isMe?C.msgOut:C.msgIn, color:deleted?C.deletedTxt:isMe?C.msgOutTxt:C.msgInTxt, fontSize:'14px', lineHeight:'1.45', boxShadow:'0 1px 2px rgba(0,0,0,0.1)', wordBreak:'break-word', whiteSpace:'pre-wrap', cursor:deleted?'default':'context-menu', fontStyle:deleted?'italic':'normal', transition:'background 0.3s', minWidth:'80px' }}
                  >
                    {deleted ? <span>🚫 Mensaje eliminado</span>
                    : m.tipo==='imagen'  ? <img src={m.text} alt="img" style={{ maxWidth:'100%', maxHeight:'260px', borderRadius:'8px', display:'block', objectFit:'contain' }} />
                    : m.tipo==='audio'   ? <audio controls src={m.text} style={{ maxWidth:'220px', minWidth:'160px', display:'block' }} />
                    : m.tipo==='archivo' ? <div style={{ display:'flex', alignItems:'center', gap:'8px' }}><span style={{ fontSize:'20px' }}>📄</span><span style={{ fontSize:'13px', wordBreak:'break-all' }}>{m.fileName||m.text}</span></div>
                    : <span>{m.text}</span>}

                    {!deleted && (
                      <div style={{ display:'flex', alignItems:'center', justifyContent:'flex-end', gap:'3px', marginTop:'4px' }}>
                        <span style={{ fontSize:'10px', color:isMe?C.timeOut:C.timeIn }}>{formatTime(m.createdAt)}</span>
                        {isMe && <span style={{ fontSize:'10px', color:m.leido?'#fbbf24':'rgba(255,255,255,0.4)' }}>{m.leido?'✓✓':'✓'}</span>}
                      </div>
                    )}
                  </div>

                  {m.reaccion && !deleted && <span style={{ fontSize:'16px', marginTop:'2px' }}>{m.reaccion}</span>}

                  {menuMsg === m.id && (
                    <div onClick={e=>e.stopPropagation()} style={{ position:'absolute', [isMe?'right':'left']:'0', top:'100%', marginTop:'4px', background:C.menuBg, border:`1px solid ${C.menuBdr}`, borderRadius:'12px', boxShadow:'0 4px 20px rgba(0,0,0,0.15)', zIndex:100, minWidth:'190px', overflow:'hidden' }}>
                      <button onClick={()=>{setReacting(m.id);setMenuMsg(null)}} style={{ width:'100%', padding:'10px 16px', border:'none', background:'none', textAlign:'left', fontSize:'13px', cursor:'pointer', color:C.menuTxt, display:'flex', alignItems:'center', gap:'8px' }}>😊 Reaccionar</button>
                      {isMe && <>
                        <div style={{ height:'1px', background:C.divider }} />
                        <button onClick={()=>deleteMsgMe(m.id)}  style={{ width:'100%', padding:'10px 16px', border:'none', background:'none', textAlign:'left', fontSize:'13px', cursor:'pointer', color:'#f87171', display:'flex', alignItems:'center', gap:'8px' }}>🗑️ Eliminar para mí</button>
                        <button onClick={()=>deleteMsgAll(m.id)} style={{ width:'100%', padding:'10px 16px', border:'none', background:'none', textAlign:'left', fontSize:'13px', cursor:'pointer', color:'#f87171', display:'flex', alignItems:'center', gap:'8px' }}>🚫 Eliminar para todos</button>
                      </>}
                    </div>
                  )}

                  {reacting === m.id && (
                    <div onClick={e=>e.stopPropagation()} style={{ position:'absolute', [isMe?'right':'left']:'0', top:'100%', marginTop:'4px', zIndex:100, display:'flex', gap:'4px', background:C.menuBg, border:`1px solid ${C.menuBdr}`, borderRadius:'24px', padding:'6px 12px', boxShadow:'0 4px 16px rgba(0,0,0,0.15)' }}>
                      {['❤️','😂','👍','😮','😢','🔥','👎','🎉'].map(e => (
                        <span key={e} onClick={()=>reactMsg(m.id,e)} style={{ fontSize:'20px', cursor:'pointer', transition:'transform 0.1s' }}
                          onMouseEnter={ev=>ev.target.style.transform='scale(1.3)'}
                          onMouseLeave={ev=>ev.target.style.transform='scale(1)'}
                        >{e}</span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )
          })}
          <div ref={bottomRef} />
        </div>

        {/* EMOJI PICKER */}
        {showEmoji && (
          <div onClick={e=>e.stopPropagation()} style={{ position:'absolute', bottom:'72px', left:'14px', zIndex:300 }}>
            <EmojiPicker onEmojiClick={ed=>{setInput(p=>p+ed.emoji);inputRef.current?.focus()}} theme={dark?'dark':'light'} height={340} width={300} />
          </div>
        )}

        {/* INPUT BAR */}
        <div onClick={e=>e.stopPropagation()} style={{ padding:'8px 12px', borderTop:`1px solid ${C.inputBdr}`, display:'flex', gap:'6px', alignItems:'center', background:C.inputBar, flexShrink:0, transition:'background 0.3s', position:'relative' }}>
          <button onClick={()=>{setShowEmoji(p=>!p);setShowAttach(false)}} style={{ background:'none', border:'none', fontSize:'22px', cursor:'pointer', padding:'4px', flexShrink:0, color:C.iconClr }}>😊</button>

          <div style={{ position:'relative', flexShrink:0 }}>
            <button onClick={e=>{e.stopPropagation();setShowAttach(p=>!p);setShowEmoji(false)}} style={{ background:'none', border:'none', fontSize:'22px', cursor:'pointer', padding:'4px', color:C.iconClr }}>📎</button>
            {showAttach && (
              <div onClick={e=>e.stopPropagation()} style={{ position:'absolute', bottom:'48px', left:0, background:C.attachBg, border:`1px solid ${C.attachBdr}`, borderRadius:'14px', boxShadow:'0 4px 20px rgba(0,0,0,0.15)', zIndex:200, overflow:'hidden', minWidth:'170px' }}>
                <label style={{ display:'flex', alignItems:'center', gap:'10px', padding:'11px 16px', cursor:'pointer', color:C.menuTxt, fontSize:'13px', fontWeight:'500' }}>
                  <span style={{ fontSize:'20px' }}>🖼️</span> Imagen
                  <input ref={imgRef} type="file" accept="image/*" onChange={sendImage} style={{ display:'none' }} />
                </label>
                <div style={{ height:'1px', background:C.divider }} />
                <label style={{ display:'flex', alignItems:'center', gap:'10px', padding:'11px 16px', cursor:'pointer', color:C.menuTxt, fontSize:'13px', fontWeight:'500' }}>
                  <span style={{ fontSize:'20px' }}>📄</span> Documento
                  <input ref={fileRef} type="file" onChange={sendFile} style={{ display:'none' }} />
                </label>
              </div>
            )}
          </div>

          <textarea ref={inputRef} rows={1} value={input} onChange={e=>setInput(e.target.value)} onKeyDown={handleKey} placeholder="Escribe un mensaje..."
            style={{ flex:1, background:C.inputBg, border:`1px solid ${C.inputBdr}`, borderRadius:'22px', padding:'9px 16px', fontSize:'14px', outline:'none', resize:'none', maxHeight:'120px', overflowY:'auto', lineHeight:'1.4', color:C.inputFld, transition:'background 0.3s, border 0.3s' }}
          />

          <button onClick={toggleRecording} title={recording?'Detener':'Grabar audio'}
            style={{ background:recording?'#ef4444':'none', border:'none', fontSize:'20px', cursor:'pointer', padding:'4px', borderRadius:'50%', flexShrink:0, color:recording?'#fff':C.iconClr, width:'36px', height:'36px', display:'flex', alignItems:'center', justifyContent:'center', animation:recording?'pulse 1s infinite':'none' }}
          >🎤</button>

          <button onClick={send} disabled={!input.trim()}
            style={{ background:input.trim()?C.header:(dark?'#2a3942':'#e2e8f0'), border:'none', borderRadius:'50%', width:'38px', height:'38px', display:'flex', alignItems:'center', justifyContent:'center', cursor:input.trim()?'pointer':'default', flexShrink:0, transition:'background 0.2s' }}
          >
            <svg width="16" height="16" fill="none" stroke={input.trim()?'#fff':(dark?'#4b5563':'#9ca3af')} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
              <line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>
            </svg>
          </button>
        </div>

      </div>

      <style>{`@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.5} }`}</style>
    </div>
  )
}