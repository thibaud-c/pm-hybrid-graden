<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { BarChart3, HeartPulse, Leaf, LogOut, Plus, Trash2 } from 'lucide-vue-next'
import {
  acknowledgePrivacy,
  clearSession,
  currentSession,
  deleteObservation as removeObservation,
  deleteTemporarySession,
  login,
  invalidatesSession,
  observations as loadObservations,
  removeMedia,
  sessionToken,
  updateObservation,
  uploadMedia,
} from './api'
import { saveNewObservation } from './saveObservation'
import type { Location, Observation, ObservationSave, SessionInfo } from './types'
import AccessGate from './components/AccessGate.vue'
import MapView from './components/MapView.vue'
import ObservationForm from './components/ObservationForm.vue'
import PrivacyGate from './components/PrivacyGate.vue'
import ServiceRetry from './components/ServiceRetry.vue'
import Button from './components/ui/Button.vue'

const session = ref<SessionInfo | null>(null)
const items = ref<Observation[]>([])
const gate = ref(false)
const gateError = ref('')
const gateLoading = ref(false)
const privacyGate = ref(false)
const restoreError = ref('')
const formOpen = ref(false)
const selected = ref<Observation | null>(null)
const location = ref<Location | null>(null)
const saving = ref(false)
const formError = ref('')
let draftId: string | null = null

const pagesBase = import.meta.env.BASE_URL

async function refresh() {
  items.value = await loadObservations('collection')
}

