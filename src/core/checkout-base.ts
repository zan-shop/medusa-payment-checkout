import { Checkout } from "checkout-sdk-node"
import { createHmac } from "crypto"
import type {
  AuthorizePaymentInput,
  AuthorizePaymentOutput,
  CancelPaymentInput,
  CancelPaymentOutput,
  CapturePaymentInput,
  CapturePaymentOutput,
  DeletePaymentInput,
  DeletePaymentOutput,
  GetPaymentStatusInput,
  GetPaymentStatusOutput,
  InitiatePaymentInput,
  InitiatePaymentOutput,
  ProviderWebhookPayload,
  RefundPaymentInput,
  RefundPaymentOutput,
  RetrievePaymentInput,
  RetrievePaymentOutput,
  UpdatePaymentInput,
  UpdatePaymentOutput,
  WebhookActionResult,
} from "@medusajs/framework/types"
import {
  AbstractPaymentProvider,
  BigNumber,
  isDefined,
  isPresent,
  MedusaError,
  PaymentActions,
  PaymentSessionStatus,
} from "@medusajs/framework/utils"
import { CheckoutOptions } from "../types/index.js"
import {
  getAmountFromSmallestUnit,
  getSmallestUnit,
} from "../utils/get-smallest-unit.js"

abstract class CheckoutBase extends AbstractPaymentProvider<CheckoutOptions> {
  protected readonly options_: CheckoutOptions
  protected checkout_: Checkout
  protected container_: Record<string, unknown>
  protected processedPaymentIds_: Set<string> = new Set()

  static validateOptions(options: CheckoutOptions): void {
    if (!isDefined(options.secretKey)) {
      throw new Error(
        "Required option `secretKey` is missing in Checkout.com plugin"
      )
    }
    if (!isDefined(options.publicKey)) {
      throw new Error(
        "Required option `publicKey` is missing in Checkout.com plugin"
      )
    }
  }

  protected constructor(
    cradle: Record<string, unknown>,
    options: CheckoutOptions
  ) {
    // @ts-ignore
    super(...arguments)

    this.container_ = cradle
    this.options_ = options

    this.checkout_ = new Checkout(options.secretKey, {
      pk: options.publicKey,
    })
  }

  get options(): CheckoutOptions {
    return this.options_
  }

  async getPaymentStatus(
    input: GetPaymentStatusInput
  ): Promise<GetPaymentStatusOutput> {
    const { data } = input
    const id = data.id as string

    try {
      const payment: any = await this.checkout_.payments.get(id)
      return {
        status: this.mapCheckoutStatusToMedusa(payment.status),
      }
    } catch (error: any) {
      throw this.buildError("Failed to get payment status", error)
    }
  }

  async initiatePayment({
    currency_code,
    amount,
    data,
    context,
  }: InitiatePaymentInput): Promise<InitiatePaymentOutput> {
    const sessionData = {
      amount: getSmallestUnit(amount, currency_code),
      currency: currency_code.toUpperCase(),
      token: (data as any)?.token,
      customer: {
        email: (context as any)?.customer?.email || (context as any)?.email,
        name: (context as any)?.customer?.name,
      },
      metadata: {
        session_id: (context as any)?.session_id,
        cart_id: (context as any)?.cart_id,
      },
    }

    return {
      id: `temp_${Date.now()}`,
      data: sessionData as unknown as Record<string, unknown>,
    }
  }

