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
   * URL to redirect the customer to upon successful payment (for 3DS flows)
   */
  successUrl: string,
  /**
   * URL to redirect the customer to upon failed payment (for 3DS flows)
   */
  failureUrl: string,
  /**
   * Processing channel ID from Checkout.com (required for some merchants)
   */
  processingChannelId?: string
  /**
   * Webhook secret key for signature verification
   */
  webhookSecretKey?: string,
}

export const PaymentProviderKeys = {
  CHECKOUT: "checkout",
}

export type CheckoutPaymentData = {
  id?: string;
  token?: string;
  payment_id?: string;
  status?: string;
  redirect_url?: string;
  session_id?: string;
  amount?: number;
  currency?: string;
  customer_email?: string;
  approved?: boolean;
  _links?: any;
};
