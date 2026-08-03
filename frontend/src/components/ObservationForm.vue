<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { Camera, LocateFixed, MapPin, Mic, Square, Trash2, X } from 'lucide-vue-next'
import type { Location, Observation, ObservationSave } from '../types'
import { feelings } from '../types'
import Button from './ui/Button.vue'
import MediaBlob from './MediaBlob.vue'

const props = defineProps<{
  observation: Observation | null
  location: Location | null
  saving?: boolean
  error?: string
}>()
const emit = defineEmits<{
  close: []
  locate: []
  placing: [value: boolean]
  save: [value: ObservationSave]
  delete: []
}>()

const WHITE = '#FFFFFF'
const SENSOR_COLOR_PATTERN = /^#[0-9A-F]{6}$/i
const SENSOR_COLORS = [
  ['#1ABC9C', 'Turquoise'], ['#16A085', 'Dark turquoise'], ['#2ECC71', 'Emerald'], ['#27AE60', 'Green'], ['#3498DB', 'Blue'],
  ['#2980B9', 'Dark blue'], ['#9B59B6', 'Purple'], ['#8E44AD', 'Dark purple'], ['#34495E', 'Blue grey'], ['#000000', 'Black'],
  ['#F1C40F', 'Yellow'], ['#F39C12', 'Orange'], ['#E67E22', 'Deep orange'], ['#D35400', 'Burnt orange'], ['#E74C3C', 'Red'],
  ['#C0392B', 'Dark red'], ['#FFFFFF', 'White'], ['#ECF0F1', 'Light grey'], ['#BDC3C7', 'Grey'], ['#7F8C8D', 'Dark grey'],
] as const
const reading = ref('')
const color = ref('')
const customColor = ref(WHITE)
const colorMenu = ref<HTMLDetailsElement>()
const feeling = ref<Observation['feeling']>(null)
const comment = ref('')
const photo = ref<Blob | null>(null)
const audio = ref<Blob | null>(null)
const removePhoto = ref(false)
const removeAudio = ref(false)
const mediaError = ref('')
const recording = ref(false)
const recordingSeconds = ref(0)
const collapsed = ref(false)
let recorder: MediaRecorder | null = null
let stream: MediaStream | null = null
let timer: number | null = null
let hardStopTimer: number | null = null
let recordingStartedAt = 0
let audioPreview = ''
let photoPreview = ''

const currentAudioUrl = computed(() => {
  if (audioPreview) URL.revokeObjectURL(audioPreview)
  audioPreview = audio.value ? URL.createObjectURL(audio.value) : ''
  return audioPreview
})
const currentPhotoUrl = computed(() => {
  if (photoPreview) URL.revokeObjectURL(photoPreview)
  photoPreview = photo.value ? URL.createObjectURL(photo.value) : ''
  return photoPreview
})
const validColor = computed(() => SENSOR_COLOR_PATTERN.test(color.value))
const valid = computed(() => props.location && validColor.value && reading.value !== '' && Number.isFinite(Number(reading.value)) && Number(reading.value) >= 0 && Number(reading.value) <= 1)

watch(() => props.observation, (observation) => {
  const nextColor = observation?.sensorColor.toUpperCase() ?? ''
  reading.value = observation?.plantReading.toString() ?? ''
  color.value = nextColor
  customColor.value = nextColor || WHITE
  feeling.value = observation?.feeling ?? null
  comment.value = observation?.comment ?? ''
}, { immediate: true })

function choosePaletteColor(value: string) {
  color.value = value
  customColor.value = value
  colorMenu.value?.removeAttribute('open')
}

function chooseCustomColor() {
  if (!SENSOR_COLOR_PATTERN.test(customColor.value)) return
  customColor.value = customColor.value.toUpperCase()
  color.value = customColor.value
}

function setPlacing(value: boolean) {
  collapsed.value = value
  emit('placing', value)
}

async function resizePhoto(file: File) {
  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bitmap.width * scale)
  canvas.height = Math.round(bitmap.height * scale)
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  bitmap.close()
  return new Promise<Blob>((resolve, reject) => canvas.toBlob(
    (blob) => blob ? resolve(blob) : reject(new Error('Photo could not be prepared')),
    'image/jpeg',
    0.82,
  ))
}

