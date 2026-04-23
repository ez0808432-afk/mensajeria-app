import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { db } from '../firebase'
import { collection, getDocs, query, where } from 'firebase/firestore'

export default function Login() {
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

  const handleSubmit = async (e) => {
    e.preventDefault()
    const q = query(collection(db, 'usuarios'), where('email', '==', email), where('password', '==', password))
    const snap = await getDocs(q)
    if (snap.empty) {
      alert("Correo o contraseña incorrectos")
      return
    }
    const userData = snap.docs[0].data()
    localStorage.setItem("usuario", JSON.stringify(userData))
    navigate("/contactos")
  }

  return (
    <div style={{ minHeight: '100vh', background: '#f3f4f6', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
      <div style={{ width: '100%', maxWidth: '360px', background: '#ffffff', borderRadius: '16px', overflow: 'hidden', border: '1px solid #e5e7eb' }}>

        <div style={{ background: '#830000', padding: '32px 24px', textAlign: 'center' }}>
          <div style={{ width: '48px', height: '48px', background: 'rgba(255,255,255,0.2)', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px' }}>
            <svg width="24" height="24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
          </div>
          <h1 style={{ color: '#ffffff', fontSize: '20px', fontWeight: '600', margin: '0 0 4px' }}>ChatApp</h1>
          <p style={{ color: 'rgba(255,255,255,0.75)', fontSize: '13px', margin: 0 }}>Conecta con el mundo</p>
        </div>

        <div style={{ padding: '24px' }}>
          <form onSubmit={handleSubmit}>
            <div style={{ marginBottom: '14px' }}>
              <label style={{ display: 'block', fontSize: '12px', color: '#6b7280', marginBottom: '4px' }}>Correo electrónico</label>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="usuario@email.com" required
                style={{ width: '100%', background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: '8px', padding: '8px 12px', fontSize: '14px', boxSizing: 'border-box', outline: 'none' }} />
            </div>
            <div style={{ marginBottom: '6px' }}>
              <label style={{ display: 'block', fontSize: '12px', color: '#6b7280', marginBottom: '4px' }}>Contraseña</label>
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" required
                style={{ width: '100%', background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: '8px', padding: '8px 12px', fontSize: '14px', boxSizing: 'border-box', outline: 'none' }} />
            </div>
            <div style={{ textAlign: 'right', marginBottom: '20px', marginTop: '6px' }}>
              <span style={{ fontSize: '12px', color: '#830000', cursor: 'pointer' }}>¿Olvidaste tu contraseña?</span>
            </div>
            <button type="submit" style={{ width: '100%', background: '#830000', color: '#ffffff', border: 'none', borderRadius: '8px', padding: '10px', fontSize: '14px', fontWeight: '500', cursor: 'pointer' }}>
              Entrar
            </button>
          </form>
          <p style={{ textAlign: 'center', fontSize: '13px', color: '#6b7280', marginTop: '20px' }}>
            ¿No tienes cuenta?{' '}
            <Link to="/register" style={{ color: '#830000', fontWeight: '500', textDecoration: 'none' }}>Regístrate</Link>
          </p>
        </div>
      </div>
    </div>
  )
}