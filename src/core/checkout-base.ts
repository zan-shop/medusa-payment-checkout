const { Checkout } = require('checkout-sdk-node');
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
  isDefined,
  isPresent,
  MedusaError,
  PaymentActions,
  PaymentSessionStatus,
} from "@medusajs/framework/utils"
import { CheckoutOptions, CheckoutPaymentData } from "../types/index"
import {
  getAmountFromSmallestUnit,
  getSmallestUnit,
} from "../utils/get-smallest-unit"
import { verifyWebhookSignature } from "../utils/webhook-signature"

abstract class CheckoutBase extends AbstractPaymentProvider<CheckoutOptions> {
  protected readonly options_: CheckoutOptions
  protected checkout_: typeof Checkout
  protected container_: Record<string, unknown>

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
    const id = input?.data?.id as string
    
    if (!id) {
      throw this.buildError(
        "No payment intent ID provided while getting payment status",
        new Error("No payment intent ID provided")
      )
    }

    const payment = await this.checkout_.payments.get(id)
    const statusResponse = this.getStatus(payment)

    return statusResponse as unknown as GetPaymentStatusOutput
  }

  async initiatePayment({
    currency_code,
    amount,
    data,
    context,
  }: InitiatePaymentInput): Promise<InitiatePaymentOutput> {
    // Simulate a payment session creation because Checkout.com does not have this concept
    // amount in smallest unit and currency in upepercase because checkout require that
    const sessionData = {
      amount: getSmallestUnit(amount, currency_code),
      currency: currency_code.toUpperCase(),
      status: "Pending",
      customer_email: (context as any)?.email || (context as any)?.customer?.email,
    }

    return {
      id: crypto.randomUUID(), // Checkout doesn't have the concept of payment sessions, so we generate a UUID
      ...(this.getStatus(
        sessionData as unknown as CheckoutPaymentData
      ) as unknown as Pick<InitiatePaymentOutput, "data" | "status">),
    }
  }

  async authorizePayment(
    input: AuthorizePaymentInput
  ): Promise<AuthorizePaymentOutput> {
    const { data, context } = input
    const sessionData = data as any

    const amount = sessionData.amount
    const currency = sessionData.currency
    const token = (context as any)?.token || sessionData.token

    if (!amount || !currency || !token) {
      throw new MedusaError(
        MedusaError.Types.PAYMENT_AUTHORIZATION_ERROR,
        "Missing required payment data, amount, currency, and token"
      )
    }

    try {
      const cartId = (context as any)?.cart_id
      const sessionId = (data as any)?.id
      const paymentRequest: any = {
        source: { type: "token", token: token },
        amount,
        currency,
        capture: false, // Authorization only - capture will be done separately by Medusa, Mercur automatically captures on authorization
        reference: cartId || sessionId,
        metadata: {
          cart_id: cartId,
          session_id: sessionId,
        },
      }

      if (this.options_.processingChannelId) {
        paymentRequest.processing_channel_id = this.options_.processingChannelId
      }

      const payment: any = await this.checkout_.payments.request(paymentRequest)

      return this.getStatus(payment) as unknown as AuthorizePaymentOutput
    } catch (error: any) {
      if (error instanceof MedusaError) {
        throw error
      }

      const errorMessage = error.body?.error_type || error.body?.message || error.message
      throw new MedusaError(
        MedusaError.Types.PAYMENT_AUTHORIZATION_ERROR,
        `Checkout.com error: ${errorMessage}`
      )
    }
  }

  async cancelPayment({
    data,
  }: CancelPaymentInput): Promise<CancelPaymentOutput> {
    const id = data?.id as string
    
    if (!id) {
      return { data }
    }

    try {
      const payment = await this.checkout_.payments.void(id)
      return { data: payment as unknown as Record<string, unknown> }
    } catch (error: any) {
      throw this.buildError("An error occurred in cancelPayment", error)
    }
  }

  async capturePayment({
    data,
  }: CapturePaymentInput): Promise<CapturePaymentOutput> {
    const id = data?.id as string

    try {
      const payment = await this.checkout_.payments.capture(id)
      
      return { data: payment as unknown as Record<string, unknown> }
    } catch (error: any) {
      throw this.buildError("An error occurred in capturePayment", error)
    }
  }

  async deletePayment(
    input: DeletePaymentInput
  ): Promise<DeletePaymentOutput> {
    return await this.cancelPayment(input)
  }

  async refundPayment({
    amount,
    data,
  }: RefundPaymentInput): Promise<RefundPaymentOutput> {
    const id = data?.id as string
    if (!id) {
      throw this.buildError(
        "No payment ID provided while refunding payment",
        new Error("No payment ID provided")
      )
    }

    try {
      const currencyCode = data?.currency as string
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
      const id = data?.id as string
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
    const amountNumeric = getSmallestUnit(amount, currency_code)
    if (isPresent(amount) && data?.amount === amountNumeric) {
      return this.getStatus(
        data as unknown as CheckoutPaymentData
      ) as unknown as UpdatePaymentOutput
    }

    const updatedData = {
      ...data,
      amount: amountNumeric,
      currency: currency_code?.toUpperCase(),
    }

    return {
      data: updatedData as Record<string, unknown>,
      status: PaymentSessionStatus.PENDING,
    }
  }

  async getWebhookActionAndData(
    payload: ProviderWebhookPayload["payload"]
  ): Promise<WebhookActionResult> {
    const { data, rawData, headers } = payload

    // Security: Verify webhook signature
    const signature = (headers as any)?.["cko-signature"] || (headers as any)?.["Cko-Signature"]
    
    if (!verifyWebhookSignature(rawData, signature, this.options_.webhookSecretKey)) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "Invalid webhook signature. Request rejected for security."
      )
    }

    const eventType = data.type
    const eventData = data.data
    const currency = (eventData as any)?.currency
    const amount = (eventData as any)?.amount
    const paymentId = (eventData as any)?.id
    const sessionId = (eventData as any)?.metadata?.session_id || (eventData as any)?.reference || paymentId || ""

    switch (eventType) {
      case "payment_approved":
        return {
          action: PaymentActions.AUTHORIZED,
          data: {
            id: sessionId,
            amount: getAmountFromSmallestUnit((eventData as any)?.amount || 0, currency),
          } as any,
        }

      case "payment_captured": 
      case "payment_paid":
        return {
          action: PaymentActions.SUCCESSFUL,
          data: {
            session_id: sessionId,
            amount: getAmountFromSmallestUnit(amount, currency),
          } as any,
        }
      
      case "payment_pending":
      case "payment_capture_pending":
      case "payment_retry_scheduled":
        return {
          action: PaymentActions.PENDING,
          data: {
            session_id: sessionId,
            amount: getAmountFromSmallestUnit(amount, currency),
          } as any,
        }

      case "payment_compliance_review":
      case "payment_instrument_verification_failed":
        return {
          action: PaymentActions.REQUIRES_MORE,
          data: {
            session_id: sessionId,
            amount: getAmountFromSmallestUnit(amount, currency),
          } as any,
        }

      case "payment_declined":
      case "payment_capture_declined":
      case "payment_refund_declined":
      case "payment_void_declined":
      case "payment_authorization_increment_declined":
      case "payment_expired":
        return {
          action: PaymentActions.FAILED,
          data: {
            session_id: sessionId,
            amount: getAmountFromSmallestUnit(amount, currency),
          } as any,
        }

      case "payment_canceled":
      case "payment_voided":
        return {
          action: PaymentActions.CANCELED,
          data: {
            session_id: sessionId,
            amount: getAmountFromSmallestUnit(amount, currency),
          } as any,
        }

      default:
        return { action: PaymentActions.NOT_SUPPORTED }
    }
  }
  
  private getStatus(payment: CheckoutPaymentData): {
    data: CheckoutPaymentData
    status: PaymentSessionStatus
  } {
    switch (payment.status) {
      case "Pending":
        return { status: PaymentSessionStatus.PENDING, data: payment }
      case "Authorized":
        return { status: PaymentSessionStatus.AUTHORIZED, data: payment }
      case "Captured":
      case "Paid":
        return { status: PaymentSessionStatus.CAPTURED, data: payment }
      case "Voided":
      case "Declined":
      case "Canceled":
        return { status: PaymentSessionStatus.CANCELED, data: payment }
      default:
        return { status: PaymentSessionStatus.PENDING, data: payment }
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
