import { createHmac, timingSafeEqual } from "crypto"

/**
 * Constant-time comparison to prevent timing attacks
 */
export function secureCompare(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false
  }

  try {
    return timingSafeEqual(Buffer.from(a), Buffer.from(b))
  } catch {
    return false
  }
}

/**
 * Verify webhook signature using HMAC-SHA256
 * @param rawPayload - The raw webhook payload as string
 * @param signature - The signature from Cko-Signature header
 * @param webhookSecretKey - The configured webhook secret key
 * @returns true if signature is valid
 */
export function verifyWebhookSignature(
  rawPayload: string | Buffer,
  signature: string | undefined,
  webhookSecretKey: string | undefined
): boolean {
  if (!signature) {
    console.error("Cko-Signature header missing")
    return false
  }

  if (!webhookSecretKey) {
    console.error("Webhook secret key not configured")
    return false
  }

  try {
    const hmac = createHmac("sha256", webhookSecretKey)
    hmac.update(rawPayload)
    const computedSignature = hmac.digest("hex")

    return secureCompare(computedSignature, signature)
  } catch (error) {
    console.error("Webhook signature verification failed:", error)
    return false
  }
}