async function restore() {
  restoreError.value = ''
  if (!sessionToken()) { gate.value = true; return }
  try {
    const existing = await currentSession()
    if (existing.kind === 'global') {
      clearSession()
      gateError.value = 'Enter an Event or Temporary Code to collect.'
      gate.value = true
      return
    }
    session.value = existing
    privacyGate.value = !existing.privacyAcknowledged
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

async function acceptPrivacy() {
  gateLoading.value = true
  gateError.value = ''
  try {
    session.value = await acknowledgePrivacy()
    privacyGate.value = false
  } catch (cause) {
    gateError.value = cause instanceof Error ? cause.message : 'The collection notice could not be saved'
  } finally {
    gateLoading.value = false
  }
}

async function enter(code: string, acknowledged: boolean) {
  gateLoading.value = true
  gateError.value = ''
  try {
    session.value = await login(code, 'collect', acknowledged)
    gate.value = false
    await refresh()
  } catch (cause) {
    gateError.value = cause instanceof Error ? cause.message : 'Access failed'
  } finally {
    gateLoading.value = false
  }
}

function addObservation() {
  if (session.value?.eventStatus === 'closed') return
  selected.value = null
  location.value = null
  draftId = null
  formError.value = ''
  formOpen.value = true
}

function editObservation(observation: Observation) {
  selected.value = observation
  location.value = {
    latitude: observation.latitude,
    longitude: observation.longitude,
    accuracyM: observation.accuracyM,
  }
  draftId = null
  formError.value = ''
  formOpen.value = true
}

function useLocation() {
  if (!navigator.geolocation) {
    formError.value = 'Location is not supported by this browser. Tap the map to place the marker manually.'
    return
  }
  navigator.geolocation.getCurrentPosition(
    ({ coords }) => {
      location.value = { latitude: coords.latitude, longitude: coords.longitude, accuracyM: coords.accuracy }
      formError.value = ''
    },
    () => { formError.value = 'Location permission was not granted. Tap the map to place the marker manually.' },
    { enableHighAccuracy: true, timeout: 12000, maximumAge: 30000 },
  )
}

async function save(value: ObservationSave) {
  saving.value = true
  formError.value = ''
  try {
    if (selected.value) {
      const { photo, audio, removePhoto: shouldRemovePhoto, removeAudio: shouldRemoveAudio, ...input } = value
      const id = selected.value.id
      await updateObservation(id, input)
      if (shouldRemovePhoto) await removeMedia(id, 'photo')
      if (shouldRemoveAudio) await removeMedia(id, 'audio')
      if (photo) await uploadMedia(id, 'photo', photo)
      if (audio) await uploadMedia(id, 'audio', audio)
    } else {
      await saveNewObservation(value, draftId, (id) => { draftId = id })
    }
    draftId = null
    formOpen.value = false
    await refresh()
  } catch (cause) {
    formError.value = cause instanceof Error ? cause.message : 'Observation could not be saved'
  } finally {
    saving.value = false
  }
}

async function deleteSelected() {
  if (!selected.value) return
  saving.value = true
  formError.value = ''
  try {
    await removeObservation(selected.value.id)
    formOpen.value = false
    await refresh()
  } catch (cause) {
    formError.value = cause instanceof Error ? cause.message : 'Observation could not be deleted'
  } finally {
    saving.value = false
  }
}

async function cleanTemporarySession() {
  if (!window.confirm('Delete every Observation and media file in this Temporary Collection Session?')) return
  await deleteTemporarySession()
  clearSession()
  session.value = null
  items.value = []
  restoreError.value = ''
  gate.value = true
}

function leave() {
  if (!window.confirm('Leave this Collection Session? You will permanently lose the ability to edit its Observations.')) return
  clearSession()
  session.value = null
  items.value = []
  gate.value = true
}

onMounted(restore)
</script>

<template>
  <main class="map-shell">
    <MapView :observations="items" :selected-location="formOpen ? location : null" :placing="formOpen" mode="collection" @observation="editObservation" @location="location = $event" />

    <header class="safe-top pointer-events-none fixed inset-x-0 top-0 z-20 flex items-start justify-between gap-2 p-3">
      <div class="glass pointer-events-auto flex items-center gap-2 rounded-2xl border border-border px-3 py-2 shadow-sm">
        <span class="grid size-9 place-items-center rounded-xl bg-primary text-white"><Leaf class="size-5" /></span>
        <div><h1 class="text-sm font-bold">Plant Observations</h1><p class="text-xs text-muted-foreground">{{ session?.eventCode ?? 'Temporary session' }} · {{ items.length }}</p></div>
      </div>
      <nav class="glass pointer-events-auto flex rounded-2xl border border-border p-1 shadow-sm" aria-label="Application">
        <a :href="`${pagesBase}stats/`" class="grid size-10 place-items-center rounded-xl hover:bg-accent" aria-label="Statistics"><BarChart3 class="size-5" /></a>
        <a :href="`${pagesBase}status/`" class="grid size-10 place-items-center rounded-xl hover:bg-accent" aria-label="System status"><HeartPulse class="size-5" /></a>
        <button class="grid size-10 place-items-center rounded-xl hover:bg-accent" aria-label="Leave session" @click="leave"><LogOut class="size-5" /></button>
      </nav>
    </header>

    <div v-if="session?.eventStatus === 'closed'" class="glass fixed left-1/2 top-24 z-20 -translate-x-1/2 rounded-xl border border-border px-4 py-2 text-sm font-semibold shadow">This Event is closed. Existing Observations are read-only.</div>
    <div v-if="!formOpen" class="safe-bottom fixed inset-x-0 bottom-0 z-20 flex flex-col items-center gap-2 p-4">
      <Button v-if="session?.kind === 'temporary'" variant="destructive" size="sm" @click="cleanTemporarySession"><Trash2 class="size-4" /> Delete temporary session</Button>
      <Button class="min-w-48 rounded-full shadow-xl" :disabled="session?.eventStatus === 'closed'" @click="addObservation"><Plus /> Add Observation</Button>
    </div>

    <ObservationForm v-if="formOpen" :key="selected?.id ?? 'new'" :observation="selected" :location="location" :saving="saving" :error="formError" @close="formOpen = false" @locate="useLocation" @save="save" @delete="deleteSelected" />
    <AccessGate v-if="gate" purpose="collect" :loading="gateLoading" :error="gateError" @submit="enter" />
    <PrivacyGate v-if="privacyGate" :loading="gateLoading" :error="gateError" @submit="acceptPrivacy" />
    <ServiceRetry v-if="restoreError" :message="restoreError" @retry="restore" />
  </main>
</template>