  async authorizePayment(
    input: AuthorizePaymentInput
  ): Promise<AuthorizePaymentOutput> {
    const { data, context } = input
    const sessionData = data as any

    const amount = sessionData.amount
    const currency = sessionData.currency
    const paymentToken = sessionData.token

    if (!amount || !currency) {
      throw new MedusaError(
        MedusaError.Types.PAYMENT_AUTHORIZATION_ERROR,
        `Missing required payment data: amount=${amount}, currency=${currency}`
      )
    }

    if (!paymentToken) {
      throw new MedusaError(
        MedusaError.Types.PAYMENT_AUTHORIZATION_ERROR,
        "Missing payment token"
      )
    }

    try {
      const customer = sessionData.customer || {}
      
      const paymentRequest: any = {
        processing_channel_id: this.options_.processingChannelId,
        source: {
          type: "token",
          token: paymentToken,
        },
        amount,
        currency,
        capture: false, // Authorization only - capture will be done separately by Medusa
        customer: {
          email: customer.email || (context as any)?.email,
          name: customer.name || (context as any)?.name,
        },
        metadata: sessionData.metadata,
      }

      const payment: any = await this.checkout_.payments.request(paymentRequest)

      // Security: Verify payment amount matches
      if (payment.amount !== amount) {
        throw new MedusaError(
          MedusaError.Types.PAYMENT_AUTHORIZATION_ERROR,
          `Payment amount mismatch: expected ${amount}, got ${payment.amount}`
        )
      }

      // Security: Verify currency matches
      if (payment.currency?.toUpperCase() !== currency?.toUpperCase()) {
        throw new MedusaError(
          MedusaError.Types.PAYMENT_AUTHORIZATION_ERROR,
          `Currency mismatch: expected ${currency}, got ${payment.currency}`
        )
      }

      // Security: Check for idempotency - prevent duplicate processing
      if (payment.id && this.processedPaymentIds_.has(payment.id)) {
        throw new MedusaError(
          MedusaError.Types.PAYMENT_AUTHORIZATION_ERROR,
          `Payment ${payment.id} has already been processed`
        )
      }

      // Security: Verify payment is actually approved and authorized
      if (payment.approved && payment.status === "Authorized") {
        // Mark as processed
        if (payment.id) {
          this.processedPaymentIds_.add(payment.id)
        }

        return {
          status: PaymentSessionStatus.AUTHORIZED,
          data: {
            id: payment.id,
            status: payment.status,
            amount: payment.amount,
            currency: payment.currency,
            approved: payment.approved,
          } as unknown as Record<string, unknown>,
        }
      }

      if (payment.status === "Pending") {
        return {
          status: PaymentSessionStatus.PENDING,
          data: {
            id: payment.id,
            status: payment.status,
            redirect_url: payment._links?.redirect?.href,
            _links: payment._links,
          } as unknown as Record<string, unknown>,
        }
      }

      throw new MedusaError(
        MedusaError.Types.PAYMENT_AUTHORIZATION_ERROR,
        `Payment authorization failed: ${payment.response_summary ?? payment.status}`
      )
    } catch (error: any) {
      throw new MedusaError(
        MedusaError.Types.PAYMENT_AUTHORIZATION_ERROR,
        `Payment authorization error: ${error.message}`
      )
    }
  }

  async cancelPayment({
    data,
  }: CancelPaymentInput): Promise<CancelPaymentOutput> {
    try {
      const id = data.id as string
      if (!id) {
        return { data }
      }

      const result: any = await this.checkout_.payments.void(id)
      return {
        data: {
          id: result.action_id,
          status: "Canceled",
        } as unknown as Record<string, unknown>,
      }
    } catch (error: any) {
      throw this.buildError("An error occurred in cancelPayment", error)
    }
  }

  async capturePayment(
    input: CapturePaymentInput
  ): Promise<CapturePaymentOutput> {
    const { data } = input
    const amount = (input as any).amount
    const currency_code = (input as any).currency_code
    
    try {
      const id = (data as any)?.id as string
      
      if (!id) {
        throw new Error("Missing payment id for capture")
      }

      let captureAmount: number
      
      if (amount !== undefined && amount !== null) {
        const currency = currency_code || (data as any)?.currency || (data as any)?.currency_code
        if (!currency) {
          throw new Error("Currency is required to convert capture amount")
        }
        captureAmount = getSmallestUnit(amount, currency)
      } else if ((data as any)?.amount !== undefined) {
        captureAmount = (data as any).amount
      } else {
        throw new Error("Missing amount for capture")
      }

      if (!Number.isInteger(captureAmount) || captureAmount <= 0) {
        throw new Error(
          `Invalid capture amount: ${captureAmount}. Must be a positive integer in smallest currency unit.`
        )
      }

      try {
        const paymentStatus: any = await this.checkout_.payments.get(id)

        if (paymentStatus.status === "Captured") {
          return {
            data: {
              id: paymentStatus.id,
              status: "Captured",
            } as unknown as Record<string, unknown>,
          }
        }

        if (paymentStatus.status !== "Authorized") {
          throw new Error(
            `Cannot capture payment with status: ${paymentStatus.status}. Payment must be in "Authorized" status to capture.`
          )
        }
      } catch (statusError: any) {
        if (statusError?.message?.includes("already captured") || statusError?.message?.includes("Captured")) {
          return {
            data: {
              id: id,
              status: "Captured",
            } as unknown as Record<string, unknown>,
          }
        }
      }

      const captureRequest: any = { amount: captureAmount }
      
      if ((data as any)?.reference) {
        captureRequest.reference = (data as any).reference
      }

      const result: any = await this.checkout_.payments.capture(id, captureRequest)

      return {
        data: {
          id: result.action_id ?? result.id,
          status: "Captured",
        } as unknown as Record<string, unknown>,
      }
    } catch (error: any) {
      const errorCodes = error?.body?.error_codes || error?.error_codes || []
      if (errorCodes.includes('no_balance_remaining_to_capture')) {
        return {
          data: {
            id: (data as any)?.id,
            status: "Captured",
          } as unknown as Record<string, unknown>,
        }
      }
      
      throw this.buildError(
        `An error occurred in capturePayment (payment: ${(data as any)?.id})`,
        error
      )
    }
  }

