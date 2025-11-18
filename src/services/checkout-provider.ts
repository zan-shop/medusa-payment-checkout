import CheckoutBase from "../core/checkout-base.js"
import { PaymentProviderKeys } from "../types/index.js"

class CheckoutProviderService extends CheckoutBase {
  static identifier = PaymentProviderKeys.CHECKOUT

  constructor(_, options) {
    super(_, options)
  }
}

export default CheckoutProviderService
