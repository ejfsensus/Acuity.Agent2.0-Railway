<script setup lang="ts">
const appConfig = useAppConfig()
const colorMode = useColorMode()

const color = computed(() => colorMode.value === 'dark' ? '#030305' : '#030305')

useSnapshotSync()

useHead({
  meta: [
    { charset: 'utf-8' },
    { name: 'viewport', content: 'width=device-width, initial-scale=1' },
    { key: 'theme-color', name: 'theme-color', content: color },
    { name: 'apple-mobile-web-app-title', content: 'Agent' },
    { name: 'apple-mobile-web-app-capable', content: 'yes' },
  ],
  link: [
    { rel: 'icon', href: '/favicon.ico', sizes: '48x48' },
    { rel: 'icon', type: 'image/png', sizes: '32x32', href: '/favicon-32.png' },
    { rel: 'apple-touch-icon', href: '/apple-touch-icon.png' },
    { rel: 'manifest', href: '/site.webmanifest' },
  ],
  htmlAttrs: {
    lang: 'en',
  },
})

useHead({
  titleTemplate: `%s - ${appConfig.app.name}`
})

const ogImage = `${useRequestURL().origin}/acuity-portal.jpg`

useSeoMeta({
  title: appConfig.app.name,
  description: appConfig.app.description,
  ogTitle: appConfig.app.name,
  ogDescription: appConfig.app.description,
  ogImage,
  twitterImage: ogImage,
  twitterCard: 'summary_large_image',
})
</script>

<template>
  <UApp :toaster="{ position: 'top-right' }" :tooltip="{ delayDuration: 200 }">
    <NuxtLoadingIndicator color="var(--ui-text-highlighted)" />

    <NuxtLayout>
      <NuxtPage />
    </NuxtLayout>
  </UApp>
</template>
