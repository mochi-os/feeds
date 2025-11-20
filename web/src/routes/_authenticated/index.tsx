import { createFileRoute } from '@tanstack/react-router'
import { FeedsDashboard } from '@/features/feeds'

export const Route = createFileRoute('/_authenticated/')({
  component: FeedsDashboard,
})
