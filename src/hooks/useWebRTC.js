/**
 * useWebRTC.js
 * Hook de WebRTC con señalización via Firestore.
 * Usa la colección existente "llamadas_activas/{llamadaId}"
 * con subcolecciones offerCandidates / answerCandidates.
 */
import { useEffect, useRef, useState, useCallback } from 'react'
import { db } from '../firebase'
import {
  doc, collection, addDoc, onSnapshot,
  updateDoc, getDocs, deleteDoc, serverTimestamp, getDoc
} from 'firebase/firestore'

const ICE_SERVERS = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    {
      urls:       'turn:openrelay.metered.ca:80',
      username:   'openrelayproject',
      credential: 'openrelayproject',
    },
    {
      urls:       'turn:openrelay.metered.ca:443',
      username:   'openrelayproject',
      credential: 'openrelayproject',
    },
    {
      urls:       'turns:openrelay.metered.ca:443',
      username:   'openrelayproject',
      credential: 'openrelayproject',
    },
  ],
}

export default function useWebRTC({ llamadaId, esVideo, esSaliente, onTerminar }) {
  const [estado,       setEstado]       = useState('iniciando')
  // 'iniciando' | 'llamando' | 'conectando' | 'conectado' | 'terminado' | 'error'
  const [streamLocal,  setStreamLocal]  = useState(null)
  const [streamRemoto, setStreamRemoto] = useState(null)
  const [mutedAudio,   setMutedAudio]   = useState(false)
  const [mutedVideo,   setMutedVideo]   = useState(false)
  const [altavoz,      setAltavoz]      = useState(true)
  const [segundos,     setSegundos]     = useState(0)

  const pcRef          = useRef(null)
  const localRef       = useRef(null)
  const timerRef       = useRef(null)
  const unsubsRef      = useRef([])
  const terminadoRef   = useRef(false)

  /* ── timer de duración ──────────────────────────────────── */
  const startTimer = useCallback(() => {
    timerRef.current = setInterval(() => setSegundos(p => p + 1), 1000)
  }, [])

  /* ── obtener media ──────────────────────────────────────── */
  const getMedia = useCallback(async () => {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: true,
      video: esVideo ? { facingMode:'user', width:1280, height:720 } : false,
    })
    localRef.current = stream
    setStreamLocal(stream)
    return stream
  }, [esVideo])

  /* ── crear PeerConnection ───────────────────────────────── */
  const crearPC = useCallback((stream) => {
    const pc = new RTCPeerConnection(ICE_SERVERS)
    pcRef.current = pc
    stream.getTracks().forEach(t => pc.addTrack(t, stream))

    pc.ontrack = e => {
      if (e.streams?.[0]) setStreamRemoto(e.streams[0])
    }

    pc.onconnectionstatechange = () => {
      const s = pc.connectionState
      if (s === 'connected') { setEstado('conectado'); startTimer() }
      if (['disconnected','failed','closed'].includes(s)) {
        if (!terminadoRef.current) terminar()
      }
    }
    return pc
  }, [startTimer])

  /* ── intercambiar ICE ───────────────────────────────────── */
  const setupICE = useCallback((pc, misCandidatos, susCandidatos) => {
    pc.onicecandidate = async e => {
      if (e.candidate)
        await addDoc(misCandidatos, { ...e.candidate.toJSON(), ts: serverTimestamp() })
    }
    const unsub = onSnapshot(susCandidatos, snap => {
      snap.docChanges().forEach(async ch => {
        if (ch.type === 'added') {
          try { await pc.addIceCandidate(new RTCIceCandidate(ch.doc.data())) } catch {}
        }
      })
    })
    unsubsRef.current.push(unsub)
  }, [])

  /* ── SALIENTE ───────────────────────────────────────────── */
  const iniciarSaliente = useCallback(async () => {
    try {
      setEstado('llamando')
      const stream = await getMedia()
      const pc     = crearPC(stream)

      const llamadaRef  = doc(db, 'llamadas_activas', llamadaId)
      const offerCands  = collection(llamadaRef, 'offerCandidates')
      const answerCands = collection(llamadaRef, 'answerCandidates')

      setupICE(pc, offerCands, answerCands)

      const offer = await pc.createOffer()
      await pc.setLocalDescription(offer)
      await updateDoc(llamadaRef, { offer:{ type:offer.type, sdp:offer.sdp } })

      const unsub = onSnapshot(llamadaRef, async snap => {
        const d = snap.data()
        if (!d) return
        if (d.estado === 'rechazada' || d.estado === 'terminada') {
          if (!terminadoRef.current) terminar()
          return
        }
        if (d.answer && !pc.remoteDescription) {
          setEstado('conectando')
          await pc.setRemoteDescription(new RTCSessionDescription(d.answer))
        }
      })
      unsubsRef.current.push(unsub)
    } catch (err) {
      console.error('Error saliente:', err)
      setEstado('error')
    }
  }, [llamadaId, getMedia, crearPC, setupICE])

  /* ── ENTRANTE ───────────────────────────────────────────── */
  const iniciarEntrante = useCallback(async () => {
    try {
      setEstado('conectando')
      const stream = await getMedia()
      const pc     = crearPC(stream)

      const llamadaRef  = doc(db, 'llamadas_activas', llamadaId)
      const offerCands  = collection(llamadaRef, 'offerCandidates')
      const answerCands = collection(llamadaRef, 'answerCandidates')

      setupICE(pc, answerCands, offerCands)

      // Esperar offer (puede ya existir)
      const esperar = () => new Promise(resolve => {
        const unsub = onSnapshot(llamadaRef, snap => {
          if (snap.data()?.offer) { unsub(); resolve(snap.data()) }
        })
        unsubsRef.current.push(unsub)
      })

      const data = await esperar()
      await pc.setRemoteDescription(new RTCSessionDescription(data.offer))

      const answer = await pc.createAnswer()
      await pc.setLocalDescription(answer)
      await updateDoc(llamadaRef, { answer:{ type:answer.type, sdp:answer.sdp } })

      const unsub = onSnapshot(llamadaRef, snap => {
        const d = snap.data()
        if (d?.estado === 'terminada' && !terminadoRef.current) terminar()
      })
      unsubsRef.current.push(unsub)
    } catch (err) {
      console.error('Error entrante:', err)
      setEstado('error')
    }
  }, [llamadaId, getMedia, crearPC, setupICE])

  /* ── inicializar ────────────────────────────────────────── */
  useEffect(() => {
    if (!llamadaId) return
    if (esSaliente) iniciarSaliente()
    else            iniciarEntrante()
  }, [llamadaId])

  /* ── terminar ───────────────────────────────────────────── */
  const terminar = useCallback(async () => {
    if (terminadoRef.current) return
    terminadoRef.current = true
    setEstado('terminado')
    clearInterval(timerRef.current)
    unsubsRef.current.forEach(u => { try { u() } catch {} })
    localRef.current?.getTracks().forEach(t => t.stop())
    try { pcRef.current?.close() } catch {}
    try {
      const r = doc(db, 'llamadas_activas', llamadaId)
      await updateDoc(r, { estado:'terminada' })
      const oc = await getDocs(collection(r,'offerCandidates'))
      const ac = await getDocs(collection(r,'answerCandidates'))
      oc.forEach(d => deleteDoc(d.ref))
      ac.forEach(d => deleteDoc(d.ref))
    } catch {}
    onTerminar?.()
  }, [llamadaId, onTerminar])

  /* ── controles ──────────────────────────────────────────── */
  const toggleAudio = useCallback(() => {
    const t = localRef.current?.getAudioTracks()[0]
    if (t) { t.enabled = !t.enabled; setMutedAudio(!t.enabled) }
  }, [])

  const toggleVideo = useCallback(() => {
    const t = localRef.current?.getVideoTracks()[0]
    if (t) { t.enabled = !t.enabled; setMutedVideo(!t.enabled) }
  }, [])

  const toggleAltavoz = useCallback(() => setAltavoz(p => !p), [])

  const duracion = (() => {
    const m = String(Math.floor(segundos/60)).padStart(2,'0')
    const s = String(segundos%60).padStart(2,'0')
    return `${m}:${s}`
  })()

  return {
    estado, streamLocal, streamRemoto,
    mutedAudio, mutedVideo, altavoz, duracion,
    terminar, toggleAudio, toggleVideo, toggleAltavoz,
  }
}