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
}

export const PaymentProviderKeys = {
  CHECKOUT: "checkout",
}