async function choosePhoto(event: Event) {
  mediaError.value = ''
  const file = (event.target as HTMLInputElement).files?.[0]
  if (!file) return
  try {
    const resized = await resizePhoto(file)
    if (resized.size > 4_000_000) throw new Error('The prepared Photo is larger than 4 MB')
    photo.value = resized
    removePhoto.value = false
  } catch (cause) {
    mediaError.value = cause instanceof Error ? cause.message : 'Photo could not be prepared'
  }
}

async function startRecording() {
  mediaError.value = ''
  if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
    mediaError.value = 'Voice recording is not supported by this browser.'
    return
  }
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    recorder = new MediaRecorder(stream)
    const chunks: Blob[] = []
    recorder.ondataavailable = (event) => { if (event.data.size) chunks.push(event.data) }
    recorder.onstop = () => {
      const recorded = new Blob(chunks, { type: chunks[0]?.type || recorder?.mimeType || 'audio/webm' })
      const duration = (performance.now() - recordingStartedAt) / 1000
      if (duration > 60) {
        mediaError.value = 'The Voice Note is longer than 60 seconds.'
      } else if (recorded.size <= 4_000_000) {
        audio.value = recorded
        removeAudio.value = false
      } else {
        mediaError.value = 'The Voice Note is larger than 4 MB.'
      }
      stream?.getTracks().forEach((track) => track.stop())
      stream = null
    }
    recorder.start()
    recordingStartedAt = performance.now()
    recording.value = true
    recordingSeconds.value = 0
    timer = window.setInterval(() => {
      recordingSeconds.value = Math.min(60, Math.floor((performance.now() - recordingStartedAt) / 1000))
    }, 250)
    hardStopTimer = window.setTimeout(stopRecording, 59_500)
  } catch {
    stream?.getTracks().forEach((track) => track.stop())
    stream = null
    mediaError.value = 'Microphone permission is needed to record a Voice Note.'
  }
}

function stopRecording() {
  if (recorder?.state === 'recording') recorder.stop()
  recording.value = false
  if (timer) window.clearInterval(timer)
  if (hardStopTimer) window.clearTimeout(hardStopTimer)
  timer = null
  hardStopTimer = null
}

function submit() {
  if (!props.location || !valid.value) return
  emit('save', {
    ...props.location,
    plantReading: Number(reading.value),
    sensorColor: color.value.toUpperCase(),
    feeling: feeling.value,
    comment: comment.value.trim() || null,
    photo: photo.value,
    audio: audio.value,
    removePhoto: removePhoto.value,
    removeAudio: removeAudio.value,
  })
}

function confirmDelete() {
  if (window.confirm('Delete this Observation and its media permanently?')) emit('delete')
}

onBeforeUnmount(() => {
  stopRecording()
  stream?.getTracks().forEach((track) => track.stop())
  if (audioPreview) URL.revokeObjectURL(audioPreview)
  if (photoPreview) URL.revokeObjectURL(photoPreview)
})
</script>

