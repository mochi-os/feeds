// Copyright © 2026 Mochisoft OÜ
// SPDX-License-Identifier: AGPL-3.0-only
// This file is part of Mochi, licensed under the GNU AGPL v3 with the
// Mochi Application Interface Exception - see license.txt and license-exception.md.
import { isInShell, isPermissionError, shellRequestPermission } from '@mochi/web'
import { feedsApi } from '@/api/feeds'
import type { ImportResponse } from '@/types'

// Add the people of the feed's imports who wait on a server. The server
// answers the permission it lacks, which the shell asks the user for, and
// allowing it tries again. Null when the user does not allow it.
export async function allowServer(
  feedId: string,
  server: string
): Promise<ImportResponse | null> {
  try {
    return await feedsApi.allowWaiting(feedId, server)
  } catch (err: unknown) {
    const permission = isPermissionError(
      (err as { response?: { data?: unknown } })?.response?.data
    )
    if (permission && !permission.restricted && isInShell()) {
      if ((await shellRequestPermission(permission.permission)) === 'granted') {
        return allowServer(feedId, server)
      }
      return null
    }
    throw err
  }
}

// Ask for each server an import left people waiting on, one after another:
// how many were added, whether more follow, and the servers still waited on.
export async function allowServers(
  feedId: string,
  servers: string[]
): Promise<{ added: number; more: boolean; waiting: string[] }> {
  let added = 0
  let more = false
  const waiting: string[] = []
  for (const server of servers) {
    const answer = await allowServer(feedId, server)
    if (answer) {
      added += answer.imported
      more = more || answer.more
    } else {
      waiting.push(server)
    }
  }
  return { added, more, waiting }
}
