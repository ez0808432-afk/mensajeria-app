import { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { db } from '../firebase'
import { collection, getDocs, query, where } from 'firebase/firestore'

export default function Login() {
  const navigate  = useNavigate()
  const [email,    setEmail]    = useState('')
  const [password, setPassword] = useState('')
  const [error,    setError]    = useState('')
  const [loading,  setLoading]  = useState(false)
  const [dark,     setDark]     = useState(false)

  useEffect(() => {
    const saved = localStorage.getItem('theme') === 'dark'
    setDark(saved)
    document.documentElement.classList.toggle('dark', saved)
    // Limpiar sesión al llegar al login
    localStorage.removeItem('usuario')
  }, [])

  const toggleDark = () => {
    const next = !dark
    setDark(next)
    localStorage.setItem('theme', next ? 'dark' : 'light')
    document.documentElement.classList.toggle('dark', next)
  }

  // ── Lógica ORIGINAL sin cambios ──────────────────────────
  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const q    = query(
        collection(db, 'usuarios'),
        where('email',    '==', email),
        where('password', '==', password)
      )
      const snap = await getDocs(q)
      if (snap.empty) {
        setError('Correo o contraseña incorrectos')
        return
      }
      const userData = snap.docs[0].data()
      localStorage.setItem('usuario', JSON.stringify(userData))
      navigate('/contactos')
    } catch (err) {
      setError('Error de conexión. Intenta de nuevo.')
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  // ── Estilos dinámicos ────────────────────────────────────
  const bg      = dark ? '#111b21'  : '#f1f5f9'
  const cardBg  = dark ? '#1f2c34'  : '#ffffff'
  const border  = dark ? '1px solid rgba(255,255,255,0.06)' : '1px solid #e2e8f0'
  const lblClr  = dark ? '#94a3b8'  : '#64748b'
  const inpBg   = dark ? '#2a3942'  : '#f8fafc'
  const inpBdr  = dark ? '1px solid rgba(255,255,255,0.1)' : '1px solid #e2e8f0'
  const inpClr  = dark ? '#f1f5f9'  : '#1e293b'
  const subClr  = dark ? '#64748b'  : '#94a3b8'
  const linkClr = dark ? '#2dd4bf'  : '#0f766e'

  return (
    <div style={{
      minHeight: '100vh', background: bg,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: '16px', transition: 'background 0.3s', fontFamily: 'system-ui, sans-serif'
    }}>
      <div style={{
        width: '100%', maxWidth: '360px',
        background: cardBg, borderRadius: '20px',
        overflow: 'hidden', border, boxShadow: '0 8px 32px rgba(0,0,0,0.12)',
        transition: 'background 0.3s'
      }}>

        {/* Header */}
        <div style={{ background: '#0f766e', padding: '36px 24px 28px', textAlign: 'center', position: 'relative' }}>
          {/* Dark toggle */}
          <button onClick={toggleDark} style={{
            position: 'absolute', top: '14px', right: '14px',
            background: 'rgba(255,255,255,0.15)', border: 'none',
            borderRadius: '8px', width: '32px', height: '32px',
            fontSize: '16px', cursor: 'pointer', display: 'flex',
            alignItems: 'center', justifyContent: 'center'
          }}>{dark ? '☀️' : '🌙'}</button>

          <div style={{
            width: '56px', height: '56px', background: 'rgba(255,255,255,0.2)',
            borderRadius: '16px', display: 'flex', alignItems: 'center',
            justifyContent: 'center', margin: '0 auto 14px'
          }}>
            <svg width="28" height="28" fill="none" stroke="white" strokeWidth="2"
              strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
            </svg>
          </div>
          <h1 style={{ color: '#fff', fontSize: '22px', fontWeight: '700', margin: '0 0 4px' }}>ChatApp</h1>
          <p style={{ color: 'rgba(255,255,255,0.75)', fontSize: '13px', margin: 0 }}>Conecta con el mundo</p>
        </div>

        {/* Form */}
        <div style={{ padding: '28px 24px' }}>
          <form onSubmit={handleSubmit}>

            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: '500', color: lblClr, marginBottom: '6px' }}>
                Correo electrónico
              </label>
              <input
                type="email" value={email} onChange={e => setEmail(e.target.value)}
                placeholder="usuario@email.com" required
                style={{
                  width: '100%', background: inpBg, border: inpBdr,
                  borderRadius: '12px', padding: '10px 14px', fontSize: '14px',
                  boxSizing: 'border-box', outline: 'none', color: inpClr,
                  transition: 'background 0.3s'
                }}
              />
            </div>

            <div style={{ marginBottom: '8px' }}>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: '500', color: lblClr, marginBottom: '6px' }}>
                Contraseña
              </label>
              <input
                type="password" value={password} onChange={e => setPassword(e.target.value)}
                placeholder="••••••••" required
                style={{
                  width: '100%', background: inpBg, border: inpBdr,
                  borderRadius: '12px', padding: '10px 14px', fontSize: '14px',
                  boxSizing: 'border-box', outline: 'none', color: inpClr,
                  transition: 'background 0.3s'
                }}
              />
            </div>

            <div style={{ textAlign: 'right', marginBottom: '20px' }}>
              <span style={{ fontSize: '12px', color: linkClr, cursor: 'pointer' }}>¿Olvidaste tu contraseña?</span>
            </div>

            {/* Error */}
            {error && (
              <div style={{
                background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)',
                borderRadius: '10px', padding: '10px 14px', marginBottom: '16px'
              }}>
                <p style={{ color: '#f87171', fontSize: '13px', margin: 0, textAlign: 'center' }}>{error}</p>
              </div>
            )}

            <button type="submit" disabled={loading} style={{
              width: '100%', background: loading ? '#94a3b8' : '#0f766e',
              color: '#fff', border: 'none', borderRadius: '12px',
              padding: '12px', fontSize: '14px', fontWeight: '600',
              cursor: loading ? 'not-allowed' : 'pointer',
              transition: 'background 0.2s'
            }}>
              {loading ? 'Verificando...' : 'Entrar'}
            </button>
          </form>

          <p style={{ textAlign: 'center', fontSize: '13px', color: subClr, marginTop: '20px' }}>
            ¿No tienes cuenta?{' '}
            <Link to="/register" style={{ color: linkClr, fontWeight: '600', textDecoration: 'none' }}>
              Regístrate
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}