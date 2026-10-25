/** 事项元数据 store（明文 meta；记录数据在 ledger store 中加密存取） */
import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { EventMeta } from '@/types'
import { randomSalt, deriveKey, makeVerifier, keyToHex } from '@/lib/crypto'
import { uid } from '@/lib/id'

const EVENTS_KEY = 'gb:events'

function loadEvents(): EventMeta[] {
  try {
    const raw = localStorage.getItem(EVENTS_KEY)
    if (!raw) return []
    const list = JSON.parse(raw)
    return Array.isArray(list) ? list : []
  } catch {
    return []
  }
}

export const useEventsStore = defineStore('events', () => {
  const list = ref<EventMeta[]>(loadEvents())

  function persist() {
    localStorage.setItem(EVENTS_KEY, JSON.stringify(list.value))
  }

  const sortedList = computed(() => [...list.value].sort((a, b) => b.createdAt - a.createdAt))

  function createEvent(input: {
    name: string
    kind: EventMeta['kind']
    date?: string
    password: string
  }): { event: EventMeta; sessionKeyHex: string } {
    const salt = randomSalt()
    const dk = deriveKey(input.password, salt)
    const event: EventMeta = {
      id: uid('ev'),
      name: input.name.trim(),
      kind: input.kind,
      createdAt: Date.now(),
      date: input.date,
      salt,
      verifier: makeVerifier(dk),
    }
    list.value.push(event)
    persist()
    return { event, sessionKeyHex: keyToHex(dk.key) }
  }

  function createEventFromBackup(meta: Omit<EventMeta, 'id'>): EventMeta {
    const event: EventMeta = { ...meta, id: uid('ev') }
    list.value.push(event)
    persist()
    return event
  }

  function removeEvent(id: string) {
    list.value = list.value.filter((e) => e.id !== id)
    persist()
    localStorage.removeItem(`gb:data:${id}`)
    sessionStorage.removeItem(`gb:session-key:${id}`)
  }

  function renameEvent(id: string, name: string) {
    const ev = list.value.find((e) => e.id === id)
    if (ev) {
      ev.name = name.trim() || ev.name
      persist()
    }
  }

  function setEventDate(id: string, date?: string) {
    const ev = list.value.find((e) => e.id === id)
    if (ev) {
      ev.date = date
      persist()
    }
  }

  function getEvent(id: string): EventMeta | undefined {
    return list.value.find((e) => e.id === id)
  }

  return {
    list,
    sortedList,
    createEvent,
    createEventFromBackup,
    removeEvent,
    renameEvent,
    setEventDate,
    getEvent,
  }
})
