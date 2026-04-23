import { useState, useEffect, useRef } from 'react'
import { useNavigate, useParams, useLocation } from 'react-router-dom'
import { db } from '../firebase'
import { collection, addDoc, onSnapshot, orderBy, query, serverTimestamp, updateDoc, deleteDoc, doc, getDocs, where } from 'firebase/firestore'
import EmojiPicker from 'emoji-picker-react'

export default function Chat() {
  const navigate = useNavigate()
  const { chatId } = useParams()
  const location = useLocation()
  const contacto = location.state?.contacto
  const user = JSON.parse(localStorage.getItem("usuario") || "{}")
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [contactoInfo, setContactoInfo] = useState(null)
  const [showEmoji, setShowEmoji] = useState(false)
  const [menuMsg, setMenuMsg] = useState(null)
  const [reacting, setReacting] = useState(null)
  const bottomRef = useRef(null)
  const inputRef = useRef(null)
  const prevMsgCount = useRef(0)

  useEffect(() => {
    if (!user.email) { navigate('/login'); return }
    if (!chatId) { navigate('/contactos'); return }
    if (contacto?.contactoEmail) {
      const q = query(collection(db, 'usuarios'), where('email', '==', contacto.contactoEmail))
      const unsub = onSnapshot(q, (snap) => {
        if (!snap.empty) setContactoInfo(snap.docs[0].data())
      })
      return () => unsub()
    }
  }, [chatId])

  useEffect(() => {
    if (!chatId) return
    const q = query(collection(db, 'chats', chatId, 'mensajes'), orderBy('createdAt'))
    const unsub = onSnapshot(q, async (snap) => {
      const msgs = snap.docs.map(d => ({ id: d.id, ...d.data() }))
setMessages(msgs)

// Sonido cuando llega mensaje nuevo del otro
if (msgs.length > prevMsgCount.current) {
  const ultimo = msgs[msgs.length - 1]
  if (ultimo?.email !== user.email && prevMsgCount.current > 0) {
    const audio = new Audio('https://assets.mixkit.co/active_storage/sfx/2354/2354-preview.mp3')
    audio.volume = 0.5
    audio.play().catch(() => {})
  }
  prevMsgCount.current = msgs.length
}
      snap.docs.forEach(async (d) => {
        const data = d.data()
        if (data.email !== user.email && !data.leido) {
          await updateDoc(doc(db, 'chats', chatId, 'mensajes', d.id), { leido: true })
        }
      })
    })
    return () => unsub()
  }, [chatId])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const send = async () => {
    if (!input.trim()) return
    const text = input.trim()
    setInput('')
    setShowEmoji(false)
    await addDoc(collection(db, 'chats', chatId, 'mensajes'), {
      text, user: user.name, email: user.email,
      createdAt: serverTimestamp(), leido: false, tipo: 'texto'
    })
  }

  const handleKey = (e) => { if (e.key === 'Enter') send() }

  const onEmojiClick = (emojiData) => {
    setInput(prev => prev + emojiData.emoji)
    inputRef.current?.focus()
  }

  const sendImage = async (e) => {
    const file = e.target.files[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = async (ev) => {
      await addDoc(collection(db, 'chats', chatId, 'mensajes'), {
        text: ev.target.result, user: user.name, email: user.email,
        createdAt: serverTimestamp(), leido: false, tipo: 'imagen',
        fileName: file.name
      })
    }
    reader.readAsDataURL(file)
  }

  const sendFile = async (e) => {
    const file = e.target.files[0]
    if (!file) return
    await addDoc(collection(db, 'chats', chatId, 'mensajes'), {
      text: `📄 ${file.name}`, user: user.name, email: user.email,
      createdAt: serverTimestamp(), leido: false, tipo: 'archivo',
      fileName: file.name
    })
  }

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const recorder = new MediaRecorder(stream)
      const chunks = []
      recorder.ondataavailable = e => chunks.push(e.data)
      recorder.onstop = async () => {
        const blob = new Blob(chunks, { type: 'audio/webm' })
        const reader = new FileReader()
        reader.onload = async (ev) => {
          await addDoc(collection(db, 'chats', chatId, 'mensajes'), {
            text: ev.target.result, user: user.name, email: user.email,
            createdAt: serverTimestamp(), leido: false, tipo: 'audio'
          })
        }
        reader.readAsDataURL(blob)
        stream.getTracks().forEach(t => t.stop())
      }
      recorder.start()
      setTimeout(() => recorder.stop(), 30000) // max 30 seg
      window._recorder = recorder
    } catch (err) {
      alert('No se pudo acceder al micrófono')
    }
  }

  const stopRecording = () => {
    if (window._recorder) {
      window._recorder.stop()
      window._recorder = null
    }
  }

  const deleteMsg = async (msgId) => {
    await deleteDoc(doc(db, 'chats', chatId, 'mensajes', msgId))
    setMenuMsg(null)
  }

  const clearChat = async () => {
    if (!window.confirm('¿Vaciar todo el chat?')) return
    const snap = await getDocs(collection(db, 'chats', chatId, 'mensajes'))
    snap.forEach(d => deleteDoc(doc(db, 'chats', chatId, 'mensajes', d.id)))
  }

  const reactMsg = async (msgId, emoji) => {
    await updateDoc(doc(db, 'chats', chatId, 'mensajes', msgId), {
      reaccion: emoji
    })
    setReacting(null)
  }

  const formatLastSeen = (lastSeen) => {
    if (!lastSeen) return ''
    const date = lastSeen.toDate ? lastSeen.toDate() : new Date(lastSeen)
    const now = new Date()
    const diff = Math.floor((now - date) / 60000)
    if (diff < 1) return 'hace un momento'
    if (diff < 60) return `hace ${diff} min`
    if (diff < 1440) return `hace ${Math.floor(diff / 60)}h`
    return date.toLocaleDateString()
  }

  const formatTime = (createdAt) => {
    if (!createdAt) return ''
    const date = createdAt.toDate ? createdAt.toDate() : new Date(createdAt)
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  }

  const [recording, setRecording] = useState(false)

  const toggleRecording = async () => {
    if (!recording) {
      await startRecording()
      setRecording(true)
    } else {
      stopRecording()
      setRecording(false)
    }
  }

  return (
    <div onClick={() => { setMenuMsg(null); setReacting(null); setShowEmoji(false) }}
      style={{ height: '100vh', background: '#f3f4f6', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '16px', boxSizing: 'border-box' }}>
      <div style={{ width: '100%', maxWidth: '480px', background: 'white', borderRadius: '16px', overflow: 'hidden', border: '1px solid #e5e7eb', boxShadow: '0 4px 24px rgba(0,0,0,0.08)', display: 'flex', flexDirection: 'column', height: '100%', maxHeight: '680px', boxSizing: 'border-box' }}>

        {/* Header */}
        <div style={{ background: '#830000', padding: '14px 18px', display: 'flex', alignItems: 'center', gap: '10px', flexShrink: 0 }}>
          <button onClick={() => navigate('/contactos')} style={{ background: 'rgba(255,255,255,0.15)', border: 'none', color: 'white', borderRadius: '8px', padding: '6px 10px', fontSize: '16px', cursor: 'pointer' }}>←</button>
          <div style={{ position: 'relative' }}>
            <div style={{ width: '38px', height: '38px', background: 'rgba(255,255,255,0.2)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontWeight: '700', fontSize: '16px' }}>
              {(contacto?.contactoNombre || '?')[0].toUpperCase()}
            </div>
            <div style={{ position: 'absolute', bottom: '1px', right: '1px', width: '10px', height: '10px', borderRadius: '50%', background: contactoInfo?.online ? '#10b981' : '#9ca3af', border: '2px solid #830000' }} />
          </div>
          <div style={{ flex: 1 }}>
            <p style={{ color: 'white', fontWeight: '600', fontSize: '14px', margin: 0 }}>{contacto?.contactoNombre || 'Chat'}</p>
            <p style={{ color: 'rgba(255,255,255,0.8)', fontSize: '11px', margin: 0 }}>
              {contactoInfo?.online ? '● En línea' : `● Última vez ${formatLastSeen(contactoInfo?.lastSeen)}`}
            </p>
          </div>
          <button onClick={clearChat} title="Vaciar chat" style={{ background: 'rgba(255,255,255,0.15)', border: 'none', color: 'white', borderRadius: '8px', padding: '6px 10px', fontSize: '14px', cursor: 'pointer' }}>🧹</button>
        </div>

        {/* Mensajes */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px', display: 'flex', flexDirection: 'column', gap: '8px', background: '#f9fafb', minHeight: 0 }}>
          {messages.length === 0 && (
            <p style={{ textAlign: 'center', color: '#9ca3af', fontSize: '13px', marginTop: '20px' }}>No hay mensajes aún. ¡Di hola! 👋</p>
          )}
          {messages.map((m) => {
            const isMe = m.email === user.email
            return (
              <div key={m.id} style={{ display: 'flex', flexDirection: 'column', alignItems: isMe ? 'flex-end' : 'flex-start', flexShrink: 0, position: 'relative' }}>
                <div
                  onContextMenu={(e) => { e.preventDefault(); setMenuMsg(m.id); setReacting(null) }}
                  style={{ maxWidth: '70%', padding: '9px 13px', borderRadius: isMe ? '16px 16px 4px 16px' : '16px 16px 16px 4px', background: isMe ? '#830000' : 'white', color: isMe ? 'white' : '#1f2937', fontSize: '14px', lineHeight: '1.4', boxShadow: '0 1px 2px rgba(0,0,0,0.1)', wordBreak: 'break-word', whiteSpace: 'pre-wrap', overflowWrap: 'break-word', cursor: 'context-menu' }}>

                  {m.tipo === 'imagen' ? (
                    <img src={m.text} alt="img" style={{ maxWidth: '100%', borderRadius: '8px', display: 'block' }} />
                  ) : m.tipo === 'audio' ? (
                    <audio controls src={m.text} style={{ maxWidth: '100%' }} />
                  ) : (
                    <span>{m.text}</span>
                  )}

                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '4px', marginTop: '4px' }}>
                    <span style={{ fontSize: '10px', color: isMe ? 'rgba(255,255,255,0.7)' : '#9ca3af' }}>{formatTime(m.createdAt)}</span>
                    {isMe && <span style={{ fontSize: '10px', color: m.leido ? '#fbbf24' : 'rgba(255,255,255,0.5)' }}>{m.leido ? '✓✓' : '✓'}</span>}
                  </div>
                </div>

                {/* Reacción */}
                {m.reaccion && (
                  <span style={{ fontSize: '16px', marginTop: '2px' }}>{m.reaccion}</span>
                )}

                {/* Menú contextual */}
                {menuMsg === m.id && (
                  <div onClick={e => e.stopPropagation()} style={{ position: 'absolute', [isMe ? 'right' : 'left']: '0', top: '100%', background: 'white', borderRadius: '10px', boxShadow: '0 4px 16px rgba(0,0,0,0.15)', zIndex: 100, minWidth: '160px', overflow: 'hidden' }}>
                    <button onClick={() => { setReacting(m.id); setMenuMsg(null) }}
                      style={{ width: '100%', padding: '10px 16px', border: 'none', background: 'none', textAlign: 'left', fontSize: '13px', cursor: 'pointer', display: 'flex', gap: '8px' }}>
                      😊 Reaccionar
                    </button>
                    {isMe && (
                      <button onClick={() => deleteMsg(m.id)}
                        style={{ width: '100%', padding: '10px 16px', border: 'none', background: 'none', textAlign: 'left', fontSize: '13px', cursor: 'pointer', color: '#ef4444', display: 'flex', gap: '8px' }}>
                        🗑️ Eliminar mensaje
                      </button>
                    )}
                  </div>
                )}

                {/* Picker de reacción */}
                {reacting === m.id && (
                  <div onClick={e => e.stopPropagation()} style={{ position: 'absolute', [isMe ? 'right' : 'left']: '0', top: '100%', zIndex: 100, display: 'flex', gap: '6px', background: 'white', borderRadius: '20px', padding: '6px 10px', boxShadow: '0 4px 16px rgba(0,0,0,0.15)' }}>
                    {['❤️', '😂', '👍', '😮', '😢', '🔥'].map(e => (
                      <span key={e} onClick={() => reactMsg(m.id, e)} style={{ fontSize: '20px', cursor: 'pointer' }}>{e}</span>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
          <div ref={bottomRef} />
        </div>

        {/* Emoji picker */}
        {showEmoji && (
          <div onClick={e => e.stopPropagation()} style={{ position: 'absolute', bottom: '80px', left: '50%', transform: 'translateX(-50%)', zIndex: 200 }}>
            <EmojiPicker onEmojiClick={onEmojiClick} height={350} width={300} />
          </div>
        )}

        {/* Input */}
        <div style={{ padding: '10px 14px', borderTop: '1px solid #e5e7eb', display: 'flex', gap: '6px', alignItems: 'center', background: 'white', flexShrink: 0 }}>

          {/* Emoji */}
          <button onClick={e => { e.stopPropagation(); setShowEmoji(p => !p) }}
            style={{ background: 'none', border: 'none', fontSize: '20px', cursor: 'pointer', padding: '4px' }}>😊</button>

          {/* Imagen */}
          <label style={{ cursor: 'pointer', fontSize: '20px', padding: '4px' }}>
            📷 <input type="file" accept="image/*" onChange={sendImage} style={{ display: 'none' }} />
          </label>

          {/* Archivo */}
          <label style={{ cursor: 'pointer', fontSize: '20px', padding: '4px' }}>
            📎 <input type="file" onChange={sendFile} style={{ display: 'none' }} />
          </label>

          {/* Input texto */}
          <input
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKey}
            placeholder="Escribe un mensaje..."
            style={{ flex: 1, background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: '20px', padding: '9px 16px', fontSize: '14px', outline: 'none' }}
          />

          {/* Audio */}
          <button onClick={toggleRecording}
            style={{ background: recording ? '#ef4444' : 'none', border: 'none', fontSize: '20px', cursor: 'pointer', padding: '4px', borderRadius: '50%' }}>
            🎤
          </button>

          {/* Enviar */}
          <button onClick={send} style={{ background: '#830000', border: 'none', borderRadius: '50%', width: '38px', height: '38px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}>
            <svg width="16" height="16" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
              <line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>
            </svg>
          </button>
        </div>

      </div>
    </div>
  )
}