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
CHECKOUT_PROCESSING_CHANNEL_ID="pc_your-channel-id-here"

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
              processingChannelId: process.env.CHECKOUT_PROCESSING_CHANNEL_ID,
            },
          },
        ],
      },
    },
  ],
}
```

## Usage

### Frontend Integration

Use Checkout.com's [Frames.js](https://www.checkout.com/docs/payments/accept-payments/accept-a-payment-on-your-website/frames) to tokenize card details:

```typescript
import { Frames } from "frames-react"

// 1. Initialize Frames with your public key
const frames = Frames.init({
  publicKey: "pk_test_...",
  localization: "EN-GB",
})

// 2. Tokenize the card
frames.submitCard().then((data) => {
  const token = data.token // This is what you send to Medusa
  
  // 3. Complete the payment in Medusa
  completeCart(cartId, { 
    provider_id: "checkout",
    data: { token } 
  })
})
```

## Currency Handling

The provider automatically converts amounts to the smallest currency unit required by Checkout.com:

```typescript
// Examples:
€109.00 EUR → 10900 cents
¥109 JPY → 109 (no conversion)
د.ك109.000 KWD → 109000 fils (3 decimals, rounded to nearest 10)
```

## Testing

Run the test suite:

```bash
npm test
```

### Test Cards

Use Checkout.com's [test cards](https://www.checkout.com/docs/testing/test-cards):

- **Success:** `4242 4242 4242 4242`
- **3DS Challenge:** `4485 0400 1600 0063`
- **Declined:** `4000 0000 0000 0002`

## Development

```bash
# Install dependencies
npm install

# Build the package
npm run build

# Watch mode for development
npm run watch

# Run tests
npm test
```

## Troubleshooting

### ValidationError on payment authorization

Ensure you're sending a valid Checkout.com token from Frames.js:

```typescript
// ❌ Wrong
{ data: { cardToken: "tok_..." } }

// ✅ Correct
{ data: { token: "tok_..." } }
```

## Support

- [Checkout.com Documentation](https://www.checkout.com/docs)
- [Medusa Documentation](https://docs.medusajs.com)
- [Report Issues](https://github.com/zan-shop/zan-backend/issues)

## License

MIT

## Credits

Built for [Zan Shop](https://github.com/zan-shop) using the Medusa v2 framework and Checkout.com payment gateway.
