import CheckoutBase from "../core/checkout-base"
import { PaymentProviderKeys } from "../types/index"

class CheckoutProviderService extends CheckoutBase {
  static identifier = PaymentProviderKeys.CHECKOUT

  constructor(_, options) {
    super(_, options)
  }
}

export default CheckoutProviderService
