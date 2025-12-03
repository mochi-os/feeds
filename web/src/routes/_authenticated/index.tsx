import { createFileRoute } from '@tanstack/react-router'
import { Feeds } from '@/features/feeds'

export const Route = createFileRoute('/_authenticated/')({
  component: Feeds,
})
