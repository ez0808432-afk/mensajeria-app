import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useEffect } from 'react'
import Login from './pages/Login'
import Register from './pages/Register'
import Chat from './pages/Chat'
import Contactos from './pages/Contactos'
import Perfil from './pages/Perfil'
import { db } from './firebase'
import { collection, getDocs, query, where, updateDoc, doc, serverTimestamp } from 'firebase/firestore'

function App() {
  useEffect(() => {
    const user = JSON.parse(localStorage.getItem('usuario') || '{}')
    if (!user.email) return

    const updateOnline = async () => {
      const q = query(collection(db, 'usuarios'), where('email', '==', user.email))
      const snap = await getDocs(q)
      if (!snap.empty) await updateDoc(doc(db, 'usuarios', snap.docs[0].id), { online: true, lastSeen: null })
    }

    const handleOffline = async () => {
      const q = query(collection(db, 'usuarios'), where('email', '==', user.email))
      const snap = await getDocs(q)
      if (!snap.empty) await updateDoc(doc(db, 'usuarios', snap.docs[0].id), { online: false, lastSeen: serverTimestamp() })
    }

    const handleVisibilityChange = () => { if (document.hidden) handleOffline(); else updateOnline() }

    window.addEventListener('beforeunload', handleOffline)
    document.addEventListener('visibilitychange', handleVisibilityChange)

    updateOnline()

    return () => {
      window.removeEventListener('beforeunload', handleOffline)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [])

  return (
    <div className="bg-white dark:bg-gray-900 text-black dark:text-white min-h-screen">
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/contactos" element={<Contactos />} />
          <Route path="/chat/:chatId" element={<Chat />} />
          <Route path="/perfil" element={<Perfil />} />
          <Route path="*" element={<Navigate to="/login" />} />
        </Routes>
      </BrowserRouter>
    </div>
  )
}

export default App