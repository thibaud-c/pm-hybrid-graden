<script setup lang="ts">
import { ref } from 'vue'
import { Leaf, ShieldCheck } from 'lucide-vue-next'
import { PRIVACY_NOTICE } from '../privacyNotice'
import Button from './ui/Button.vue'
import Card from './ui/Card.vue'

const props = defineProps<{ purpose: 'collect' | 'stats'; loading?: boolean; error?: string }>()
const emit = defineEmits<{ submit: [code: string, privacyAcknowledged: boolean] }>()
const code = ref('')
const acknowledged = ref(false)

const submit = () => {
  if (!code.value.trim()) return
  emit('submit', code.value, acknowledged.value)
}
</script>

<template>
  <div class="fixed inset-0 z-50 grid place-items-center bg-black/45 p-4" role="dialog" aria-modal="true" aria-labelledby="access-title">
    <Card class="w-full max-w-md p-6">
      <div class="mb-5 flex size-12 items-center justify-center rounded-2xl bg-primary text-white"><Leaf /></div>
      <h1 id="access-title" class="text-2xl font-bold">Enter Access Code</h1>
      <p class="mt-2 text-sm text-muted-foreground">
        {{ purpose === 'collect' ? 'Your code selects the Collection Event and starts this browser’s private editing session.' : 'Your code selects the statistics you may view.' }}
      </p>
      <form class="mt-6 grid gap-4" @submit.prevent="submit">
        <div class="field">
          <label for="access-code">Access Code</label>
          <input id="access-code" v-model="code" class="control uppercase" autocomplete="off" autocapitalize="characters" required />
        </div>
        <label v-if="purpose === 'collect'" class="flex items-start gap-3 rounded-xl bg-muted p-3 text-sm leading-5">
          <input v-model="acknowledged" class="mt-1 size-4" type="checkbox" required />
          <span><strong class="mb-1 flex items-center gap-1.5"><ShieldCheck class="size-4" /> Share responsibly</strong>{{ PRIVACY_NOTICE }}</span>
        </label>
        <p v-if="error" class="text-sm font-medium text-destructive" role="alert">{{ error }}</p>
        <Button type="submit" :disabled="loading || !code.trim() || (purpose === 'collect' && !acknowledged)">
          {{ loading ? 'Checking…' : purpose === 'collect' ? 'Start collecting' : 'Open statistics' }}
        </Button>
      </form>
    </Card>
  </div>
</template>
