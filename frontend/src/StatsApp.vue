<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { Leaf, LogOut, Map, RefreshCw, Trash2, X } from 'lucide-vue-next'
import {
  clearSession,
  currentSession,
  deleteTemporarySession,
  login,
  invalidatesSession,
  observations as loadObservations,
  sessionToken,
} from './api'
import type { Observation, SessionInfo } from './types'
import { feelings } from './types'
import AccessGate from './components/AccessGate.vue'
import MapView from './components/MapView.vue'
import MediaBlob from './components/MediaBlob.vue'
import ServiceRetry from './components/ServiceRetry.vue'
import Button from './components/ui/Button.vue'
import Card from './components/ui/Card.vue'

const session = ref<SessionInfo | null>(null)
const items = ref<Observation[]>([])
const selected = ref<Observation | null>(null)
const gate = ref(false)
const gateError = ref('')
const gateLoading = ref(false)
const restoreError = ref('')
const loading = ref(false)
const polling = ref(true)
const mode = ref<'points' | 'h3'>('points')
const pointStyle = ref<'measurements' | 'feelings' | 'plants'>('measurements')
const pagesBase = import.meta.env.BASE_URL
let pollTimer: number | null = null

const average = computed(() => items.value.length
  ? items.value.reduce((sum, item) => sum + item.plantReading, 0) / items.value.length
  : null)
const photoCount = computed(() => items.value.filter((item) => item.hasPhoto).length)
const audioCount = computed(() => items.value.filter((item) => item.hasAudio).length)
const feelingCounts = computed(() => Object.fromEntries(feelings.map(([name]) => [name, items.value.filter((item) => item.feeling === name).length])))

async function refresh() {
  loading.value = true
  try { items.value = await loadObservations('stats') } finally { loading.value = false }
}

function schedulePolling() {
  if (pollTimer) window.clearInterval(pollTimer)
  pollTimer = polling.value ? window.setInterval(refresh, 30_000) : null
}

async function restore() {
  restoreError.value = ''
  if (!sessionToken()) { gate.value = true; return }
  try {
    session.value = await currentSession()
    await refresh()
  } catch (cause) {
    if (invalidatesSession(cause)) {
      clearSession()
      gate.value = true
    } else {
      restoreError.value = cause instanceof Error ? cause.message : 'The service could not be reached.'
    }
  }
}

async function enter(code: string) {
  gateLoading.value = true
  gateError.value = ''
  try {
    session.value = await login(code, 'stats', false)
    gate.value = false
    await refresh()
  } catch (cause) {
    gateError.value = cause instanceof Error ? cause.message : 'Access failed'
  } finally {
    gateLoading.value = false
  }
}

async function cleanTemporarySession() {
  if (!window.confirm('Delete every Observation and media file in this Temporary Collection Session?')) return
  await deleteTemporarySession()
  leave()
}

function leave() {
  clearSession()
  session.value = null
  items.value = []
  selected.value = null
  restoreError.value = ''
  gate.value = true
}

watch(polling, schedulePolling)
onMounted(async () => { await restore(); schedulePolling() })
onBeforeUnmount(() => { if (pollTimer) window.clearInterval(pollTimer) })
</script>

