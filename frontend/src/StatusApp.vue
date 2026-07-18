<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { ArrowLeft, CheckCircle2, CircleAlert, RefreshCw, XCircle } from 'lucide-vue-next'
import { systemStatus } from './api'
import Button from './components/ui/Button.vue'
import Card from './components/ui/Card.vue'

type State = Awaited<ReturnType<typeof systemStatus>>
const state = ref<State | null>(null)
const error = ref('')
const loading = ref(false)
const pagesBase = import.meta.env.BASE_URL

async function load() {
  loading.value = true
  error.value = ''
  try { state.value = await systemStatus() } catch (cause) { error.value = cause instanceof Error ? cause.message : 'Status unavailable' }
  finally { loading.value = false }
}

const icon = (status: string) => status === 'healthy' ? CheckCircle2 : status === 'degraded' ? CircleAlert : XCircle
onMounted(load)
</script>

<template>
  <main class="mx-auto min-h-dvh max-w-2xl p-4 safe-top safe-bottom">
    <a :href="pagesBase" class="mb-6 inline-flex items-center gap-2 text-sm font-semibold"><ArrowLeft class="size-4" /> Collection</a>
    <div class="flex items-start justify-between gap-4"><div><p class="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Public health check</p><h1 class="text-3xl font-bold">System Status</h1></div><Button variant="outline" size="icon" aria-label="Refresh" :disabled="loading" @click="load"><RefreshCw :class="loading && 'animate-spin'" /></Button></div>
    <p class="mt-2 text-muted-foreground">This page tests the API, a lightweight Supabase query, and access to the private Google Drive folder without exposing configuration details.</p>
    <p v-if="error" class="mt-6 rounded-xl bg-destructive p-4 text-white">{{ error }}</p>
    <div v-else-if="state" class="mt-8 grid gap-3">
      <Card class="flex items-center gap-3 p-4"><component :is="icon(state.status)" class="size-7" :class="state.status === 'healthy' ? 'text-primary' : 'text-destructive'" /><div><p class="text-sm text-muted-foreground">Overall</p><p class="text-xl font-bold capitalize">{{ state.status }}</p></div></Card>
      <Card v-for="(status, service) in state.services" :key="service" class="flex items-center justify-between p-4"><span class="font-semibold capitalize">{{ service === 'googleDrive' ? 'Google Drive' : service }}</span><span class="flex items-center gap-2 text-sm capitalize"><component :is="icon(status)" class="size-5" :class="status === 'healthy' ? 'text-primary' : 'text-destructive'" />{{ status }}</span></Card>
    </div>
  </main>
</template>
