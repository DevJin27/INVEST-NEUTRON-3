import { io } from 'socket.io-client'
import type { SocketLike } from './types'

const socketUrl = import.meta.env.VITE_SOCKET_URL ?? 'http://localhost:3000'

export function createSocketClient(): SocketLike {
  return io(socketUrl, {
    autoConnect: true,
    reconnection: true,
    transports: ['websocket'],
  })
}
