import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { db } from '../firebase'
import { collection, getDocs, query, where, addDoc, onSnapshot, updateDoc, deleteDoc, doc } from 'firebase/firestore'

/* ── helpers ──────────────────────────────────────────── */
const AVATAR_COLORS = ['#0f766e','#2563eb','#7c3aed','#d97706','#e11d48','#0891b2','#059669','#ea580c']
const avatarColor = email => AVATAR_COLORS[[...(email||'a')].reduce((a,c)=>a+c.charCodeAt(0),0) % AVATAR_COLORS.length]
const initials    = name  => (name||'?').split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase()

export default function Contactos() {
  const navigate = useNavigate()

  // ── Estado original ──────────────────────────────────────
  const [user,        setUser]        = useState(JSON.parse(localStorage.getItem('usuario') || '{}'))
  const [busqueda,    setBusqueda]    = useState('')
  const [resultado,   setResultado]   = useState(null)
  const [contactos,   setContactos]   = useState([])
  const [solicitudes, setSolicitudes] = useState([])
  const [noLeidos,    setNoLeidos]    = useState({})
  const [error,       setError]       = useState('')
  const [msg,         setMsg]         = useState('')

  // ── Estado nuevo (UI) ────────────────────────────────────
  const [dark,       setDark]       = useState(false)
  const [searchSide, setSearchSide] = useState('')       // filtro buscador sidebar
  const [selContact, setSelContact] = useState(null)     // contacto seleccionado (panel derecho, solo desktop)
  const [isMobile,   setIsMobile]   = useState(window.innerWidth < 1024)

  // ── dark mode ────────────────────────────────────────────
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

  // ── resize listener ──────────────────────────────────────
  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < 1024)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  // ── LÓGICA ORIGINAL sin cambios ──────────────────────────
  useEffect(() => {
    if (!user.email) { navigate('/login'); return }

    if (Notification.permission === 'default') Notification.requestPermission()

    const qUser = query(collection(db, 'usuarios'), where('email', '==', user.email))
    const unsubUser = onSnapshot(qUser, (snap) => {
      if (!snap.empty) {
        const data    = snap.docs[0].data()
        const updated = { ...user, foto: data.foto || null, name: data.name, descripcion: data.descripcion }
        setUser(updated)
        localStorage.setItem('usuario', JSON.stringify(updated))
      }
    })

    const updateOnline = async () => {
      const q    = query(collection(db, 'usuarios'), where('email', '==', user.email))
      const snap = await getDocs(q)
      if (!snap.empty) await updateDoc(doc(db, 'usuarios', snap.docs[0].id), { online: true })
    }
    updateOnline()

    const handleOffline = async () => {
      const q    = query(collection(db, 'usuarios'), where('email', '==', user.email))
      const snap = await getDocs(q)
      if (!snap.empty) await updateDoc(doc(db, 'usuarios', snap.docs[0].id), { online: false, lastSeen: new Date() })
    }

    // Visibilidad / foco: marcar offline al ocultar o perder foco, y online al volver
    const handleVisibilityChange = () => {
      if (document.hidden) handleOffline()
      else updateOnline()
    }

    const handleWindowBlur = () => { handleOffline() }
    const handleWindowFocus = () => { updateOnline() }

    window.addEventListener('beforeunload', handleOffline)
    document.addEventListener('visibilitychange', handleVisibilityChange)
    window.addEventListener('blur', handleWindowBlur)
    window.addEventListener('focus', handleWindowFocus)

    const notificarMensaje = (chatId, emailContacto, nombreContacto) => {
      const mq = query(collection(db, 'chats', chatId, 'mensajes'), where('leido', '==', false), where('email', '==', emailContacto))
      return onSnapshot(mq, (snap) => {
        if (snap.docChanges().some(change => change.type === 'added')) {
          new Audio('https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3').play().catch(() => {})
          if (Notification.permission === 'granted') {
            const cambio = snap.docChanges().find(c => c.type === 'added')
            const texto  = cambio?.doc.data().text || 'Nuevo mensaje'
            new Notification(`💬 ${nombreContacto}`, {
              body: texto.length > 50 ? texto.substring(0, 50) + '...' : texto,
              icon: '/favicon.ico'
            })
          }
        }
      })
    }

    const q1    = query(collection(db, 'contactos'), where('de', '==', user.email), where('estado', '==', 'aceptado'))
    const unsub1 = onSnapshot(q1, async (snap) => {
      const lista         = snap.docs.map(d => ({ id: d.id, ...d.data() }))
      const listaConEstado = await Promise.all(lista.map(async (c) => {
        const uq    = query(collection(db, 'usuarios'), where('email', '==', c.contactoEmail))
        const usnap = await getDocs(uq)
        if (!usnap.empty) {
          const udata = usnap.docs[0].data()
          return { ...c, online: udata.online || false, lastSeen: udata.lastSeen, foto: udata.foto || null }
        }
        return { ...c, online: false }
      }))
      setContactos(listaConEstado)

      listaConEstado.forEach(c => {
        const chatId = [user.email, c.contactoEmail].sort().join('_')
        notificarMensaje(chatId, c.contactoEmail, c.contactoNombre)
        const mq = query(collection(db, 'chats', chatId, 'mensajes'), where('leido', '==', false))
        onSnapshot(mq, (msnap) => {
          const noLeidosMios = msnap.docs.filter(d => d.data().email !== user.email).length
          setNoLeidos(prev => ({ ...prev, [c.contactoEmail]: noLeidosMios }))
        })
      })
    })

    const q2    = query(collection(db, 'contactos'), where('para', '==', user.email), where('estado', '==', 'pendiente'))
    const unsub2 = onSnapshot(q2, (snap) => setSolicitudes(snap.docs.map(d => ({ id: d.id, ...d.data() }))))

    return () => {
      unsub1(); unsub2(); unsubUser();
      window.removeEventListener('beforeunload', handleOffline)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      window.removeEventListener('blur', handleWindowBlur)
      window.removeEventListener('focus', handleWindowFocus)
    }
  }, [])

  // ── Acciones originales ──────────────────────────────────
  const buscar = async () => {
    setError(''); setResultado(null); setMsg('')
    if (!busqueda.trim()) return
    let snap = await getDocs(query(collection(db, 'usuarios'), where('email', '==', busqueda.trim())))
    if (snap.empty) snap = await getDocs(query(collection(db, 'usuarios'), where('name', '==', busqueda.trim())))
    if (snap.empty) { setError('Usuario no encontrado'); return }
    const found = snap.docs[0].data()
    if (found.email === user.email) { setError('Ese eres tú 😄'); return }
    setResultado(found)
  }

  const enviarSolicitud = async () => {
    const yaExiste = await getDocs(query(collection(db, 'contactos'), where('de', '==', user.email), where('para', '==', resultado.email)))
    if (!yaExiste.empty) { setMsg('Ya enviaste una solicitud'); return }
    await addDoc(collection(db, 'contactos'), {
      de: user.email, deNombre: user.name,
      para: resultado.email, paraNombre: resultado.name,
      contactoEmail: resultado.email, contactoNombre: resultado.name,
      estado: 'pendiente'
    })
    setMsg('¡Solicitud enviada!'); setResultado(null); setBusqueda('')
  }

  const aceptar = async (s) => {
    await updateDoc(doc(db, 'contactos', s.id), { estado: 'aceptado' })
    await addDoc(collection(db, 'contactos'), {
      de: user.email, deNombre: user.name,
      para: s.de, paraNombre: s.deNombre,
      contactoEmail: s.de, contactoNombre: s.deNombre,
      estado: 'aceptado'
    })
  }

  const rechazar = async (s) => updateDoc(doc(db, 'contactos', s.id), { estado: 'rechazado' })

  const eliminarContacto = async (c) => {
    if (!window.confirm(`¿Eliminar a ${c.contactoNombre}?`)) return
    await deleteDoc(doc(db, 'contactos', c.id))
    const q    = query(collection(db, 'contactos'), where('de', '==', c.contactoEmail), where('para', '==', user.email))
    const snap = await getDocs(q)
    snap.forEach(d => deleteDoc(doc(db, 'contactos', d.id)))
    if (selContact?.id === c.id) setSelContact(null)
  }

  const abrirChat = (c) => {
    const chatId = [user.email, c.contactoEmail].sort().join('_')
    navigate(`/chat/${chatId}`, { state: { contacto: c } })
  }

  const logout = async () => {
    const q    = query(collection(db, 'usuarios'), where('email', '==', user.email))
    const snap = await getDocs(q)
    if (!snap.empty) await updateDoc(doc(db, 'usuarios', snap.docs[0].id), { online: false, lastSeen: new Date() })
    localStorage.removeItem('usuario')
    navigate('/login')
  }

  const formatLastSeen = (lastSeen) => {
    if (!lastSeen) return ''
    const date = lastSeen.toDate ? lastSeen.toDate() : new Date(lastSeen)
    const diff = Math.floor((new Date() - date) / 60000)
    if (diff < 1)    return 'hace un momento'
    if (diff < 60)   return `hace ${diff} min`
    if (diff < 1440) return `hace ${Math.floor(diff / 60)}h`
    return `hace ${Math.floor(diff / 1440)}d`
  }

  // ── Colores según tema ───────────────────────────────────
  const C = {
    appBg:      dark ? '#111b21'  : '#e2e8f0',
    sidebarBg:  dark ? '#111b21'  : '#ffffff',
    sideBorder: dark ? 'rgba(255,255,255,0.06)' : '#e2e8f0',
    header:     '#0f766e',
    panelBg:    dark ? '#0b141a'  : '#f0ede8',
    cardBg:     dark ? '#1f2c34'  : '#ffffff',
    cardBdr:    dark ? 'rgba(255,255,255,0.06)' : '#e2e8f0',
    nameClr:    dark ? '#f1f5f9'  : '#1e293b',
    subClr:     dark ? '#64748b'  : '#94a3b8',
    onlineClr:  dark ? '#2dd4bf'  : '#0f766e',
    rowHover:   dark ? 'rgba(255,255,255,0.05)' : '#f8fafc',
    rowActive:  dark ? 'rgba(45,212,191,0.1)'   : '#f0fdf9',
    inputBg:    dark ? '#2a3942'  : '#f8fafc',
    inputBdr:   dark ? 'rgba(255,255,255,0.1)'  : '#e2e8f0',
    inputClr:   dark ? '#f1f5f9'  : '#1e293b',
    solBg:      dark ? '#2d2010'  : '#fffbeb',
    solBdr:     dark ? '#92400e'  : '#fcd34d',
    solTitle:   dark ? '#fbbf24'  : '#92400e',
    emptyClr:   dark ? '#64748b'  : '#94a3b8',
    btnGhost:   dark ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.2)',
    divider:    dark ? 'rgba(255,255,255,0.05)' : '#f1f5f9',
    emptyPanel: dark ? '#374151'  : '#cbd5e1',
  }

  const contactosFiltrados = contactos.filter(c =>
    c.contactoNombre?.toLowerCase().includes(searchSide.toLowerCase()) ||
    c.contactoEmail?.toLowerCase().includes(searchSide.toLowerCase())
  )

  // ── En móvil, si hay contacto seleccionado mostrar detalle ──
  // En móvil el flujo es: lista → (toca contacto) → abre chat directo
  // En desktop: lista izq + detalle der

  /* ════════════════════════════════════════════════════════
     SIDEBAR (lista de contactos)
  ════════════════════════════════════════════════════════ */
  const Sidebar = () => (
    <div style={{
      width: isMobile ? '100%' : '340px',
      flexShrink: 0,
      display: 'flex',
      flexDirection: 'column',
      background: C.sidebarBg,
      borderRight: isMobile ? 'none' : `1px solid ${C.sideBorder}`,
      height: '100%',
      overflow: 'hidden',
      transition: 'background 0.3s'
    }}>
      {/* Header */}
      <div style={{ background: C.header, padding: '12px 16px', display: 'flex', alignItems: 'center', gap: '10px', flexShrink: 0 }}>
        {user.foto ? (
          <img src={user.foto} alt="yo" style={{ width: '40px', height: '40px', borderRadius: '50%', objectFit: 'cover', border: '2px solid rgba(255,255,255,0.3)', flexShrink: 0 }} />
        ) : (
          <div style={{ width: '40px', height: '40px', borderRadius: '50%', background: 'rgba(255,255,255,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: '700', fontSize: '14px', flexShrink: 0 }}>
            {initials(user.name)}
          </div>
        )}
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ color: '#fff', fontWeight: '600', fontSize: '14px', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{user.name}</p>
          <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: '11px', margin: 0 }}>ChatApp</p>
        </div>
        <button onClick={() => navigate('/perfil')} title="Perfil" style={{ background: C.btnGhost, border: 'none', color: '#fff', borderRadius: '8px', width: '32px', height: '32px', fontSize: '14px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>👤</button>
        <button onClick={toggleDark} title="Tema" style={{ background: C.btnGhost, border: 'none', color: '#fff', borderRadius: '8px', width: '32px', height: '32px', fontSize: '14px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{dark ? '☀️' : '🌙'}</button>
        <button onClick={logout} style={{ background: C.btnGhost, border: 'none', color: '#fff', borderRadius: '8px', padding: '0 12px', height: '32px', fontSize: '12px', fontWeight: '500', cursor: 'pointer' }}>Salir</button>
      </div>

      {/* Buscador de contactos */}
      <div style={{ padding: '10px 12px', borderBottom: `1px solid ${C.sideBorder}`, flexShrink: 0 }}>
        <input
          type="text"
          value={searchSide}
          onChange={e => setSearchSide(e.target.value)}
          placeholder="Buscar en contactos..."
          style={{ width: '100%', background: C.inputBg, border: `1px solid ${C.inputBdr}`, borderRadius: '20px', padding: '8px 16px', fontSize: '13px', outline: 'none', color: C.inputClr, boxSizing: 'border-box' }}
        />
      </div>

      {/* Solicitudes */}
      {solicitudes.length > 0 && (
        <div style={{ margin: '8px 12px 0', borderRadius: '12px', padding: '12px', background: C.solBg, border: `1px solid ${C.solBdr}`, flexShrink: 0 }}>
          <p style={{ fontSize: '12px', fontWeight: '600', color: C.solTitle, margin: '0 0 8px' }}>🔔 Solicitudes ({solicitudes.length})</p>
          {solicitudes.map(s => (
            <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '4px 0' }}>
              <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: '#d97706', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: '700', fontSize: '12px', flexShrink: 0 }}>
                {initials(s.deNombre)}
              </div>
              <p style={{ flex: 1, fontSize: '13px', fontWeight: '600', color: C.nameClr, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.deNombre}</p>
              <button onClick={() => aceptar(s)} style={{ background: '#10b981', border: 'none', color: '#fff', borderRadius: '6px', width: '28px', height: '28px', fontSize: '13px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✓</button>
              <button onClick={() => rechazar(s)} style={{ background: '#ef4444', border: 'none', color: '#fff', borderRadius: '6px', width: '28px', height: '28px', fontSize: '13px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✗</button>
            </div>
          ))}
        </div>
      )}

      {/* Lista de contactos */}
      <div style={{ flex: 1, overflowY: 'auto', marginTop: '4px' }}>
        <p style={{ fontSize: '11px', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.05em', color: C.subClr, padding: '8px 16px 4px', margin: 0 }}>
          Mis contactos ({contactosFiltrados.length})
        </p>

        {contactosFiltrados.length === 0 && (
          <p style={{ textAlign: 'center', color: C.emptyClr, fontSize: '13px', padding: '24px 16px' }}>
            {searchSide ? 'Sin resultados' : 'No tienes contactos aún 👆'}
          </p>
        )}

        {contactosFiltrados.map(c => {
          const isActive = !isMobile && selContact?.id === c.id
          return (
            <div
              key={c.id}
              onClick={() => isMobile ? abrirChat(c) : setSelContact(c)}
              style={{
                display: 'flex', alignItems: 'center', gap: '12px',
                padding: '12px 16px', cursor: 'pointer',
                borderBottom: `1px solid ${C.divider}`,
                background: isActive ? C.rowActive : 'transparent',
                transition: 'background 0.15s'
              }}
              onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = C.rowHover }}
              onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = 'transparent' }}
            >
              {/* Avatar */}
              <div style={{ position: 'relative', flexShrink: 0 }}>
                {c.foto ? (
                  <img src={c.foto} alt={c.contactoNombre} style={{ width: '44px', height: '44px', borderRadius: '50%', objectFit: 'cover' }} />
                ) : (
                  <div style={{ width: '44px', height: '44px', borderRadius: '50%', background: avatarColor(c.contactoEmail), display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: '700', fontSize: '16px' }}>
                    {initials(c.contactoNombre)}
                  </div>
                )}
                <div style={{ position: 'absolute', bottom: '1px', right: '1px', width: '11px', height: '11px', borderRadius: '50%', background: c.online ? '#10b981' : '#94a3b8', border: `2px solid ${C.sidebarBg}` }} />
              </div>

              {/* Info */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '4px' }}>
                  <p style={{ margin: 0, fontSize: '14px', fontWeight: '600', color: C.nameClr, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {c.contactoNombre}
                  </p>
                  {noLeidos[c.contactoEmail] > 0 && (
                    <span style={{ background: '#0f766e', color: '#fff', borderRadius: '10px', minWidth: '20px', height: '20px', padding: '0 5px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: '700', flexShrink: 0 }}>
                      {noLeidos[c.contactoEmail]}
                    </span>
                  )}
                </div>
                <p style={{ margin: 0, fontSize: '12px', color: c.online ? C.onlineClr : C.subClr }}>
                  {c.online ? '● En línea' : `● ${formatLastSeen(c.lastSeen)}`}
                </p>
              </div>

              {/* Eliminar */}
              <button
                onClick={e => { e.stopPropagation(); eliminarContacto(c) }}
                style={{ background: 'none', border: 'none', fontSize: '16px', cursor: 'pointer', opacity: 0.3, padding: '4px', borderRadius: '6px', flexShrink: 0, transition: 'opacity 0.15s' }}
                onMouseEnter={e => e.currentTarget.style.opacity = '1'}
                onMouseLeave={e => e.currentTarget.style.opacity = '0.3'}
                title="Eliminar contacto"
              >🗑️</button>
            </div>
          )
        })}
      </div>

      {/* Agregar contacto */}
      <div style={{ padding: '10px 12px', borderTop: `1px solid ${C.sideBorder}`, flexShrink: 0 }}>
        <p style={{ fontSize: '11px', fontWeight: '600', textTransform: 'uppercase', color: C.subClr, margin: '0 0 8px' }}>Agregar contacto</p>
        <div style={{ display: 'flex', gap: '6px' }}>
          <input
            value={busqueda}
            onChange={e => { setBusqueda(e.target.value); setError(''); setMsg('') }}
            onKeyDown={e => e.key === 'Enter' && buscar()}
            placeholder="Nombre o correo..."
            style={{ flex: 1, background: C.inputBg, border: `1px solid ${C.inputBdr}`, borderRadius: '10px', padding: '8px 12px', fontSize: '13px', outline: 'none', color: C.inputClr }}
          />
          <button onClick={buscar} disabled={!busqueda.trim()} style={{ background: '#0f766e', color: '#fff', border: 'none', borderRadius: '10px', padding: '8px 14px', fontSize: '12px', fontWeight: '500', cursor: 'pointer', opacity: busqueda.trim() ? 1 : 0.5 }}>Buscar</button>
        </div>
        {error && <p style={{ color: '#f87171', fontSize: '12px', margin: '6px 0 0' }}>{error}</p>}
        {msg   && <p style={{ color: '#2dd4bf', fontSize: '12px', margin: '6px 0 0' }}>{msg}</p>}

        {/* Resultado búsqueda */}
        {resultado && (
          <div style={{ marginTop: '10px', background: C.inputBg, borderRadius: '10px', padding: '10px', display: 'flex', alignItems: 'center', gap: '10px' }}>
            {resultado.foto ? (
              <img src={resultado.foto} alt="foto" style={{ width: '36px', height: '36px', borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
            ) : (
              <div style={{ width: '36px', height: '36px', borderRadius: '50%', background: avatarColor(resultado.email), display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: '700', fontSize: '13px', flexShrink: 0 }}>
                {initials(resultado.name)}
              </div>
            )}
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ margin: 0, fontSize: '13px', fontWeight: '600', color: C.nameClr }}>{resultado.name}</p>
              <p style={{ margin: 0, fontSize: '11px', color: C.subClr, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{resultado.email}</p>
            </div>
            <button onClick={enviarSolicitud} style={{ background: '#0f766e', color: '#fff', border: 'none', borderRadius: '8px', padding: '6px 12px', fontSize: '12px', cursor: 'pointer', flexShrink: 0 }}>+ Agregar</button>
          </div>
        )}
      </div>
    </div>
  )

  /* ════════════════════════════════════════════════════════
     PANEL DERECHO (solo desktop — detalle del contacto)
  ════════════════════════════════════════════════════════ */
  const PanelDerecho = () => (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: C.panelBg, transition: 'background 0.3s', overflow: 'hidden' }}>
      {!selContact ? (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '12px' }}>
          <div style={{ fontSize: '64px', opacity: 0.08 }}>👥</div>
          <p style={{ fontSize: '14px', color: C.emptyPanel, margin: 0 }}>Selecciona un contacto</p>
        </div>
      ) : (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '48px 32px 32px', gap: '16px', overflowY: 'auto' }}>
          {/* Foto grande */}
          {selContact.foto ? (
            <img src={selContact.foto} alt={selContact.contactoNombre} style={{ width: '112px', height: '112px', borderRadius: '50%', objectFit: 'cover', border: '4px solid rgba(15,118,110,0.3)' }} />
          ) : (
            <div style={{ width: '112px', height: '112px', borderRadius: '50%', background: avatarColor(selContact.contactoEmail), display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: '700', fontSize: '36px', border: '4px solid rgba(15,118,110,0.2)' }}>
              {initials(selContact.contactoNombre)}
            </div>
          )}

          <div style={{ textAlign: 'center' }}>
            <p style={{ fontSize: '20px', fontWeight: '700', color: C.nameClr, margin: '0 0 4px' }}>{selContact.contactoNombre}</p>
            <p style={{ fontSize: '13px', color: C.subClr, margin: 0 }}>{selContact.contactoEmail}</p>
          </div>

          <span style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', color: selContact.online ? C.onlineClr : C.subClr }}>
            <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: selContact.online ? '#10b981' : '#94a3b8', display: 'inline-block' }} />
            {selContact.online ? 'En línea' : formatLastSeen(selContact.lastSeen)}
          </span>

          {noLeidos[selContact.contactoEmail] > 0 && (
            <div style={{ background: dark ? 'rgba(15,118,110,0.2)' : '#f0fdf9', borderRadius: '12px', padding: '10px 20px' }}>
              <p style={{ color: C.onlineClr, fontWeight: '600', fontSize: '14px', margin: 0 }}>
                {noLeidos[selContact.contactoEmail]} mensaje(s) sin leer
              </p>
            </div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', width: '100%', maxWidth: '280px', marginTop: '8px' }}>
            <button onClick={() => abrirChat(selContact)} style={{ width: '100%', background: '#0f766e', color: '#fff', border: 'none', borderRadius: '12px', padding: '14px', fontSize: '14px', fontWeight: '600', cursor: 'pointer' }}>
              💬 Abrir chat
            </button>
            <button onClick={() => eliminarContacto(selContact)} style={{ width: '100%', background: '#ef4444', color: '#fff', border: 'none', borderRadius: '12px', padding: '14px', fontSize: '14px', fontWeight: '600', cursor: 'pointer' }}>
              🗑️ Eliminar contacto
            </button>
          </div>
        </div>
      )}
    </div>
  )

  /* ════════════════════════════════════════════════════════
     RENDER PRINCIPAL
  ════════════════════════════════════════════════════════ */
  return (
    <div style={{ width: '100%', height: '100vh', background: C.appBg, display: 'flex', alignItems: isMobile ? 'flex-start' : 'center', justifyContent: 'center', transition: 'background 0.3s' }}>
      <div style={{
        width: '100%',
        height: isMobile ? '100vh' : 'calc(100vh - 32px)',
        maxWidth: isMobile ? '100%' : '1100px',
        display: 'flex',
        borderRadius: isMobile ? '0' : '20px',
        overflow: 'hidden',
        boxShadow: isMobile ? 'none' : '0 8px 48px rgba(0,0,0,0.2)',
      }}>
        {/* En móvil solo sidebar. En desktop sidebar + panel */}
        <Sidebar />
        {!isMobile && <PanelDerecho />}
      </div>
    </div>
  )
}