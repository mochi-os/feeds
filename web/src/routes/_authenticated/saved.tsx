import { createFileRoute } from '@tanstack/react-router'
import { SavedPage } from '@/features/feeds/pages'

export const Route = createFileRoute('/_authenticated/saved')({
  component: SavedPage,
})