<template>
  <main class="flex min-h-dvh flex-col">
    <header class="safe-top z-10 border-b border-border bg-background px-3 pb-3">
      <div class="mx-auto flex max-w-6xl items-center justify-between gap-3">
        <div class="flex items-center gap-2"><span class="grid size-10 place-items-center rounded-xl bg-primary text-white"><Map class="size-5" /></span><div><h1 class="font-bold">Observation Statistics</h1><p class="text-xs text-muted-foreground">{{ session?.kind === 'global' ? 'All permanent Events' : session?.kind === 'temporary' ? 'Temporary session' : session?.eventCode }}</p></div></div>
        <nav class="flex items-center gap-1">
          <a :href="pagesBase" class="grid size-10 place-items-center rounded-xl hover:bg-accent" aria-label="Collection"><Leaf class="size-5" /></a>
          <button class="grid size-10 place-items-center rounded-xl hover:bg-accent" aria-label="Leave session" @click="leave"><LogOut class="size-5" /></button>
        </nav>
      </div>

      <div class="mx-auto mt-3 grid max-w-6xl grid-cols-2 gap-2 md:grid-cols-4">
        <Card class="p-3"><p class="text-xs text-muted-foreground">Observations</p><strong class="text-xl">{{ items.length }}</strong></Card>
        <Card class="p-3"><p class="text-xs text-muted-foreground">Average reading</p><strong class="text-xl">{{ average === null ? '—' : average.toFixed(2) }}</strong></Card>
        <Card class="p-3"><p class="text-xs text-muted-foreground">Photos</p><strong class="text-xl">{{ photoCount }}</strong></Card>
        <Card class="p-3"><p class="text-xs text-muted-foreground">Voice Notes</p><strong class="text-xl">{{ audioCount }}</strong></Card>
      </div>
      <div class="mx-auto mt-2 flex max-w-6xl gap-1 overflow-x-auto pb-1" aria-label="Observer Feeling counts">
        <span v-for="([name, face, label]) in feelings" :key="name" class="flex shrink-0 items-center gap-1 rounded-full border border-border bg-white px-2 py-1 text-sm" :title="label"><span aria-hidden="true">{{ face }}</span><span>{{ feelingCounts[name] }}</span><span class="sr-only">{{ label }}</span></span>
      </div>

      <div class="mx-auto mt-2 flex max-w-6xl flex-wrap items-center gap-2">
        <div class="flex rounded-xl bg-muted p-1">
          <button class="rounded-lg px-3 py-2 text-sm font-semibold" :class="mode === 'points' && 'bg-white shadow-sm'" @click="mode = 'points'">Points</button>
          <button class="rounded-lg px-3 py-2 text-sm font-semibold" :class="mode === 'h3' && 'bg-white shadow-sm'" @click="mode = 'h3'">H3 density</button>
        </div>
        <div v-if="mode === 'points'" class="flex rounded-xl bg-muted p-1">
          <button v-for="style in ['measurements', 'feelings', 'plants'] as const" :key="style" class="rounded-lg px-3 py-2 text-sm font-semibold capitalize" :class="pointStyle === style && 'bg-white shadow-sm'" @click="pointStyle = style">{{ style }}</button>
        </div>
        <label class="ml-auto flex min-h-10 items-center gap-2 text-sm"><input v-model="polling" type="checkbox" /> Poll every 30s</label>
        <Button variant="outline" size="sm" :disabled="loading" @click="refresh"><RefreshCw class="size-4" :class="loading && 'animate-spin'" /> Refresh</Button>
        <Button v-if="session?.kind === 'temporary'" variant="destructive" size="sm" @click="cleanTemporarySession"><Trash2 class="size-4" /> Delete session</Button>
      </div>
    </header>

    <section class="relative min-h-[55dvh] flex-1">
      <MapView :observations="items" :mode="mode" :point-style="pointStyle" @observation="selected = $event" />
      <p v-if="!items.length && !loading" class="glass absolute left-1/2 top-4 -translate-x-1/2 rounded-xl border border-border px-4 py-2 text-sm">No Observations yet.</p>
    </section>

    <aside v-if="selected" class="sheet details-sheet p-4" aria-label="Observation details">
      <div class="flex items-start justify-between gap-3"><div><p class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Observation</p><h2 class="text-2xl font-bold">{{ selected.plantReading }}</h2></div><Button variant="ghost" size="icon" aria-label="Close details" @click="selected = null"><X /></Button></div>
      <dl class="mt-4 grid grid-cols-2 gap-3 text-sm">
        <div><dt class="text-muted-foreground">Sensor Color</dt><dd class="mt-1 flex items-center gap-2 font-semibold"><span class="size-5 rounded-full border" :style="{ background: selected.sensorColor }" />{{ selected.sensorColor }}</dd></div>
        <div><dt class="text-muted-foreground">Observer Feeling</dt><dd class="mt-1 font-semibold">{{ feelings.find(([name]) => name === selected?.feeling)?.[1] ?? 'Not recorded' }}</dd></div>
        <div class="col-span-2"><dt class="text-muted-foreground">Created</dt><dd class="font-semibold">{{ new Date(selected.createdAt).toLocaleString() }}</dd></div>
      </dl>
      <p v-if="selected.comment" class="mt-4 whitespace-pre-wrap rounded-xl bg-muted p-3 text-sm">{{ selected.comment }}</p>
      <div v-if="selected.hasPhoto" class="mt-4"><MediaBlob :key="`${selected.id}-photo`" :observation-id="selected.id" kind="photo" /></div>
      <div v-if="selected.hasAudio" class="mt-4"><MediaBlob :key="`${selected.id}-audio`" :observation-id="selected.id" kind="audio" /></div>
    </aside>

    <AccessGate v-if="gate" purpose="stats" :loading="gateLoading" :error="gateError" @submit="enter" />
    <ServiceRetry v-if="restoreError" :message="restoreError" @retry="restore" />
  </main>
</template>
