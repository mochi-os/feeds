// Copyright © 2026 Mochisoft OÜ
// SPDX-License-Identifier: AGPL-3.0-only
// This file is part of Mochi, licensed under the GNU AGPL v3 with the
// Mochi Application Interface Exception - see license.txt and license-exception.md.
import { createFileRoute } from '@tanstack/react-router'
import { SharePage } from '@/features/feeds/pages'

// Another app's "Post to a feed": /feeds/share?text=&url=, which feedSharePath
// builds.
export const Route = createFileRoute('/_authenticated/share')({
  component: SharePage,
})
