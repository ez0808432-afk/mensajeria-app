import './index.css'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { LlamadaProvider } from './context/LlamadaContext.jsx'
import App from './App.jsx'

// IMPORTANTE: BrowserRouter va AFUERA del LlamadaProvider
// para que useNavigate funcione dentro del contexto.
createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <LlamadaProvider>
        <App />
      </LlamadaProvider>
    </BrowserRouter>
  </StrictMode>,
)