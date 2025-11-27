import { ModuleProvider, Modules } from "@medusajs/framework/utils"
import { CheckoutProviderService } from "./services/index"

const services = [CheckoutProviderService]

export default ModuleProvider(Modules.PAYMENT, {
  services,
})

export * from "./types/index.js"
