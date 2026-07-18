<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { mediaBlob } from '../api'

const props = defineProps<{ observationId: string; kind: 'photo' | 'audio' }>()
const url = ref('')
const error = ref('')

onMounted(async () => {
  try {
    url.value = URL.createObjectURL(await mediaBlob(props.observationId, props.kind))
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : 'Media could not be loaded'
  }
})
onBeforeUnmount(() => { if (url.value) URL.revokeObjectURL(url.value) })
</script>

<template>
  <p v-if="error" class="text-sm text-destructive">{{ error }}</p>
  <p v-else-if="!url" class="text-sm text-muted-foreground">Loading {{ kind }}…</p>
  <img v-else-if="kind === 'photo'" :src="url" alt="Observation Photo" class="max-h-72 w-full rounded-xl object-cover" />
  <audio v-else :src="url" controls class="w-full">Your browser cannot play this Voice Note.</audio>
</template>
