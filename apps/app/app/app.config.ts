export default defineAppConfig({
  app: {
    name: 'Acuity.Agent',
    description: 'Acuity Institute knowledge agent for creating pathways to wisdom.',
    tagline: 'Creating Pathways to Wisdom',
    domain: 'acuity.institute',
    icon: 'i-custom-acuity',
    repoUrl: 'https://github.com/vercel-labs/knowledge-agent-template',
    deployUrl: 'https://vercel.com/new',
  },
  ui: {
    colors: {
      primary: 'amber',
      neutral: 'neutral'
    },
    dashboardPanel: {
      slots: {
        root: 'min-h-[calc(100svh-1rem)]',
        body: 'sm:p-4 sm:gap-4'
      }
    },
    dashboardSidebar: {
      slots: {
        header: 'h-auto flex-col items-stretch gap-1.5 p-2',
        body: 'p-2 gap-1 overflow-hidden',
        footer: 'p-0',
        toggle: '-ms-1.5'
      }
    },
    dashboardNavbar: {
      slots: {
        root: 'sm:px-4 h-12',
        toggle: '-ms-1.5'
      }
    }
  }
})
