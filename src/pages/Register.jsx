import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { db } from '../firebase'
import { collection, addDoc, getDocs, query, where } from 'firebase/firestore'

export default function Register() {
  const navigate = useNavigate()
  const [form, setForm] = useState({ name: '', email: '', password: '', confirmPassword: '' })
  const [error, setError] = useState('')

  const handleChange = (e) => setForm({ ...form, [e.target.name]: e.target.value })

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')

    if (form.password !== form.confirmPassword) {
      setError('Las contraseñas no coinciden')
      return
    }

    // Verificar si el correo ya existe
    const q = query(collection(db, 'usuarios'), where('email', '==', form.email))
    const snap = await getDocs(q)
    if (!snap.empty) {
      setError('Este correo ya está registrado')
      return
    }

    // Guardar en Firestore
    await addDoc(collection(db, 'usuarios'), {
      name: form.name,
      email: form.email,
      password: form.password
    })

    // Guardar en localStorage
    localStorage.setItem("usuario", JSON.stringify(form))
    alert("Usuario registrado")
    navigate("/login")
  }

  const inputStyle = {
    width: '100%', background: '#f9fafb', border: '1px solid #e5e7eb',
    borderRadius: '8px', padding: '8px 12px', fontSize: '14px',
    boxSizing: 'border-box', outline: 'none'
  }

  return (
    <div style={{ minHeight: '100vh', background: '#f3f4f6', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
      <div style={{ width: '100%', maxWidth: '360px', background: '#ffffff', borderRadius: '16px', overflow: 'hidden', border: '1px solid #e5e7eb' }}>

        <div style={{ background: '#830000eb', padding: '32px 24px', textAlign: 'center' }}>
          <div style={{ width: '48px', height: '48px', background: 'rgba(255,255,255,0.2)', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px' }}>
            <svg width="24" height="24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
          </div>
          <h1 style={{ color: '#ffffff', fontSize: '20px', fontWeight: '600', margin: '0 0 4px' }}>ChatApp</h1>
          <p style={{ color: 'rgba(255,255,255,0.75)', fontSize: '13px', margin: 0 }}>Crea tu cuenta gratis</p>
        </div>

        <div style={{ padding: '24px' }}>
          <form onSubmit={handleSubmit}>
            <div style={{ marginBottom: '14px' }}>
              <label style={{ display: 'block', fontSize: '12px', color: '#6b7280', marginBottom: '4px' }}>Nombre completo</label>
              <input name="name" type="text" value={form.name} onChange={handleChange} placeholder="Juan Pérez" required style={inputStyle} />
            </div>
            <div style={{ marginBottom: '14px' }}>
              <label style={{ display: 'block', fontSize: '12px', color: '#6b7280', marginBottom: '4px' }}>Correo electrónico</label>
              <input name="email" type="email" value={form.email} onChange={handleChange} placeholder="usuario@email.com" required style={inputStyle} />
            </div>
            <div style={{ marginBottom: '14px' }}>
              <label style={{ display: 'block', fontSize: '12px', color: '#6b7280', marginBottom: '4px' }}>Contraseña</label>
              <input name="password" type="password" value={form.password} onChange={handleChange} placeholder="••••••••" required style={inputStyle} />
            </div>
            <div style={{ marginBottom: '20px' }}>
              <label style={{ display: 'block', fontSize: '12px', color: '#6b7280', marginBottom: '4px' }}>Confirmar contraseña</label>
              <input name="confirmPassword" type="password" value={form.confirmPassword} onChange={handleChange} placeholder="••••••••" required style={inputStyle} />
            </div>
            {error && <p style={{ color: '#ef4444', fontSize: '12px', marginBottom: '12px' }}>{error}</p>}
            <button type="submit" style={{ width: '100%', background: '#830000eb', color: '#ffffff', border: 'none', borderRadius: '8px', padding: '10px', fontSize: '14px', fontWeight: '500', cursor: 'pointer' }}>
              Crear cuenta
            </button>
          </form>

          <p style={{ textAlign: 'center', fontSize: '13px', color: '#6b7280', marginTop: '20px' }}>
            ¿Ya tienes cuenta?{' '}
            <Link to="/login" style={{ color: '#830000eb', fontWeight: '500', textDecoration: 'none' }}>
              Inicia sesión
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}