<script setup lang="ts">
import { RefreshCw } from 'lucide-vue-next'
import Button from './ui/Button.vue'
import Card from './ui/Card.vue'

defineProps<{ message: string }>()
defineEmits<{ retry: [] }>()
</script>

<template>
  <div class="fixed inset-0 z-50 grid place-items-center bg-black/45 p-4" role="alertdialog" aria-modal="true" aria-labelledby="retry-title">
    <Card class="w-full max-w-sm p-6">
      <h1 id="retry-title" class="text-xl font-bold">Service temporarily unavailable</h1>
      <p class="mt-2 text-sm text-muted-foreground">{{ message }} Your access is still saved in this browser.</p>
      <Button class="mt-5 w-full" @click="$emit('retry')"><RefreshCw class="size-4" /> Retry</Button>
    </Card>
  </div>
</template>
