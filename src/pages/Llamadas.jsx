import { useEffect, useRef, useState } from 'react'
import { db } from '../firebase'
import {
  doc, setDoc, onSnapshot, collection, addDoc, getDocs, deleteDoc
} from 'firebase/firestore'

export default function Llamadas({ chatId, tipoInicial = 'audio', onTerminar = () => {} }) {
  const localRef = useRef(null)
  const remoteRef = useRef(null)
  const pcRef = useRef(null)
  const localStreamRef = useRef(null)
  const unsubCall = useRef(null)
  const unsubCallerCandidates = useRef(null)
  const unsubCalleeCandidates = useRef(null)

  const [muted, setMuted] = useState(false)
  const [videoEnabled, setVideoEnabled] = useState(tipoInicial === 'video')

  useEffect(() => {
    start()
    return () => cleanup()
  }, [])

  const servers = {
    iceServers: [
      { urls: ['stun:sp-turn1.xirsys.com'] },
      {
        username: 'v2HfgYagqJMju1wqVt5Hvb9Da5bSDNwn7-iXigWSaWihwcu307QvwPNa2ZFJ0m2tAAAAAGoQypNBbmdlbA==',
        credential: '3a729a18-5625-11f1-8a4f-0242ac120004',
        urls: [
          'turn:sp-turn1.xirsys.com:80?transport=udp',
          'turn:sp-turn1.xirsys.com:3478?transport=udp',
          'turn:sp-turn1.xirsys.com:80?transport=tcp',
          'turn:sp-turn1.xirsys.com:3478?transport=tcp',
          'turns:sp-turn1.xirsys.com:443?transport=tcp',
          'turns:sp-turn1.xirsys.com:5349?transport=tcp'
        ]
      }
    ]
  }

  async function start() {
    pcRef.current = new RTCPeerConnection(servers)

    pcRef.current.ontrack = event => {
      if (remoteRef.current) remoteRef.current.srcObject = event.streams[0]
    }

    pcRef.current.oniceconnectionstatechange = () => {}

    // get local media
    try {
      const constraints = { audio: true, video: videoEnabled }
      const stream = await navigator.mediaDevices.getUserMedia(constraints)
      localStreamRef.current = stream
      if (localRef.current) localRef.current.srcObject = stream
      stream.getTracks().forEach(track => pcRef.current.addTrack(track, stream))
    } catch (e) {
      console.error('No access to media devices', e)
      return
    }

    const callDoc = doc(db, 'llamadas', chatId)

    // ice candidates -> firestore
    const callerCandidatesCollection = collection(callDoc, 'callerCandidates')
    const calleeCandidatesCollection = collection(callDoc, 'calleeCandidates')

    pcRef.current.onicecandidate = async event => {
      if (!event.candidate) return
      // if caller (no call doc exists yet) determine where to store by reading doc
      const snapshot = await getDocs(collection(db, 'llamadas')) // cheap check avoided in prod
      // determine role by presence of offer
      const callSnap = (await (await import('firebase/firestore')).getDoc(callDoc)).exists ? true : false
      // fallback: use tipoInicial to choose
      const isCaller = tipoInicial != null
      try {
        await addDoc(isCaller ? callerCandidatesCollection : calleeCandidatesCollection, event.candidate.toJSON())
      } catch (e) { console.error(e) }
    }

    // check if call doc exists (if caller, create offer; if callee, wait for offer)
    const docSnap = await (await import('firebase/firestore')).getDoc(callDoc)
    if (!docSnap.exists()) {
      // caller: create offer
      const offer = await pcRef.current.createOffer()
      await pcRef.current.setLocalDescription(offer)
      await setDoc(callDoc, { offer: { type: offer.type, sdp: offer.sdp }, tipo: tipoInicial || 'audio' })

      // listen for answer
      unsubCall.current = onSnapshot(callDoc, snap => {
        const data = snap.data()
        if (!pcRef.current.currentRemoteDescription && data?.answer) {
          const answer = data.answer
          pcRef.current.setRemoteDescription(answer)
        }
      })

      // listen for callee candidates
      unsubCalleeCandidates.current = onSnapshot(calleeCandidatesCollection, snap => {
        snap.docChanges().forEach(async change => {
          if (change.type === 'added') {
            try { await pcRef.current.addIceCandidate(change.doc.data()) } catch(e){ }
          }
        })
      })
    } else {
      // callee: wait for offer, set remote, create answer
      unsubCall.current = onSnapshot(callDoc, async snap => {
        const data = snap.data()
        if (data?.offer && !pcRef.current.currentRemoteDescription) {
          await pcRef.current.setRemoteDescription(data.offer)
          const answer = await pcRef.current.createAnswer()
          await pcRef.current.setLocalDescription(answer)
          await setDoc(callDoc, { answer: { type: answer.type, sdp: answer.sdp }, tipo: tipoInicial || 'audio' }, { merge: true })

          // listen for caller candidates
          unsubCallerCandidates.current = onSnapshot(callerCandidatesCollection, snap2 => {
            snap2.docChanges().forEach(async change => {
              if (change.type === 'added') {
                try { await pcRef.current.addIceCandidate(change.doc.data()) } catch(e){}
              }
            })
          })
        }
      })

      // also listen for caller candidates in case they were added earlier
      unsubCallerCandidates.current = onSnapshot(callerCandidatesCollection, snap => {
        snap.docChanges().forEach(async change => {
          if (change.type === 'added') {
            try { await pcRef.current.addIceCandidate(change.doc.data()) } catch(e){}
          }
        })
      })
    }

    // also listen for remote tracks already set via ontrack above
  }

  async function cleanup() {
    try { unsubCall.current?.() } catch(e){}
    try { unsubCallerCandidates.current?.() } catch(e){}
    try { unsubCalleeCandidates.current?.() } catch(e){}
    // stop tracks
    localStreamRef.current?.getTracks().forEach(t => t.stop())
    // close pc
    try { pcRef.current?.close() } catch(e){}

    // remove firestore doc and subcollections
    try {
      const callDoc = doc(db, 'llamadas', chatId)
      const callerCol = collection(callDoc, 'callerCandidates')
      const calleeCol = collection(callDoc, 'calleeCandidates')
      const callerDocs = await getDocs(callerCol)
      for (const d of callerDocs.docs) await deleteDoc(d.ref)
      const calleeDocs = await getDocs(calleeCol)
      for (const d of calleeDocs.docs) await deleteDoc(d.ref)
      await deleteDoc(callDoc)
    } catch (e) { /* ignore */ }

    onTerminar()
  }

  return (
    <div style={{ width: '100%', height: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, background: '#111' }}>
      <div style={{ display: 'flex', gap: 12 }}>
        <video ref={localRef} autoPlay muted playsInline style={{ width: 160, height: 120, background: '#000', borderRadius: 8 }} />
        <video ref={remoteRef} autoPlay playsInline style={{ width: 320, height: 240, background: '#000', borderRadius: 8 }} />
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <button onClick={() => { setMuted(p => !p); if (localStreamRef.current) localStreamRef.current.getAudioTracks().forEach(t => t.enabled = muted) }} style={{ padding: '8px 12px' }}>{muted ? 'Unmute' : 'Mute'}</button>
        <button onClick={() => { setVideoEnabled(p=>{ const next=!p; if (localStreamRef.current) localStreamRef.current.getVideoTracks().forEach(t=>t.enabled=next); return next }) }} style={{ padding: '8px 12px' }}>{videoEnabled ? 'Video Off' : 'Video On'}</button>
        <button onClick={cleanup} style={{ padding: '8px 12px', background: '#e11d48', color: '#fff' }}>Colgar</button>
      </div>
    </div>
  )
}
