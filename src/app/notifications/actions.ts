"use server"

import {
  deletePushSubscription,
  markNotificationSeen,
  savePushSubscription,
  type PushSubscriptionInput,
} from "@/lib/data/notifications"
import type { Result } from "@/lib/data/result"
import { createClient } from "@/lib/supabase/server"

/** Avisos por cercanía desde la UI. La lógica vive en `src/lib/data/notifications.ts`. */

export async function subscribePush(input: PushSubscriptionInput): Promise<Result<null>> {
  return savePushSubscription(await createClient(), input)
}

export async function unsubscribePush(endpoint: string): Promise<Result<null>> {
  return deletePushSubscription(await createClient(), endpoint)
}

export async function markSeen(id: string): Promise<Result<null>> {
  return markNotificationSeen(await createClient(), id)
}
