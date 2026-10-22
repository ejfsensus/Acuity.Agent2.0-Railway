<script setup lang="ts">
definePageMeta({ auth: 'user' })

useSeoMeta({ title: 'New chat' })

const appConfig = useAppConfig()
const { loggedIn } = useUserSession()
const input = ref('')
const loading = ref(false)
const chatId = crypto.randomUUID()

const { model } = useModels()
const { mode } = useChatMode()

const {
  dropzoneRef,
  isDragging,
  files,
  isUploading,
  uploadedFiles,
  addFiles,
  removeFile,
  clearFiles
} = useFileUploadWithStatus(chatId)

async function createChat(prompt: string) {
  if (!loggedIn.value) {
    await navigateTo('/login')
    return
  }

  input.value = prompt
  loading.value = true

  const parts: Array<{ type: string, text?: string, mediaType?: string, url?: string }> = [{ type: 'text', text: prompt }]

  if (uploadedFiles.value.length > 0) {
    parts.push(...uploadedFiles.value)
  }

  const chat = await $fetch('/api/chats', {
    method: 'POST',
    body: {
      id: chatId,
      mode: mode.value,
      message: {
        role: 'user',
        parts
      }
    }
  })

  refreshNuxtData('chats')
  navigateTo(`/chat/${chat?.id}`)
}

async function onSubmit() {
  await createChat(input.value)
  clearFiles()
}

const chatQuickChats = [
  {
    label: 'Synthesize the most important insight from the current knowledge base',
    icon: 'i-lucide-sparkles'
  },
  {
    label: 'Trace the relationship between wisdom, practice, and transformation',
    icon: 'i-lucide-route'
  },
  {
    label: 'Find source passages that support a talk on pathways to wisdom',
    icon: 'i-lucide-search'
  },
  {
    label: 'Create a concise briefing for Ethan James Farrell',
    icon: 'i-lucide-file-text'
  },
  {
    label: 'Compare two themes across the available documents',
    icon: 'i-lucide-git-compare'
  },
  {
    label: 'Draft a response in the Acuity Institute voice',
    icon: 'i-lucide-pen-line'
  }
]

const adminQuickChats = [
  {
    label: 'Chart the daily token usage by model over the last 30 days',
    icon: 'i-custom-chart'
  },
  {
    label: 'Show app health: error rate, latency p95, and slowest endpoints',
    icon: 'i-lucide-activity'
  },
  {
    label: 'Are there any production errors in the last 24h? Show the trend',
    icon: 'i-lucide-alert-triangle'
  },
  {
    label: 'Chart active users and message volume over the last 14 days',
    icon: 'i-custom-users'
  },
  {
    label: 'What are the top 10 most-hit endpoints and their avg latency?',
    icon: 'i-lucide-zap'
  },
  {
    label: 'Show usage stats for the last 7 days with a cost breakdown chart',
    icon: 'i-lucide-coins'
  }
]

const quickChats = computed(() => mode.value === 'admin' ? adminQuickChats : chatQuickChats)
</script>

<template>
  <UDashboardPanel id="home" :ui="{ body: 'p-0 sm:p-0' }">
    <template #header>
      <DashboardNavbar />
    </template>

    <template #body>
      <DragDropOverlay :show="isDragging" />
      <div class="relative flex-1 flex min-h-0 overflow-hidden acuity-starfield">
        <div class="absolute inset-0 acuity-portal-bg opacity-50 md:opacity-70" />
        <div class="acuity-orbit" />

        <UContainer ref="dropzoneRef" class="relative z-10 flex-1 flex flex-col justify-center gap-5 sm:gap-7 py-10">
          <div class="max-w-3xl">
            <div class="mb-5 flex items-center gap-3">
              <UIcon :name="appConfig.app.icon" class="size-9 acuity-brand-mark" />
              <div>
                <p class="acuity-kicker text-[10px] sm:text-xs">
                  {{ appConfig.app.tagline }}
                </p>
                <p class="font-display text-sm text-[#D4AF37]">
                  {{ appConfig.app.domain }}
                </p>
              </div>
            </div>

            <h1 class="font-display text-4xl sm:text-6xl font-semibold leading-[1.02] acuity-glow-text">
              Ask {{ appConfig.app.name }}
            </h1>
            <p class="mt-4 max-w-2xl text-base sm:text-lg text-muted">
              Search, reason, and compose from the Acuity Institute knowledge base.
            </p>
          </div>

          <UChatPrompt
            v-model="input"
            :status="loading ? 'streaming' : 'ready'"
            :disabled="isUploading"
            class="[view-transition-name:chat-prompt] acuity-prompt max-w-3xl"
            variant="subtle"
            :ui="{ base: 'px-1.5' }"
            @submit="onSubmit"
          >
            <template v-if="files.length > 0" #header>
              <div class="flex flex-wrap gap-2">
                <FileAvatar
                  v-for="fileWithStatus in files"
                  :key="fileWithStatus.id"
                  :name="fileWithStatus.file.name"
                  :type="fileWithStatus.file.type"
                  :preview-url="fileWithStatus.previewUrl"
                  :status="fileWithStatus.status"
                  :error="fileWithStatus.error"
                  removable
                  @remove="removeFile(fileWithStatus.id)"
                />
              </div>
            </template>

            <template #footer>
              <div class="flex items-center gap-1">
                <FileUploadButton @files-selected="addFiles($event)" />
                <ModelSelect v-model="model" />
              </div>

              <UChatPromptSubmit size="sm" :disabled="isUploading" />
            </template>
          </UChatPrompt>

          <div class="grid grid-cols-1 sm:grid-cols-2 gap-2 max-w-3xl">
            <UButton
              v-for="quickChat in quickChats"
              :key="quickChat.label"
              :icon="quickChat.icon"
              :label="quickChat.label"
              size="sm"
              color="neutral"
              variant="outline"
              class="justify-start text-left h-auto py-2 border-[#FADB5F]/25 bg-[#030305]/45 hover:bg-[#1A2235]/70"
              @click="createChat(quickChat.label)"
            />
          </div>
        </UContainer>
      </div>
    </template>
  </UDashboardPanel>
</template>