  async deletePayment(
    input: DeletePaymentInput
  ): Promise<DeletePaymentOutput> {
    return await this.cancelPayment(input)
  }

  async refundPayment({
    data,
    amount,
  }: RefundPaymentInput): Promise<RefundPaymentOutput> {
    const id = data.id as string
    if (!id) {
      throw this.buildError(
        "No payment ID provided while refunding payment",
        new Error("No payment ID provided")
      )
    }

    try {
      const currencyCode = data.currency as string
      await this.checkout_.payments.refund(id, {
        amount: getSmallestUnit(amount, currencyCode),
      })
    } catch (error: any) {
      throw this.buildError("An error occurred in refundPayment", error)
    }

    return { data }
  }

  async retrievePayment({
    data,
  }: RetrievePaymentInput): Promise<RetrievePaymentOutput> {
    try {
      const id = data.id as string
      const payment: any = await this.checkout_.payments.get(id)

      payment.amount = getAmountFromSmallestUnit(payment.amount, payment.currency)

      return { data: payment as unknown as Record<string, unknown> }
    } catch (error: any) {
      throw this.buildError("An error occurred in retrievePayment", error)
    }
  }

  async updatePayment({
    data,
    context,
    amount,
    currency_code,
  }: UpdatePaymentInput): Promise<UpdatePaymentOutput> {
    const amountInSmallestUnit = getSmallestUnit(amount, currency_code)
    
    if (isPresent(amount) && (data as any)?.amount === amountInSmallestUnit) {
      return {
        data,
        status: PaymentSessionStatus.PENDING,
      }
    }

    const newToken = (context as any)?.token
    const updatedData = {
      ...data,
      token: newToken || (data as any)?.token,
      amount: amountInSmallestUnit,
      currency: currency_code?.toUpperCase(),
    }

    return {
      data: updatedData as Record<string, unknown>,
      status: PaymentSessionStatus.PENDING,
    }
  }

  /**
   * Verify webhook signature using HMAC-SHA256
   * @param payload - The raw webhook payload as string
   * @param signature - The signature from Cko-Signature header
   * @returns true if signature is valid
   */
  protected verifyWebhookSignature(
    payload: string,
    signature: string | undefined
  ): boolean {
    if (!signature) {
      return false
    }

    try {
      const hmac = createHmac("sha256", this.options_.webhookSecretKey)
      hmac.update(payload)
      const expectedSignature = hmac.digest("hex")

      // Constant-time comparison to prevent timing attacks
      return this.secureCompare(signature, expectedSignature)
    } catch (error) {
      console.error("Webhook signature verification failed:", error)
      return false
    }
  }

  /**
   * Constant-time string comparison to prevent timing attacks
   */
  protected secureCompare(a: string, b: string): boolean {
    if (a.length !== b.length) {
      return false
    }

    let result = 0
    for (let i = 0; i < a.length; i++) {
      result |= a.charCodeAt(i) ^ b.charCodeAt(i)
    }
    return result === 0
  }