<template>
  <aside class="sheet" :class="{ 'sheet-collapsed': collapsed }" aria-label="Observation form">
    <div v-if="collapsed" class="glass m-3 grid min-w-64 gap-3 rounded-2xl border border-border p-3 shadow-xl">
      <div class="flex items-center gap-3">
        <span class="grid size-10 shrink-0 place-items-center rounded-xl bg-primary text-white"><MapPin class="size-5" /></span>
        <div><p class="font-semibold">{{ location ? (location.accuracyM === null ? 'Location selected' : 'Location found') : 'Choose a location' }}</p><p class="text-sm text-muted-foreground">{{ location ? (location.accuracyM === null ? 'Drag the pin to adjust it.' : `Accurate to about ±${Math.round(location.accuracyM)} m`) : 'Tap the map to place the pin.' }}</p></div>
      </div>
      <Button @click="setPlacing(false)">{{ location ? 'Continue observation' : 'Return to observation' }}</Button>
    </div>
    <template v-else>
    <div class="sheet-handle shrink-0" />
    <header class="z-10 flex shrink-0 items-center justify-between border-b border-border bg-background/95 px-4 py-3 backdrop-blur">
      <div><p class="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{{ observation ? 'Edit' : 'New' }}</p><h2 class="text-lg font-bold">Observation</h2></div>
      <Button variant="ghost" size="icon" aria-label="Close form" @click="emit('close')"><X /></Button>
    </header>

    <form class="flex min-h-0 flex-1 flex-col" @submit.prevent="submit">
      <div class="grid min-h-0 flex-1 gap-6 overflow-y-auto p-4">
      <section class="grid gap-3">
        <div><h3 class="font-bold">1. Location</h3><p class="text-sm text-muted-foreground">Your exact location anchors this Observation. We ask only when you tap the button; you can also tap or drag the marker on the map.</p></div>
        <Button variant="outline" @click="emit('locate')"><LocateFixed /> Use my location</Button>
        <Button variant="outline" @click="setPlacing(true)"><MapPin /> Place on map</Button>
        <p v-if="location" class="rounded-xl bg-muted p-3 text-sm">
          <strong>Location selected</strong>
          <span v-if="location.accuracyM !== null" class="block text-muted-foreground">Accurate to about ±{{ Math.round(location.accuracyM) }} m</span>
          <span v-else class="block text-muted-foreground">Placed manually on the map</span>
        </p>
        <p v-else class="rounded-xl border border-dashed border-border p-3 text-sm text-muted-foreground">No location yet. Use GPS or temporarily open the map.</p>
      </section>

      <section class="grid gap-4">
        <h3 class="font-bold">2. Sensor measurements</h3>
        <div class="field"><label for="reading">Plant Reading</label><input id="reading" v-model="reading" class="control" type="number" min="0" max="1" step="any" inputmode="decimal" placeholder="0–1, e.g. 0.65" required /></div>
        <div class="field">
          <span class="field-label">Sensor Color</span>
          <details ref="colorMenu" class="rounded-xl border border-border bg-white">
            <summary class="flex min-h-11 cursor-pointer list-none items-center gap-3 px-3 py-2 font-semibold">
              <span class="size-7 rounded-lg border border-border" :class="color ? '' : 'border-dashed'" :style="{ backgroundColor: color || WHITE }" aria-hidden="true" />
              <span class="flex-1">{{ color ? color : 'Select color' }}</span>
            </summary>
            <div class="grid gap-4 border-t border-border p-3">
              <div>
                <p class="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Default palette</p>
                <div class="grid grid-cols-5 gap-3" role="group" aria-label="Sensor Color palette">
                  <button
                    v-for="([value, label]) in SENSOR_COLORS"
                    :key="value"
                    type="button"
                    class="aspect-square min-h-10 rounded-xl border border-border shadow-sm"
                    :class="color === value ? 'ring-2 ring-primary ring-offset-2' : ''"
                    :style="{ backgroundColor: value }"
                    :aria-label="`Select ${label} (${value})`"
                    :aria-pressed="color === value"
                    @click="choosePaletteColor(value)"
                  />
                </div>
              </div>
              <div class="grid gap-2 border-t border-border pt-3">
                <span class="text-sm font-semibold">Custom color…</span>
                <div class="grid grid-cols-[4rem_1fr] gap-2">
                  <input v-model="customColor" class="control cursor-pointer p-1" type="color" aria-label="Choose custom Sensor Color" @input="chooseCustomColor" />
                  <input
                    id="sensor-color-custom"
                    v-model="customColor"
                    class="control uppercase"
                    type="text"
                    aria-label="Custom Sensor Color hex code"
                    placeholder="#FFFFFF"
                    autocomplete="off"
                    autocapitalize="characters"
                    maxlength="7"
                    pattern="#[0-9A-Fa-f]{6}"
                    spellcheck="false"
                    @change="chooseCustomColor"
                  />
                </div>
                <p class="text-xs text-muted-foreground">Fine-tune visually or enter a six-digit hex value.</p>
              </div>
            </div>
          </details>
          <p v-if="!validColor" class="text-sm text-muted-foreground">Choose a Sensor Color to continue.</p>
        </div>
      </section>

      <section class="grid gap-4">
        <div><h3 class="font-bold">3. Feeling and comment</h3><p class="text-sm text-muted-foreground">How do you feel during this Observation? Optional.</p></div>
        <div class="grid grid-cols-5 gap-2" role="group" aria-label="Observer Feeling">
          <button v-for="([name, face, label]) in feelings" :key="name" type="button" class="min-h-12 rounded-xl border text-2xl" :class="feeling === name ? 'border-primary bg-accent ring-2 ring-ring/30' : 'border-border bg-white'" :aria-label="label" :aria-pressed="feeling === name" @click="feeling = feeling === name ? null : name">{{ face }}</button>
        </div>
        <div class="field"><label for="comment">Comment <span class="font-normal text-muted-foreground">({{ comment.length }}/500)</span></label><textarea id="comment" v-model="comment" class="control min-h-24 py-3" placeholder="Describe what you notice (optional)" maxlength="500" /></div>
      </section>

      <section class="grid gap-4">
        <h3 class="font-bold">4. Optional media</h3>
        <div class="grid gap-3 rounded-2xl border border-border bg-white p-3">
          <div class="flex items-center justify-between"><span class="flex items-center gap-2 font-semibold"><Camera class="size-5" /> Photo</span><span class="text-xs text-muted-foreground">Camera or gallery</span></div>
          <MediaBlob v-if="observation?.hasPhoto && !removePhoto && !photo" :observation-id="observation.id" kind="photo" />
          <img v-if="photo" :src="currentPhotoUrl" alt="New Photo preview" class="max-h-56 w-full rounded-xl object-cover" />
          <div class="flex flex-wrap gap-2">
            <label class="inline-flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-xl border border-border px-4 text-sm font-semibold"><Camera class="size-4" /> Camera<input class="sr-only" type="file" accept="image/*" capture="environment" @change="choosePhoto" /></label>
            <label class="inline-flex min-h-11 cursor-pointer items-center justify-center rounded-xl border border-border px-4 text-sm font-semibold">Gallery<input class="sr-only" type="file" accept="image/*" @change="choosePhoto" /></label>
            <Button v-if="observation?.hasPhoto || photo" variant="ghost" @click="photo = null; removePhoto = true"><Trash2 class="size-4" /> Remove</Button>
          </div>
        </div>

        <div class="grid gap-3 rounded-2xl border border-border bg-white p-3">
          <div class="flex items-center justify-between"><span class="flex items-center gap-2 font-semibold"><Mic class="size-5" /> Voice Note</span><span class="text-xs text-muted-foreground">Maximum 60 seconds</span></div>
          <MediaBlob v-if="observation?.hasAudio && !removeAudio && !audio" :observation-id="observation.id" kind="audio" />
          <audio v-if="audio" :src="currentAudioUrl" controls class="w-full" />
          <div class="flex flex-wrap gap-2">
            <Button v-if="!recording" variant="outline" @click="startRecording"><Mic class="size-4" /> {{ observation?.hasAudio || audio ? 'Record again' : 'Record' }}</Button>
            <Button v-else variant="destructive" @click="stopRecording"><Square class="size-4" /> Stop {{ recordingSeconds }}s</Button>
            <Button v-if="observation?.hasAudio || audio" variant="ghost" @click="audio = null; removeAudio = true"><Trash2 class="size-4" /> Remove</Button>
          </div>
        </div>
        <p v-if="mediaError" class="text-sm font-medium text-destructive" role="alert">{{ mediaError }}</p>
      </section>

      <p v-if="error" class="text-sm font-medium text-destructive" role="alert">{{ error }}</p>
      </div>
      <div class="grid shrink-0 gap-2 border-t border-border bg-background p-4">
        <Button type="submit" :disabled="!valid || saving">{{ saving ? 'Saving…' : 'Save Observation' }}</Button>
        <Button v-if="observation" variant="destructive" @click="confirmDelete"><Trash2 class="size-4" /> Delete Observation</Button>
      </div>
    </form>
    </template>
  </aside>
</template>
