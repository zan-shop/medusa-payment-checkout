import { Checkout } from "checkout-sdk-node"
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
        customer: {
          email: customer.email || (context as any)?.email,
          name: customer.name || (context as any)?.name,
        },
        metadata: sessionData.metadata,
      }

      const payment: any = await this.checkout_.payments.request(paymentRequest)

      if (payment.approved) {
        return {
          status: PaymentSessionStatus.AUTHORIZED,
          data: {
            id: payment.id,
            status: payment.status,
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

  async capturePayment({
    data,
  }: CapturePaymentInput): Promise<CapturePaymentOutput> {
    try {
      const id = data.id as string
      const result: any = await this.checkout_.payments.capture(id, {
        amount: (data as any).amount,
      })

      return {
        data: {
          id: result.action_id,
          status: "Captured",
        } as unknown as Record<string, unknown>,
      }
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

  async getWebhookActionAndData(
    payload: ProviderWebhookPayload["payload"]
  ): Promise<WebhookActionResult> {
    const { data } = payload

    try {
      const eventType = data.type
      const eventData = data.data
      const currency = (eventData as any)?.currency

      switch (eventType) {
        case "payment_approved":
          return {
            action: PaymentActions.AUTHORIZED as any,
            data: {
              session_id: (eventData as any)?.metadata?.session_id,
              amount: new BigNumber(
                getAmountFromSmallestUnit((eventData as any)?.amount, currency)
              ),
            },
          }

        case "payment_captured":
          return {
            action: "captured" as any,
            data: {
              session_id: (eventData as any)?.metadata?.session_id,
              amount: new BigNumber(
                getAmountFromSmallestUnit((eventData as any)?.amount, currency)
              ),
            },
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

        case "payment_refunded":
          return {
            action: PaymentActions.CANCELED,
            data: {
              session_id: (eventData as any)?.metadata?.session_id,
              amount: new BigNumber(
                getAmountFromSmallestUnit((eventData as any)?.amount, currency)
              ),
            },
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
