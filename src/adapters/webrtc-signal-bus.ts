// 📡 WebRTC-backed SignalBus (stub) — works with Firecircle-style signaling
//
// Usage:
//   import { gratiaSignalAdapter } from "./gratiaSignalAdapter"
//   import { createWebRTCSignalBus } from "./webrtc-signal-bus"
//   const bus = createWebRTCSignalBus({ signalingUrl: "wss://hub", roomId: "garden", peerId })
//   kernel.use(gratiaSignalAdapter({ bus }))

import type {
  GratiaSignal,
  SignalBus,
  Unsubscribe,
} from "./gratiaSignalAdapter"

type PeerID = string

export type WebRTCSignalBusOpts = {
  signalingUrl: string
  roomId: string
  peerId?: string
  iceServers?: RTCIceServer[]
  log?: (...args: unknown[]) => void
}

type HubMsg =
  | { type: "hello"; roomId: string; peerId: string }
  | { type: "peers"; peers: PeerID[] }
  | { type: "offer"; from: PeerID; to: PeerID; sdp: RTCSessionDescriptionInit }
  | { type: "answer"; from: PeerID; to: PeerID; sdp: RTCSessionDescriptionInit }
  | { type: "ice"; from: PeerID; to: PeerID; candidate: RTCIceCandidateInit }

type DCMsg = { type: "signal"; payload: GratiaSignal }

export function createWebRTCSignalBus(
  opts: WebRTCSignalBusOpts
): SignalBus & { close(): void; stats(): { peers: number; channels: number } } {
  const {
    signalingUrl,
    roomId,
    peerId = `peer-${Math.random().toString(36).slice(2, 8)}`,
    iceServers = [{ urls: ["stun:stun.l.google.com:19302"] }],
    log = () => undefined,
  } = opts

  const listeners = new Set<(signal: GratiaSignal) => void>()
  let ws: WebSocket | null = null

  const pcs = new Map<PeerID, RTCPeerConnection>()
  const dcs = new Map<PeerID, RTCDataChannel>()
  const pendingCandidates = new Map<PeerID, RTCIceCandidateInit[]>()

  const notify = (signal: GratiaSignal) => {
    for (const fn of listeners) fn(signal)
  }

  const sendHub = (msg: HubMsg) => {
    if (!ws || ws.readyState !== WebSocket.OPEN) return
    ws.send(JSON.stringify(msg))
  }

  const createPC = (id: PeerID) => {
    if (pcs.has(id)) return pcs.get(id)!
    const pc = new RTCPeerConnection({ iceServers })
    pcs.set(id, pc)

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        sendHub({
          type: "ice",
          from: peerId,
          to: id,
          candidate: event.candidate.toJSON(),
        })
      }
    }

    pc.ondatachannel = (event) => attachChannel(id, event.channel)

    return pc
  }

  const attachChannel = (id: PeerID, dc: RTCDataChannel) => {
    dcs.set(id, dc)
    dc.binaryType = "arraybuffer"
    dc.onopen = () => log("dc:open", id)
    dc.onclose = () => {
      log("dc:close", id)
      dcs.delete(id)
    }
    dc.onerror = (err) => log("dc:error", id, err)
    dc.onmessage = (event) => {
      try {
        const data =
          typeof event.data === "string"
            ? event.data
            : new TextDecoder().decode(event.data)
        const msg = JSON.parse(data) as DCMsg
        if (msg.type === "signal" && msg.payload) notify(msg.payload)
      } catch {
        // ignore malformed payloads
      }
    }
  }

  const dial = async (to: PeerID) => {
    const pc = createPC(to)
    const dc = pc.createDataChannel("gratia-signal", { ordered: true })
    attachChannel(to, dc)
    const offer = await pc.createOffer()
    await pc.setLocalDescription(offer)
    sendHub({ type: "offer", from: peerId, to, sdp: offer })
  }

  const answer = async (from: PeerID, sdp: RTCSessionDescriptionInit) => {
    const pc = createPC(from)
    await pc.setRemoteDescription(new RTCSessionDescription(sdp))
    const queue = pendingCandidates.get(from)
    if (queue) {
      for (const candidate of queue) {
        await pc.addIceCandidate(candidate)
      }
      pendingCandidates.delete(from)
    }
    const ans = await pc.createAnswer()
    await pc.setLocalDescription(ans)
    sendHub({ type: "answer", from: peerId, to: from, sdp: ans })
  }

  const acceptAnswer = async (
    from: PeerID,
    sdp: RTCSessionDescriptionInit
  ) => {
    const pc = pcs.get(from)
    if (!pc) return
    await pc.setRemoteDescription(new RTCSessionDescription(sdp))
  }

  const acceptIce = async (from: PeerID, candidate: RTCIceCandidateInit) => {
    const pc = pcs.get(from)
    if (!pc || !pc.remoteDescription) {
      const queue = pendingCandidates.get(from) ?? []
      queue.push(candidate)
      pendingCandidates.set(from, queue)
      return
    }
    try {
      await pc.addIceCandidate(new RTCIceCandidate(candidate))
    } catch {
      // swallow failures
    }
  }

  const connectWS = () => {
    ws = new WebSocket(signalingUrl)
    ws.onopen = () => {
      log("hub:open", signalingUrl)
      sendHub({ type: "hello", roomId, peerId })
    }
    ws.onclose = () => log("hub:close")
    ws.onerror = (error) => log("hub:error", error)
    ws.onmessage = async (event) => {
      let msg: HubMsg
      try {
        msg = JSON.parse(event.data)
      } catch {
        return
      }

      if (msg.type === "peers") {
        msg.peers
          .filter((p) => p !== peerId)
          .filter((p) => !dcs.has(p))
          .filter((p) => peerId < p)
          .forEach((p) => {
            void dial(p)
          })
        return
      }

      if ("to" in msg && msg.to !== peerId) return

      switch (msg.type) {
        case "offer":
          await answer(msg.from, msg.sdp)
          break
        case "answer":
          await acceptAnswer(msg.from, msg.sdp)
          break
        case "ice":
          await acceptIce(msg.from, msg.candidate)
          break
        default:
          break
      }
    }
  }

  connectWS()

  return {
    send: (signal) => {
      const payload: DCMsg = { type: "signal", payload: signal }
      const message = JSON.stringify(payload)
      for (const dc of dcs.values()) {
        if (dc.readyState === "open") {
          try {
            dc.send(message)
          } catch {
            // ignore send errors
          }
        }
      }
    },

    subscribe: (fn) => {
      listeners.add(fn)
      const unsubscribe: Unsubscribe = () => listeners.delete(fn)
      return unsubscribe
    },

    close: () => {
      try {
        ws?.close()
      } catch {
        // noop
      }
      ws = null
      for (const dc of dcs.values()) {
        try {
          dc.close()
        } catch {
          // ignore
        }
      }
      for (const pc of pcs.values()) {
        try {
          pc.close()
        } catch {
          // ignore
        }
      }
      dcs.clear()
      pcs.clear()
      pendingCandidates.clear()
      listeners.clear()
    },

    stats: () => ({
      peers: pcs.size,
      channels: dcs.size,
    }),
  }
}
