import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { db } from '../firebase'
import { collection, getDocs, query, where, updateDoc, doc } from 'firebase/firestore'

export default function Perfil() {
  const navigate = useNavigate()
  const user = JSON.parse(localStorage.getItem("usuario") || "{}")
  const [name, setName] = useState(user.name || '')
  const [descripcion, setDescripcion] = useState('')
  const [foto, setFoto] = useState(user.foto || null)
  const [msg, setMsg] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!user.email) { navigate('/login'); return }
    const cargar = async () => {
      const q = query(collection(db, 'usuarios'), where('email', '==', user.email))
      const snap = await getDocs(q)
      if (!snap.empty) {
        const data = snap.docs[0].data()
        setName(data.name || '')
        setDescripcion(data.descripcion || '')
        setFoto(data.foto || null)
      }
    }
    cargar()
  }, [])

  const handleFoto = (e) => {
    const file = e.target.files[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => setFoto(ev.target.result)
    reader.readAsDataURL(file)
  }

  const guardar = async () => {
    if (!name.trim()) { setMsg('El nombre no puede estar vacío'); return }
    setLoading(true)
    const q = query(collection(db, 'usuarios'), where('email', '==', user.email))
    const snap = await getDocs(q)
    if (!snap.empty) {
      await updateDoc(doc(db, 'usuarios', snap.docs[0].id), {
        name: name.trim(),
        descripcion: descripcion.trim(),
        foto: foto || null
      })
      const updated = { ...user, name: name.trim(), descripcion: descripcion.trim(), foto: foto || null }
      localStorage.setItem("usuario", JSON.stringify(updated))
      setMsg('¡Perfil actualizado!')
    }
    setLoading(false)
  }

  return (
    <div style={{ minHeight: '100vh', background: '#f3f4f6', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '16px' }}>
      <div style={{ width: '100%', maxWidth: '420px' }}>

        {/* Header */}
        <div style={{ background: '#830000', borderRadius: '16px', padding: '16px 20px', display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
          <button onClick={() => navigate('/contactos')} style={{ background: 'rgba(255,255,255,0.15)', border: 'none', color: 'white', borderRadius: '8px', padding: '6px 10px', fontSize: '16px', cursor: 'pointer' }}>←</button>
          <p style={{ color: 'white', fontWeight: '600', fontSize: '16px', margin: 0 }}>Editar perfil</p>
        </div>

        <div style={{ background: 'white', borderRadius: '16px', padding: '24px', border: '1px solid #e5e7eb' }}>

          {/* Foto */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: '24px' }}>
            <div style={{ position: 'relative', marginBottom: '12px' }}>
              {foto ? (
                <img src={foto} alt="foto" style={{ width: '90px', height: '90px', borderRadius: '50%', objectFit: 'cover', border: '3px solid #830000' }} />
              ) : (
                <div style={{ width: '90px', height: '90px', borderRadius: '50%', background: '#830000', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontSize: '36px', fontWeight: '700' }}>
                  {(name || 'U')[0].toUpperCase()}
                </div>
              )}
              <label style={{ position: 'absolute', bottom: '0', right: '0', background: '#830000', borderRadius: '50%', width: '28px', height: '28px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', border: '2px solid white' }}>
                <span style={{ color: 'white', fontSize: '14px' }}>📷</span>
                <input type="file" accept="image/*" onChange={handleFoto} style={{ display: 'none' }} />
              </label>
            </div>
            <p style={{ fontSize: '12px', color: '#9ca3af', margin: 0 }}>Click en 📷 para cambiar foto</p>
          </div>

          {/* Nombre */}
          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', fontSize: '12px', color: '#6b7280', marginBottom: '4px' }}>Nombre</label>
            <input value={name} onChange={e => setName(e.target.value)}
              style={{ width: '100%', background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: '8px', padding: '8px 12px', fontSize: '14px', outline: 'none', boxSizing: 'border-box' }} />
          </div>

          {/* Descripción */}
          <div style={{ marginBottom: '20px' }}>
            <label style={{ display: 'block', fontSize: '12px', color: '#6b7280', marginBottom: '4px' }}>Descripción</label>
            <textarea value={descripcion} onChange={e => setDescripcion(e.target.value)}
              placeholder="Ej: Disponible, En el trabajo..."
              rows={3}
              style={{ width: '100%', background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: '8px', padding: '8px 12px', fontSize: '14px', outline: 'none', boxSizing: 'border-box', resize: 'none' }} />
          </div>

          {msg && <p style={{ color: msg.includes('!') ? '#10b981' : '#ef4444', fontSize: '13px', marginBottom: '12px' }}>{msg}</p>}

          <button onClick={guardar} disabled={loading}
            style={{ width: '100%', background: '#830000', color: 'white', border: 'none', borderRadius: '8px', padding: '10px', fontSize: '14px', fontWeight: '500', cursor: 'pointer' }}>
            {loading ? 'Guardando...' : 'Guardar cambios'}
          </button>
        </div>
      </div>
    </div>
  )
}