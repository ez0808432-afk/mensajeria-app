import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import Login from './pages/Login'
import Register from './pages/Register'
import Chat from './pages/Chat'
import Contactos from './pages/Contactos'
import Perfil from './pages/Perfil'

function App() {
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