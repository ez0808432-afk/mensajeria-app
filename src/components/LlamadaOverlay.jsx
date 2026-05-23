/**
 * LlamadaOverlay.jsx
 * Renderiza la pantalla de llamada activa (no minimizada)
 * encima de cualquier ruta. Se monta una sola vez en App.jsx.
 */
import { useLlamada } from '../context/LlamadaContext'
import Llamadas from '../pages/Llamadas'

export default function LlamadaOverlay() {
  const { llamadaActiva, terminarLlamada } = useLlamada()
  if (!llamadaActiva || llamadaActiva.minimizada) return null

  const user = JSON.parse(localStorage.getItem('usuario') || '{}')

  return (
    <Llamadas
      llamadaId={llamadaActiva.llamadaId}
      tipo={llamadaActiva.tipo}
      esSaliente={llamadaActiva.esSaliente}
      contacto={llamadaActiva.contacto}
      user={user}
      onTerminar={terminarLlamada}
    />
  )
}