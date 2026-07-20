<script setup lang="ts">
import { ref } from 'vue'
import { Leaf, ShieldCheck } from 'lucide-vue-next'
import { PRIVACY_NOTICE } from '../privacyNotice'
import Button from './ui/Button.vue'
import Card from './ui/Card.vue'

defineProps<{ loading?: boolean; error?: string }>()
const emit = defineEmits<{ submit: [] }>()
const acknowledged = ref(false)
</script>

<template>
  <div class="fixed inset-0 z-50 grid place-items-center bg-black/45 p-4" role="dialog" aria-modal="true" aria-labelledby="privacy-title">
    <Card class="w-full max-w-md p-6">
      <div class="mb-5 flex size-12 items-center justify-center rounded-2xl bg-primary text-white"><Leaf /></div>
      <h1 id="privacy-title" class="text-2xl font-bold">Before collecting</h1>
      <p class="mt-2 text-sm text-muted-foreground">This browser already has access to the Collection Event. Please read and accept the collection notice before adding an Observation.</p>
      <label class="mt-6 flex items-start gap-3 rounded-xl bg-muted p-3 text-sm leading-5">
        <input v-model="acknowledged" class="mt-1 size-4" type="checkbox" />
        <span><strong class="mb-1 flex items-center gap-1.5"><ShieldCheck class="size-4" /> Share responsibly</strong>{{ PRIVACY_NOTICE }}</span>
      </label>
      <p v-if="error" class="mt-4 text-sm font-medium text-destructive" role="alert">{{ error }}</p>
      <Button class="mt-4 w-full" :disabled="loading || !acknowledged" @click="emit('submit')">{{ loading ? 'Saving…' : 'Accept and collect' }}</Button>
    </Card>
  </div>
</template>
