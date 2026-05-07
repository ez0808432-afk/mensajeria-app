import { useState, useEffect, useRef } from 'react'
import { useNavigate, useParams, useLocation } from 'react-router-dom'
import { db } from '../firebase'
import {
  collection, addDoc, onSnapshot, orderBy, query,
  serverTimestamp, updateDoc, deleteDoc, doc, where
} from 'firebase/firestore'
import EmojiPicker from 'emoji-picker-react'

/* ─── helpers ─────────────────────────────────────────── */
function formatTime(ts) {
  if (!ts) return ''
  const d = ts.toDate ? ts.toDate() : new Date(ts)
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

/* ─── THEME TOKENS  (cambia aquí para recolorear todo) ── */
const THEME = {
  light: {
    bg:          'bg-slate-100',
    sidebar:     'bg-white',
    header:      'bg-teal-700',
    headerText:  'text-white',
    msgOut:      'bg-teal-600 text-white',
    msgIn:       'bg-white text-gray-800',
    input:       'bg-white',
    inputBorder: 'border-slate-200',
    send:        'bg-teal-600 hover:bg-teal-700 text-white',
    timeOut:     'text-teal-100',
    timeIn:      'text-gray-400',
    empty:       'text-gray-400',
    chatBg:      'bg-slate-100',
  },
  dark: {
    bg:          'bg-[#111b21]',
    sidebar:     'bg-[#1f2c34]',
    header:      'bg-[#202c33]',
    headerText:  'text-gray-100',
    msgOut:      'bg-[#005c4b] text-gray-100',
    msgIn:       'bg-[#1f2c34] text-gray-100',
    input:       'bg-[#1f2c34]',
    inputBorder: 'border-[#2a373f]',
    send:        'bg-teal-600 hover:bg-teal-500 text-white',
    timeOut:     'text-teal-200/70',
    timeIn:      'text-gray-400',
    empty:       'text-gray-500',
    chatBg:      'bg-[#0b141a]',
  }
}

export default function Chat() {
  const navigate    = useNavigate()
  const { chatId }  = useParams()
  const location    = useLocation()
  const contacto    = location.state?.contacto
  const user        = JSON.parse(localStorage.getItem('usuario') || '{}')

  const [messages,     setMessages]     = useState([])
  const [input,        setInput]        = useState('')
  const [contactoInfo, setContactoInfo] = useState(null)
  const [showEmoji,    setShowEmoji]    = useState(false)
  const [menuMsg,      setMenuMsg]      = useState(null)
  const [reacting,     setReacting]     = useState(null)
  const [dark,         setDark]         = useState(false)

  const bottomRef      = useRef(null)
  const inputRef       = useRef(null)
  const prevMsgCount   = useRef(0)

  const t = dark ? THEME.dark : THEME.light   // token shortcut

  /* ── dark mode persistence ─────────────────────────── */
  useEffect(() => {
    const saved = localStorage.getItem('theme')
    const isDark = saved === 'dark'
    setDark(isDark)
  }, [])

  useEffect(() => {
    localStorage.setItem('theme', dark ? 'dark' : 'light')
  }, [dark])

  /* ── auth guard ─────────────────────────────────────── */
  useEffect(() => {
    if (!user.email)  { navigate('/login');    return }
    if (!chatId)      { navigate('/contactos'); return }
    if (contacto?.contactoEmail) {
      const q = query(collection(db, 'usuarios'), where('email', '==', contacto.contactoEmail))
      const unsub = onSnapshot(q, snap => {
        if (!snap.empty) setContactoInfo(snap.docs[0].data())
      })
      return () => unsub()
    }
  }, [chatId])

  /* ── messages listener ──────────────────────────────── */
  useEffect(() => {
    if (!chatId) return
    const q = query(collection(db, 'chats', chatId, 'mensajes'), orderBy('createdAt'))
    const unsub = onSnapshot(q, async snap => {
      const msgs = snap.docs.map(d => ({ id: d.id, ...d.data() }))
      setMessages(msgs)

      if (msgs.length > prevMsgCount.current) {
        const ultimo = msgs[msgs.length - 1]
        if (ultimo?.email !== user.email && prevMsgCount.current > 0) {
          const audio = new Audio('https://assets.mixkit.co/active_storage/sfx/2354/2354-preview.mp3')
          audio.volume = 0.4
          audio.play().catch(() => {})
        }
        prevMsgCount.current = msgs.length
      }

      snap.docs.forEach(async d => {
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

  /* ── actions ────────────────────────────────────────── */
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

  const handleKey = e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }

  const onEmojiClick = emojiData => {
    setInput(prev => prev + emojiData.emoji)
    inputRef.current?.focus()
  }

  const deleteMsg = async id => {
    setMenuMsg(null)
    await deleteDoc(doc(db, 'chats', chatId, 'mensajes', id))
  }

  const reactMsg = async (id, emoji) => {
    setReacting(null)
    await updateDoc(doc(db, 'chats', chatId, 'mensajes', id), { reaccion: emoji })
  }

  /* ── avatar initials ─────────────────────────────────── */
  const initials = name => (name || '?').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()

  /* ═══════════════════════════════════════════════════════
     RENDER
  ═══════════════════════════════════════════════════════ */
  return (
    <div
      className={`min-h-screen w-full ${t.bg} flex items-center justify-center transition-colors duration-300`}
      onClick={() => { setMenuMsg(null); setReacting(null); setShowEmoji(false) }}
    >
      {/*
        ┌──────────────────────────────────────────────────┐
        │  CONTENEDOR PRINCIPAL                            │
        │  móvil  → pantalla completa                      │
        │  tablet → tarjeta centrada (max 520px)           │
        │  laptop → layout de dos columnas (sidebar+chat)  │
        └──────────────────────────────────────────────────┘
      */}
      <div className={`
        w-full h-screen flex overflow-hidden
        md:h-[90vh] md:max-w-[520px] md:rounded-2xl md:shadow-2xl md:border md:border-black/10
        lg:max-w-[960px] lg:h-[90vh]
        ${dark ? 'md:border-white/5' : ''}
        transition-colors duration-300
      `}>

        {/* ── SIDEBAR (visible solo en laptop ≥1024px) ─── */}
        <aside className={`
          hidden lg:flex flex-col w-[360px] flex-shrink-0
          ${t.sidebar} border-r ${dark ? 'border-white/5' : 'border-slate-200'}
          transition-colors duration-300
        `}>
          {/* Header sidebar */}
          <div className={`${t.header} px-4 py-3 flex items-center justify-between`}>
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-full bg-teal-400/30 flex items-center justify-center text-white font-bold text-sm">
                {initials(user.name)}
              </div>
              <span className={`${t.headerText} font-semibold text-sm`}>{user.name}</span>
            </div>
            <button
              onClick={e => { e.stopPropagation(); setDark(p => !p) }}
              className="text-white/70 hover:text-white text-lg transition-colors"
              title="Cambiar tema"
            >
              {dark ? '☀️' : '🌙'}
            </button>
          </div>

          {/* Contacto activo en sidebar */}
          <div className={`flex-1 flex flex-col items-center justify-center gap-3 ${t.chatBg} transition-colors duration-300`}>
            <div className="w-20 h-20 rounded-full bg-teal-500/20 flex items-center justify-center text-3xl font-bold text-teal-500">
              {initials(contacto?.contactoNombre)}
            </div>
            <p className={`font-semibold text-lg ${dark ? 'text-gray-100' : 'text-gray-800'}`}>
              {contacto?.contactoNombre || 'Contacto'}
            </p>
            <p className="text-xs text-gray-400">{contacto?.contactoEmail || ''}</p>
            {contactoInfo?.online && (
              <span className="text-xs text-teal-400 flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-teal-400 inline-block" />
                En línea
              </span>
            )}
            <button
              onClick={() => navigate('/contactos')}
              className={`mt-4 px-4 py-1.5 rounded-lg text-sm ${dark ? 'bg-white/10 text-gray-300 hover:bg-white/20' : 'bg-slate-100 text-gray-600 hover:bg-slate-200'} transition-colors`}
            >
              ← Contactos
            </button>
          </div>
        </aside>

        {/* ── PANEL CHAT ──────────────────────────────────── */}
        <div className={`flex-1 flex flex-col overflow-hidden ${dark ? 'bg-[#111b21]' : 'bg-white'} transition-colors duration-300`}>

          {/* Header del chat */}
          <div className={`${t.header} px-4 py-3 flex items-center gap-3 flex-shrink-0 transition-colors duration-300`}>

            {/* Botón atrás (oculto en lg, visible en móvil/tablet) */}
            <button
              onClick={() => navigate('/contactos')}
              className="lg:hidden text-white/80 hover:text-white text-xl leading-none"
            >
              ←
            </button>

            {/* Avatar del contacto */}
            <div className="w-9 h-9 rounded-full bg-teal-400/25 flex items-center justify-center text-white font-bold text-sm flex-shrink-0">
              {initials(contacto?.contactoNombre)}
            </div>

            <div className="flex-1 min-w-0">
              <p className={`${t.headerText} font-semibold text-sm truncate`}>
                {contacto?.contactoNombre || 'Chat'}
              </p>
              {contactoInfo?.online && (
                <p className="text-teal-200 text-xs">En línea</p>
              )}
            </div>

            {/* Dark toggle (móvil/tablet) */}
            <button
              onClick={e => { e.stopPropagation(); setDark(p => !p) }}
              className="lg:hidden text-white/70 hover:text-white text-lg transition-colors"
            >
              {dark ? '☀️' : '🌙'}
            </button>
          </div>

          {/* ── Mensajes ──────────────────────────────────── */}
          <div className={`flex-1 overflow-y-auto px-4 py-3 flex flex-col gap-1.5 ${t.chatBg} transition-colors duration-300`}>

            {messages.length === 0 && (
              <p className={`text-center ${t.empty} text-sm mt-8 select-none`}>
                No hay mensajes aún. ¡Di hola! 👋
              </p>
            )}

            {messages.map(m => {
              const isMe = m.email === user.email
              return (
                <div
                  key={m.id}
                  className={`flex flex-col ${isMe ? 'items-end' : 'items-start'} relative`}
                >
                  {/* Burbuja */}
                  <div
                    onContextMenu={e => {
                      e.preventDefault()
                      setMenuMsg(m.id)
                      setReacting(null)
                    }}
                    className={`
                      max-w-[75%] sm:max-w-[65%] px-3 py-2 text-sm shadow-sm
                      break-words whitespace-pre-wrap cursor-default select-text
                      transition-colors duration-300
                      ${isMe
                        ? `${t.msgOut} rounded-[16px_4px_16px_16px]`
                        : `${t.msgIn} rounded-[4px_16px_16px_16px]`
                      }
                    `}
                  >
                    {m.tipo === 'imagen' ? (
                      <img src={m.text} alt="imagen" className="max-w-full rounded-lg" />
                    ) : m.tipo === 'audio' ? (
                      <audio controls src={m.text} className="max-w-full" />
                    ) : (
                      <span>{m.text}</span>
                    )}

                    <div className={`flex justify-end items-center gap-1 mt-1 text-[10px] ${isMe ? t.timeOut : t.timeIn}`}>
                      <span>{formatTime(m.createdAt)}</span>
                      {isMe && (
                        <span className={m.leido ? 'text-teal-300' : 'opacity-50'}>
                          {m.leido ? '✓✓' : '✓'}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Reacción */}
                  {m.reaccion && (
                    <span className="text-base mt-0.5 select-none">{m.reaccion}</span>
                  )}

                  {/* Menú contextual */}
                  {menuMsg === m.id && (
                    <div
                      onClick={e => e.stopPropagation()}
                      className={`
                        absolute top-full mt-1 rounded-xl shadow-xl z-50 min-w-[160px] overflow-hidden
                        ${dark ? 'bg-[#233138] border border-white/5' : 'bg-white border border-slate-100'}
                      `}
                    >
                      <button
                        onClick={() => { setReacting(m.id); setMenuMsg(null) }}
                        className={`w-full text-left px-4 py-2.5 text-sm ${dark ? 'hover:bg-white/5 text-gray-200' : 'hover:bg-slate-50 text-gray-700'}`}
                      >
                        😊 Reaccionar
                      </button>
                      {isMe && (
                        <button
                          onClick={() => deleteMsg(m.id)}
                          className={`w-full text-left px-4 py-2.5 text-sm text-red-400 ${dark ? 'hover:bg-white/5' : 'hover:bg-slate-50'}`}
                        >
                          🗑️ Eliminar
                        </button>
                      )}
                    </div>
                  )}

                  {/* Picker de reacciones */}
                  {reacting === m.id && (
                    <div
                      onClick={e => e.stopPropagation()}
                      className={`
                        absolute top-full mt-1 flex gap-2 px-3 py-1.5 rounded-full shadow-lg z-50
                        ${dark ? 'bg-[#233138] border border-white/5' : 'bg-white border border-slate-100'}
                      `}
                    >
                      {['❤️','😂','👍','😮','😢','🔥'].map(e => (
                        <span
                          key={e}
                          onClick={() => reactMsg(m.id, e)}
                          className="cursor-pointer text-lg hover:scale-125 transition-transform"
                        >
                          {e}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}

            <div ref={bottomRef} />
          </div>

          {/* ── Input area ────────────────────────────────── */}
          <div
            className={`flex-shrink-0 px-3 py-2 flex items-end gap-2
              ${dark ? 'bg-[#1f2c34] border-t border-white/5' : 'bg-slate-50 border-t border-slate-200'}
              transition-colors duration-300
            `}
            onClick={e => e.stopPropagation()}
          >
            {/* Emoji toggle */}
            <button
              onClick={() => setShowEmoji(p => !p)}
              className={`flex-shrink-0 w-9 h-9 flex items-center justify-center rounded-full text-xl
                ${dark ? 'hover:bg-white/10 text-gray-400' : 'hover:bg-slate-200 text-gray-500'}
                transition-colors`}
            >
              😊
            </button>

            {/* Picker */}
            {showEmoji && (
              <div className="absolute bottom-16 left-3 z-50">
                <EmojiPicker
                  onEmojiClick={onEmojiClick}
                  theme={dark ? 'dark' : 'light'}
                  height={360}
                  width={300}
                />
              </div>
            )}

            {/* Textarea */}
            <textarea
              ref={inputRef}
              rows={1}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKey}
              placeholder="Escribe un mensaje..."
              className={`
                flex-1 resize-none rounded-2xl px-4 py-2.5 text-sm outline-none
                max-h-32 overflow-y-auto leading-relaxed
                ${dark
                  ? 'bg-[#2a3942] text-gray-100 placeholder-gray-500'
                  : 'bg-white text-gray-800 placeholder-gray-400 border border-slate-200'
                }
                transition-colors duration-300
              `}
            />

            {/* Send */}
            <button
              onClick={send}
              disabled={!input.trim()}
              className={`
                flex-shrink-0 w-9 h-9 flex items-center justify-center rounded-full text-base
                ${t.send} disabled:opacity-40 disabled:cursor-not-allowed
                transition-all duration-150 active:scale-95
              `}
            >
              ➤
            </button>
          </div>

        </div>{/* fin panel chat */}
      </div>{/* fin contenedor principal */}
    </div>
  )
}