  async getWebhookActionAndData(
    payload: ProviderWebhookPayload["payload"]
  ): Promise<WebhookActionResult> {
    const { data, rawData, headers } = payload

    // Security: Verify webhook signature
    const signature = (headers as any)?.["cko-signature"] || (headers as any)?.["Cko-Signature"]
    const payloadString = typeof rawData === "string" ? rawData : JSON.stringify(data)
    
    if (!this.verifyWebhookSignature(payloadString, signature)) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "Invalid webhook signature. Request rejected for security."
      )
    }

    try {
      const eventType = data.type
      const eventData = data.data
      const currency = (eventData as any)?.currency
      const paymentId = (eventData as any)?.id

      // Security: Check idempotency - prevent duplicate webhook processing
      if (paymentId && this.processedPaymentIds_.has(`webhook_${paymentId}_${eventType}`)) {
        console.warn(`Webhook already processed: ${paymentId} - ${eventType}`)
        return {
          action: PaymentActions.NOT_SUPPORTED,
          data: {
            session_id: (eventData as any)?.metadata?.session_id,
            amount: new BigNumber(0),
          },
        }
      }

      // Mark webhook as processed
      if (paymentId) {
        this.processedPaymentIds_.add(`webhook_${paymentId}_${eventType}`)
      }

      switch (eventType) {
        case "payment_approved": {
          const amount = (eventData as any)?.amount
          const sessionId = (eventData as any)?.metadata?.session_id

          // Security: Verify payment has valid amount
          if (!amount || amount <= 0) {
            throw new MedusaError(
              MedusaError.Types.INVALID_DATA,
              "Invalid payment amount in webhook"
            )
          }

          return {
            action: PaymentActions.AUTHORIZED as any,
            data: {
              session_id: sessionId,
              amount: new BigNumber(
                getAmountFromSmallestUnit(amount, currency)
              ),
            },
          }
        }

        case "payment_captured": {
          const amount = (eventData as any)?.amount
          const sessionId = (eventData as any)?.metadata?.session_id

          // Security: Verify payment has valid amount
          if (!amount || amount <= 0) {
            throw new MedusaError(
              MedusaError.Types.INVALID_DATA,
              "Invalid payment amount in webhook"
            )
          }

          return {
            action: "captured" as any,
            data: {
              session_id: sessionId,
              amount: new BigNumber(
                getAmountFromSmallestUnit(amount, currency)
              ),
            },
          }
        }

        case "payment_declined":
        case "payment_canceled":
          return {
            action: PaymentActions.FAILED,
            data: {
              session_id: (eventData as any)?.metadata?.session_id,
              amount: new BigNumber(
                getAmountFromSmallestUnit((eventData as any)?.amount || 0, currency)
              ),
            },
          }

        case "payment_refunded": {
          const amount = (eventData as any)?.amount
          const sessionId = (eventData as any)?.metadata?.session_id

          // Security: Verify refund has valid amount
          if (!amount || amount <= 0) {
            throw new MedusaError(
              MedusaError.Types.INVALID_DATA,
              "Invalid refund amount in webhook"
            )
          }

          return {
            action: PaymentActions.CANCELED,
            data: {
              session_id: sessionId,
              amount: new BigNumber(
                getAmountFromSmallestUnit(amount, currency)
              ),
            },
          }
        }

        default:
          return {
            action: PaymentActions.NOT_SUPPORTED,
            data: {
              session_id: "",
              amount: new BigNumber(0),
            },
          }
      }
    } catch (e) {
      return {
        action: PaymentActions.FAILED,
        data: {
          session_id: (data as any)?.metadata?.session_id || "",
          amount: new BigNumber(0),
        },
      }
    }
  }

  protected mapCheckoutStatusToMedusa(status: string): PaymentSessionStatus {
    switch (status) {
      case "Authorized":
        return PaymentSessionStatus.AUTHORIZED
      case "Captured":
        return PaymentSessionStatus.CAPTURED
      case "Pending":
        return PaymentSessionStatus.PENDING
      case "Declined":
      case "Canceled":
        return PaymentSessionStatus.CANCELED
      default:
        return PaymentSessionStatus.PENDING
    }
  }

  protected buildError(message: string, error: any): Error {
    return new MedusaError(
      MedusaError.Types.UNEXPECTED_STATE,
      `${message}: ${error.message ?? error}`
    )
  }
}

export default CheckoutBase
