<script setup lang="ts">
import { z } from 'zod'

const appConfig = useAppConfig()
const runtimeConfig = useRuntimeConfig()

definePageMeta({ layout: false, auth: 'guest' })

const ogImage = `${useRequestURL().origin}/acuity-portal.jpg`

useSeoMeta({
  title: 'Sign in',
  description: appConfig.app.description,
  ogTitle: appConfig.app.name,
  ogDescription: appConfig.app.description,
  ogImage,
  twitterImage: ogImage,
  twitterCard: 'summary_large_image',
})

const route = useRoute()
const loading = ref(false)
const githubLoading = ref(false)
const error = ref('')
const { signIn } = useUserSession()
const githubEnabled = computed(() => String(runtimeConfig.public.githubLoginEnabled) === 'true')

const oauthErrors: Record<string, string> = {
  access_denied: 'Access denied by GitHub.',
  server_error: 'GitHub encountered an error. Please try again.',
  temporarily_unavailable: 'GitHub is temporarily unavailable. Please try again later.',
}

onMounted(() => {
  const queryError = route.query.error as string | undefined
  if (queryError) {
    error.value = oauthErrors[queryError] || `Authentication error: ${queryError}`
  }
})

const state = reactive({ email: '', password: '' })

const signInSchema = z.object({
  email: z.email('Invalid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
})

const schema = signInSchema

async function onSubmit() {
  loading.value = true
  error.value = ''
  try {
    await signIn.email({ email: state.email, password: state.password })
    await navigateTo('/', { replace: true })
  } catch (e: any) {
    error.value = e?.data?.message || e?.message || 'Something went wrong. Please try again.'
  } finally {
    loading.value = false
  }
}

function onGitHub() {
  githubLoading.value = true
  signIn.social({ provider: 'github', callbackURL: '/' })
}
</script>

<template>
  <div class="flex min-h-dvh bg-default acuity-starfield">
    <div class="w-full lg:w-[46%] flex items-center justify-center p-5 sm:p-8 relative">
      <div class="absolute inset-0 acuity-portal-bg opacity-20 lg:hidden" />

      <div class="relative z-10 w-full max-w-md acuity-panel rounded-lg p-5 sm:p-8">
        <div class="text-center mb-8">
          <div class="inline-flex items-center justify-center mb-5">
            <UIcon :name="appConfig.app.icon" class="size-10 acuity-brand-mark" />
          </div>
          <p class="acuity-kicker text-[10px] mb-2">
            {{ appConfig.app.tagline }}
          </p>
          <h1 class="font-display text-3xl font-semibold text-highlighted">
            Welcome back
          </h1>
          <p class="mt-1.5 text-sm text-muted">
            Sign in to {{ appConfig.app.name }}.
          </p>
        </div>

        <template v-if="githubEnabled">
          <UButton
            label="Continue with GitHub"
            icon="i-simple-icons-github"
            color="neutral"
            variant="outline"
            block
            size="lg"
            :loading="githubLoading"
            @click="onGitHub"
          />

          <USeparator label="or" class="my-6" />
        </template>

        <UAlert
          v-if="error"
          color="error"
          variant="subtle"
          :title="error"
          icon="i-lucide-circle-alert"
          :close="{ color: 'error', variant: 'link' }"
          class="mb-4"
          @close="error = ''"
        />

        <UForm :schema :state class="space-y-4" @submit="onSubmit">
          <UFormField label="Email" name="email">
            <UInput v-model="state.email" type="email" placeholder="you@example.com" size="lg" class="w-full" />
          </UFormField>

          <UFormField label="Password" name="password">
            <UInput v-model="state.password" type="password" placeholder="••••••••" size="lg" class="w-full" />
          </UFormField>

          <UButton
            type="submit"
            label="Sign in"
            block
            size="lg"
            :loading
            class="shadow-[0_0_28px_rgba(250,219,95,.16)]"
          />
        </UForm>

        <UAlert
          class="mt-8"
          color="primary"
          variant="subtle"
          icon="i-custom-acuity"
          :title="appConfig.app.description"
          :ui="{ root: 'p-3', title: 'text-xs font-normal', icon: 'size-4' }"
        />

        <p class="mt-6 text-center text-xs text-dimmed font-display tracking-wide">
          {{ appConfig.app.domain }}
        </p>
      </div>
    </div>

    <div class="hidden lg:block flex-1 m-2 rounded-lg relative overflow-hidden acuity-portal-bg">
      <div class="absolute inset-0 bg-linear-to-l from-transparent via-[#030305]/10 to-[#030305]/80" />
      <div class="absolute left-12 bottom-12 max-w-xl">
        <p class="acuity-kicker text-xs mb-3">
          Acuity Institute
        </p>
        <h2 class="font-display text-5xl font-semibold leading-tight acuity-glow-text">
          Creating pathways to wisdom
        </h2>
      </div>
      <div class="absolute inset-0 rounded-lg shadow-[inset_0_4px_30px_rgba(0,0,0,0.5),inset_0_0_100px_rgba(0,0,0,0.42),inset_0_-2px_20px_rgba(250,219,95,0.18)] pointer-events-none" />
    </div>
  </div>
</template>
