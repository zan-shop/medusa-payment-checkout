export interface CheckoutOptions {
  /**
   * The secret key for Checkout.com API
   */
  secretKey: string
  /**
   * The public key for Checkout.com API
   */
  publicKey: string
  /**
   * Processing channel ID from Checkout.com (required for some merchants)
   */
  processingChannelId?: string
  /**
   * Webhook secret key for signature verification
   */
  webhookSecretKey?: string
}

export const PaymentProviderKeys = {
  CHECKOUT: "checkout",
}
