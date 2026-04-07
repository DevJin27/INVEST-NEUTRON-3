import { io } from 'socket.io-client'
import type { SocketLike } from './types'

const socketUrl = import.meta.env.VITE_SOCKET_URL ?? 'http://localhost:3000'

export function createSocketClient(): SocketLike {
  return io(socketUrl, {
    autoConnect: true,
    reconnection: true,
    // Allow polling first so Socket.io can complete the HTTP upgrade handshake
    // even when the Render server is cold-starting. It will automatically
    // upgrade to WebSocket once the connection is established.
    transports: ['polling', 'websocket'],
  })
}
