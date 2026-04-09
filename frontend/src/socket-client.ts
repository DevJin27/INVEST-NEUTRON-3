import { io } from 'socket.io-client'
import type { SocketLike } from './types'

const socketUrl = import.meta.env.VITE_SOCKET_URL ?? window.location.origin

export function createSocketClient(): SocketLike {
  return io(socketUrl, {
    autoConnect: true,
    reconnection: true,
    // Prefer a direct WebSocket connection on multi-instance deployments while
    // keeping polling available as a fallback transport.
    transports: ['websocket', 'polling'],
  })
}
