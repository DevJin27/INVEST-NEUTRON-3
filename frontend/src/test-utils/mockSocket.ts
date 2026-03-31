import type { SocketLike } from '../types'

type EmitHandler = (payload: unknown, ack?: (response: unknown) => void) => void

export class MockSocket implements SocketLike {
  connected = false
  emitLog: Array<{ event: string; payload: unknown }> = []
  private listeners = new Map<string, Set<(...args: unknown[]) => void>>()
  private emitHandlers = new Map<string, EmitHandler>()

  on<T = unknown>(event: string, listener: (payload: T) => void) {
    const currentListeners = this.listeners.get(event) ?? new Set<(...args: unknown[]) => void>()
    currentListeners.add(listener as (...args: unknown[]) => void)
    this.listeners.set(event, currentListeners)
    return this
  }

  off<T = unknown>(event: string, listener?: (payload: T) => void) {
    if (!listener) {
      this.listeners.delete(event)
      return this
    }

    this.listeners.get(event)?.delete(listener as (...args: unknown[]) => void)
    return this
  }

  emit<TAck = unknown>(event: string, payload?: unknown, ack?: (response: TAck) => void) {
    this.emitLog.push({ event, payload })
    this.emitHandlers.get(event)?.(payload, ack as ((response: unknown) => void) | undefined)
    return this
  }

  disconnect() {
    this.connected = false
    this.serverEmit('disconnect', 'io client disconnect')
    return this
  }

  onEmit(event: string, handler: EmitHandler) {
    this.emitHandlers.set(event, handler)
  }

  connect() {
    this.connected = true
    this.serverEmit('connect')
  }

  triggerDisconnect(reason = 'transport close') {
    this.connected = false
    this.serverEmit('disconnect', reason)
  }

  serverEmit(event: string, ...args: unknown[]) {
    const listeners = this.listeners.get(event)
    if (!listeners) {
      return
    }

    for (const listener of listeners) {
      listener(...args)
    }
  }

  getEmitCount(event: string) {
    return this.emitLog.filter((entry) => entry.event === event).length
  }

  getLastPayload<T>(event: string) {
    const matchingEntries = this.emitLog.filter((entry) => entry.event === event)
    return matchingEntries.at(-1)?.payload as T | undefined
  }
}
