# Checkout.com Payment Provider for Medusa v2

A payment provider plugin for [Medusa v2](https://medusajs.com/) that integrates [Checkout.com](https://www.checkout.com/) payment processing with proper multi-currency support and 3D Secure authentication.

## Features

- ✅ **Multi-currency support** - Handles 0, 2, and 3 decimal currencies correctly
- ✅ **Authorization & Capture** - Full support for auth-only and capture workflows
- ✅ **Refunds** - Complete refund processing
- ✅ **Webhooks** - Real-time payment status updates
- ✅ **TypeScript** - Fully typed with ES modules

## Supported Currencies

### Standard (2 decimals)
USD, EUR, GBP, and most common currencies

### Zero decimal currencies
JPY (Japanese Yen), KRW (South Korean Won), VND (Vietnamese Dong), and others

### Three decimal currencies
KWD (Kuwaiti Dinar), BHD (Bahraini Dinar), JOD (Jordanian Dinar), OMR (Omani Rial), TND (Tunisian Dinar)

## Installation

```bash
npm install @zan-shop/medusa-payment-checkout
# or
yarn add @zan-shop/medusa-payment-checkout
# or
pnpm add @zan-shop/medusa-payment-checkout
```

## Configuration

### 1. Get your Checkout.com credentials

Sign up at [Checkout.com](https://www.checkout.com/) and get your:
- Public Key (`pk_test_...` or `pk_...`)
- Secret Key (`sk_test_...` or `sk_...`)
- Processing Channel ID (`pc_...`)

### 2. Add environment variables

Create or update your `.env` file:

```bash
# Checkout.com Configuration
CHECKOUT_PUBLIC_KEY="pk_test_your-public-key-here"
CHECKOUT_SECRET_KEY="sk_test_your-secret-key-here"
CHECKOUT_WEBHOOK_SECRET_KEY="whsec_your-webhook-secret-key-here"

### 3. Register the provider

Add the provider to your Medusa configuration (`medusa-config.ts` or `medusa-config.js`):

```typescript
import { Modules } from "@medusajs/framework/utils"

export default {
  // ... other config
  modules: [
    {
      resolve: "@medusajs/medusa/payment",
      options: {
        providers: [
          {
            resolve: "@zan-shop/medusa-payment-checkout",
            id: "checkout",
            options: {
              publicKey: process.env.CHECKOUT_PUBLIC_KEY,
              secretKey: process.env.CHECKOUT_SECRET_KEY,
              webhookSecretKey: process.env.CHECKOUT_WEBHOOK_SECRET_KEY,
            },
          },
        ],
      },
    },
  ],
}
```

## Support

- [Checkout.com Documentation](https://www.checkout.com/docs)
- [Medusa Documentation](https://docs.medusajs.com)
- [Report Issues](https://github.com/zan-shop/zan-backend/issues)

## License

MIT

## Credits

Built for [Zan Shop](https://github.com/zan-shop) using the Medusa v2 framework and Checkout.com payment gateway.
