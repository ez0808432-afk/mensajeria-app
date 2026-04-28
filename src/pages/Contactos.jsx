import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { db } from '../firebase'
import { collection, getDocs, query, where, addDoc, onSnapshot, updateDoc, deleteDoc, doc } from 'firebase/firestore'

export default function Contactos() {
  const navigate = useNavigate()
  const [user, setUser] = useState(JSON.parse(localStorage.getItem("usuario") || "{}"))
  const [busqueda, setBusqueda] = useState('')
  const [resultado, setResultado] = useState(null)
  const [contactos, setContactos] = useState([])
  const [solicitudes, setSolicitudes] = useState([])
  const [noLeidos, setNoLeidos] = useState({})
  const [error, setError] = useState('')
  const [msg, setMsg] = useState('')

  useEffect(() => {
    if (!user.email) { navigate('/login'); return }

    // Pedir permiso notificaciones
    if (Notification.permission === 'default') {
      Notification.requestPermission()
    }

    // Escuchar cambios del perfil propio
    const qUser = query(collection(db, 'usuarios'), where('email', '==', user.email))
    const unsubUser = onSnapshot(qUser, (snap) => {
      if (!snap.empty) {
        const data = snap.docs[0].data()
        const updated = { ...user, foto: data.foto || null, name: data.name, descripcion: data.descripcion }
        setUser(updated)
        localStorage.setItem("usuario", JSON.stringify(updated))
      }
    })

    // Actualizar estado en línea
    const updateOnline = async () => {
      const q = query(collection(db, 'usuarios'), where('email', '==', user.email))
      const snap = await getDocs(q)
      if (!snap.empty) {
        await updateDoc(doc(db, 'usuarios', snap.docs[0].id), { online: true, lastSeen: new Date() })
      }
    }
    updateOnline()

    const handleOffline = async () => {
      const q = query(collection(db, 'usuarios'), where('email', '==', user.email))
      const snap = await getDocs(q)
      if (!snap.empty) {
        await updateDoc(doc(db, 'usuarios', snap.docs[0].id), { online: false, lastSeen: new Date() })
      }
    }
    window.addEventListener('beforeunload', handleOffline)

    // Función notificación
    const notificarMensaje = (chatId, emailContacto, nombreContacto) => {
      const mq = query(
        collection(db, 'chats', chatId, 'mensajes'),
        where('leido', '==', false),
        where('email', '==', emailContacto)
      )
      return onSnapshot(mq, (snap) => {
        if (snap.docChanges().some(change => change.type === 'added')) {
          const audio = new Audio('https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3')
          audio.volume = 1.0
          audio.play().catch(() => {})
          if (Notification.permission === 'granted') {
            const cambio = snap.docChanges().find(c => c.type === 'added')
            const texto = cambio?.doc.data().text || 'Nuevo mensaje'
            new Notification(`💬 ${nombreContacto}`, {
              body: texto.length > 50 ? texto.substring(0, 50) + '...' : texto,
              icon: '/favicon.ico'
            })
          }
        }
      })
    }

    // Contactos aceptados
    const q1 = query(collection(db, 'contactos'), where('de', '==', user.email), where('estado', '==', 'aceptado'))
    const unsub1 = onSnapshot(q1, async (snap) => {
      const lista = snap.docs.map(d => ({ id: d.id, ...d.data() }))
      const listaConEstado = await Promise.all(lista.map(async (c) => {
        const uq = query(collection(db, 'usuarios'), where('email', '==', c.contactoEmail))
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

        // Notificación
        notificarMensaje(chatId, c.contactoEmail, c.contactoNombre)

        // Mensajes no leídos
        const mq = query(collection(db, 'chats', chatId, 'mensajes'), where('leido', '==', false))
        onSnapshot(mq, (msnap) => {
          const noLeidosMios = msnap.docs.filter(d => d.data().email !== user.email).length
          setNoLeidos(prev => ({ ...prev, [c.contactoEmail]: noLeidosMios }))
        })
      })
    })

    // Solicitudes pendientes
    const q2 = query(collection(db, 'contactos'), where('para', '==', user.email), where('estado', '==', 'pendiente'))
    const unsub2 = onSnapshot(q2, (snap) => {
      setSolicitudes(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    })

    return () => { unsub1(); unsub2(); unsubUser(); window.removeEventListener('beforeunload', handleOffline) }
  }, [])

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

  const rechazar = async (s) => {
    await updateDoc(doc(db, 'contactos', s.id), { estado: 'rechazado' })
  }

  const eliminarContacto = async (contacto) => {
    if (!window.confirm(`¿Eliminar a ${contacto.contactoNombre}?`)) return
    await deleteDoc(doc(db, 'contactos', contacto.id))
    const q = query(collection(db, 'contactos'), where('de', '==', contacto.contactoEmail), where('para', '==', user.email))
    const snap = await getDocs(q)
    snap.forEach(d => deleteDoc(doc(db, 'contactos', d.id)))
  }

  const abrirChat = (contacto) => {
    const chatId = [user.email, contacto.contactoEmail].sort().join('_')
    navigate(`/chat/${chatId}`, { state: { contacto } })
  }

  const logout = async () => {
    const q = query(collection(db, 'usuarios'), where('email', '==', user.email))
    const snap = await getDocs(q)
    if (!snap.empty) await updateDoc(doc(db, 'usuarios', snap.docs[0].id), { online: false, lastSeen: new Date() })
    localStorage.removeItem('usuario')
    navigate('/login')
  }

  const formatLastSeen = (lastSeen) => {
    if (!lastSeen) return ''
    const date = lastSeen.toDate ? lastSeen.toDate() : new Date(lastSeen)
    const now = new Date()
    const diff = Math.floor((now - date) / 60000)
    if (diff < 1) return 'hace un momento'
    if (diff < 60) return `hace ${diff} min`
    if (diff < 1440) return `hace ${Math.floor(diff / 60)}h`
    return `hace ${Math.floor(diff / 1440)}d`
  }

  return (
    <div style={{ minHeight: '100vh', background: '#f3f4f6', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '16px' }}>
      <div style={{ width: '100%', maxWidth: '420px' }}>

        {/* Header */}
        <div style={{ background: '#830000', borderRadius: '16px', padding: '16px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            {user.foto ? (
              <img src={user.foto} alt="foto" style={{ width: '38px', height: '38px', borderRadius: '50%', objectFit: 'cover', border: '2px solid rgba(255,255,255,0.5)' }} />
            ) : (
              <div style={{ width: '38px', height: '38px', background: 'rgba(255,255,255,0.2)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontWeight: '700' }}>
                {(user.name || 'U')[0].toUpperCase()}
              </div>
            )}
            <div>
              <p style={{ color: 'white', fontWeight: '600', fontSize: '14px', margin: 0 }}>{user.name}</p>
              <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: '11px', margin: 0 }}>ChatApp</p>
            </div>
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button onClick={() => navigate('/perfil')} style={{ background: 'rgba(255,255,255,0.15)', border: 'none', color: 'white', borderRadius: '8px', padding: '6px 10px', fontSize: '14px', cursor: 'pointer' }}>👤</button>
            <button onClick={logout} style={{ background: 'rgba(255,255,255,0.15)', border: 'none', color: 'white', borderRadius: '8px', padding: '6px 14px', fontSize: '12px', cursor: 'pointer' }}>Salir</button>
          </div>
        </div>

        {/* Solicitudes */}
        {solicitudes.length > 0 && (
          <div style={{ background: 'white', borderRadius: '12px', padding: '16px', marginBottom: '16px', border: '1px solid #fbbf24' }}>
            <p style={{ fontSize: '13px', fontWeight: '600', color: '#92400e', margin: '0 0 10px' }}>🔔 Solicitudes ({solicitudes.length})</p>
            {solicitudes.map(s => (
              <div key={s.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 0' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <div style={{ width: '34px', height: '34px', background: '#830000', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontWeight: '700', fontSize: '14px' }}>
                    {s.deNombre[0].toUpperCase()}
                  </div>
                  <div>
                    <p style={{ margin: 0, fontSize: '13px', fontWeight: '600' }}>{s.deNombre}</p>
                    <p style={{ margin: 0, fontSize: '11px', color: '#6b7280' }}>{s.de}</p>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '6px' }}>
                  <button onClick={() => aceptar(s)} style={{ background: '#10b981', color: 'white', border: 'none', borderRadius: '6px', padding: '5px 10px', fontSize: '12px', cursor: 'pointer' }}>✓</button>
                  <button onClick={() => rechazar(s)} style={{ background: '#ef4444', color: 'white', border: 'none', borderRadius: '6px', padding: '5px 10px', fontSize: '12px', cursor: 'pointer' }}>✗</button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Buscador */}
        <div style={{ background: 'white', borderRadius: '12px', padding: '16px', marginBottom: '16px', border: '1px solid #e5e7eb' }}>
          <p style={{ fontSize: '13px', fontWeight: '600', color: '#374151', margin: '0 0 10px' }}>Agregar contacto</p>
          <div style={{ display: 'flex', gap: '8px' }}>
            <input value={busqueda} onChange={e => setBusqueda(e.target.value)} onKeyDown={e => e.key === 'Enter' && buscar()}
              placeholder="Nombre o correo..."
              style={{ flex: 1, background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: '8px', padding: '8px 12px', fontSize: '14px', outline: 'none' }} />
            <button onClick={buscar} style={{ background: '#830000', color: 'white', border: 'none', borderRadius: '8px', padding: '8px 16px', fontSize: '13px', cursor: 'pointer' }}>Buscar</button>
          </div>
          {error && <p style={{ color: '#ef4444', fontSize: '12px', marginTop: '8px' }}>{error}</p>}
          {msg && <p style={{ color: '#10b981', fontSize: '12px', marginTop: '8px' }}>{msg}</p>}
          {resultado && (
            <div style={{ marginTop: '12px', background: '#f9fafb', borderRadius: '8px', padding: '10px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                {resultado.foto ? (
                  <img src={resultado.foto} alt="foto" style={{ width: '34px', height: '34px', borderRadius: '50%', objectFit: 'cover' }} />
                ) : (
                  <div style={{ width: '34px', height: '34px', background: '#830000', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontWeight: '700' }}>
                    {resultado.name[0].toUpperCase()}
                  </div>
                )}
                <div>
                  <p style={{ margin: 0, fontSize: '13px', fontWeight: '600' }}>{resultado.name}</p>
                  <p style={{ margin: 0, fontSize: '11px', color: '#6b7280' }}>{resultado.email}</p>
                </div>
              </div>
              <button onClick={enviarSolicitud} style={{ background: '#830000', color: 'white', border: 'none', borderRadius: '8px', padding: '6px 14px', fontSize: '12px', cursor: 'pointer' }}>+ Agregar</button>
            </div>
          )}
        </div>

        {/* Contactos */}
        <div style={{ background: 'white', borderRadius: '12px', border: '1px solid #e5e7eb', overflow: 'hidden' }}>
          <p style={{ fontSize: '13px', fontWeight: '600', color: '#374151', margin: 0, padding: '14px 16px', borderBottom: '1px solid #f0f0f0' }}>
            Mis contactos ({contactos.length})
          </p>
          {contactos.length === 0 && (
            <p style={{ textAlign: 'center', color: '#9ca3af', fontSize: '13px', padding: '24px' }}>No tienes contactos aún 👆</p>
          )}
          {contactos.map(c => (
            <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 16px', borderBottom: '1px solid #f9fafb', cursor: 'pointer' }}
              onMouseEnter={e => e.currentTarget.style.background = '#f9fafb'}
              onMouseLeave={e => e.currentTarget.style.background = 'white'}>

              <div style={{ position: 'relative', flexShrink: 0 }} onClick={() => abrirChat(c)}>
                {c.foto ? (
                  <img src={c.foto} alt="foto" style={{ width: '44px', height: '44px', borderRadius: '50%', objectFit: 'cover' }} />
                ) : (
                  <div style={{ width: '44px', height: '44px', background: '#830000', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontWeight: '700', fontSize: '18px' }}>
                    {c.contactoNombre[0].toUpperCase()}
                  </div>
                )}
                <div style={{ position: 'absolute', bottom: '1px', right: '1px', width: '11px', height: '11px', borderRadius: '50%', background: c.online ? '#10b981' : '#9ca3af', border: '2px solid white' }} />
              </div>

              <div style={{ flex: 1 }} onClick={() => abrirChat(c)}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <p style={{ margin: 0, fontSize: '14px', fontWeight: '600', color: '#1f2937' }}>{c.contactoNombre}</p>
                  {noLeidos[c.contactoEmail] > 0 && (
                    <div style={{ background: '#830000', color: 'white', borderRadius: '50%', width: '20px', height: '20px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: '700' }}>
                      {noLeidos[c.contactoEmail]}
                    </div>
                  )}
                </div>
                <p style={{ margin: 0, fontSize: '11px', color: c.online ? '#10b981' : '#9ca3af' }}>
                  {c.online ? '● En línea' : `● ${formatLastSeen(c.lastSeen)}`}
                </p>
              </div>

              <button onClick={(e) => { e.stopPropagation(); eliminarContacto(c) }}
                style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: '16px', padding: '4px 8px', borderRadius: '6px' }}
                title="Eliminar contacto">
                🗑️
              </button>
            </div>
          ))}
        </div>

      </div>
    </div>
  )
}