// Copyright © 2026 Mochisoft OÜ
// SPDX-License-Identifier: AGPL-3.0-only
// This file is part of Mochi, licensed under the GNU AGPL v3 with the
// Mochi Application Interface Exception - see license.txt and license-exception.md.

// What to put back when a change shown on the click is refused, for changes
// undone field by field rather than by restoring a whole cached list: the
// lists are written by other things while a request is out (a read mark on
// scroll, a reaction, a websocket fold), and those writes must stay.
//
// Two quick clicks on one thing send two requests. A refusal must not wipe a
// later click that is still waiting, and must not undo one the server has
// already taken:
// - refused with a later click still waiting: nothing changes on screen, and
//   the later click takes over what to put back if it is refused too
// - refused as the last click waiting: the value from before goes back
// - accepted: every earlier click on the thing has nothing left to undo
//
// The lib/web `optimistic` helper keeps the same order for whole snapshots.

export interface UndoStep<T> {
  /** What showed before this click. Only the first call counts, so a state
   * updater that runs twice is safe. */
  remember: (value: T) => void
  /** The server took the change. */
  accepted: () => void
  /** The server refused it: what to put back, or null to change nothing. */
  refused: () => { value: T } | null
}

export function undoChain<T>() {
  // The clicks still waiting on the server, per thing, oldest first.
  const waiting = new Map<string, Array<{ before?: { value: T } }>>()

  return (id: string): UndoStep<T> => {
    const entry: { before?: { value: T } } = {}
    const list = waiting.get(id) ?? []
    list.push(entry)
    waiting.set(id, list)
    const tidy = () => {
      if (!list.length && waiting.get(id) === list) waiting.delete(id)
    }

    return {
      remember: (value) => {
        entry.before ??= { value }
      },
      accepted: () => {
        const index = list.indexOf(entry)
        if (index < 0) return
        list.splice(0, index + 1)
        tidy()
      },
      refused: () => {
        const index = list.indexOf(entry)
        if (index < 0) return null
        list.splice(index, 1)
        const later = list[index]
        tidy()
        if (later) {
          later.before = entry.before
          return null
        }
        return entry.before ?? null
      },
    }
  }
}
