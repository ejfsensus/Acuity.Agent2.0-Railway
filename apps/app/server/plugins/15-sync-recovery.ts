import { recoverInterruptedSync } from '../utils/sync-runner'

export default defineNitroPlugin(async () => {
  await recoverInterruptedSync()
})
