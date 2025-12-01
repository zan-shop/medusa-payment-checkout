import { ModuleProvider, Modules } from "@medusajs/framework/utils"
import { CheckoutProviderService } from "./services/index"

const services = [CheckoutProviderService]

const paymentModule: any = ModuleProvider(Modules.PAYMENT, {
  services,
})

export default paymentModule
