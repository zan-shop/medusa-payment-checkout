import { BigNumberInput } from "@medusajs/framework/types"
import { BigNumber, MathBN } from "@medusajs/framework/utils"

/**
 * Get the currency multiplier based on decimal digits
 * Different currencies use different numbers of decimal places
 */
function getCurrencyMultiplier(currency: string): number {
  const currencyMultipliers = {
    // Zero decimal currencies (multiplier = 1)
    0: [
      "BIF", // Burundian Franc
      "CLP", // Chilean Peso
      "DJF", // Djiboutian Franc
      "GNF", // Guinean Franc
      "JPY", // Japanese Yen
      "KMF", // Comorian Franc
      "KRW", // South Korean Won
      "MGA", // Malagasy Ariary
      "PYG", // Paraguayan Guaraní
      "RWF", // Rwandan Franc
      "UGX", // Ugandan Shilling
      "VND", // Vietnamese Dong
      "VUV", // Vanuatu Vatu
      "XAF", // Central African CFA Franc
      "XOF", // West African CFA Franc
      "XPF", // CFP Franc
    ],
    // Three decimal currencies (multiplier = 1000)
    3: [
      "BHD", // Bahraini Dinar
      "IQD", // Iraqi Dinar
      "JOD", // Jordanian Dinar
      "KWD", // Kuwaiti Dinar
      "OMR", // Omani Rial
      "TND", // Tunisian Dinar
    ],
  }

  const upperCurrency = currency.toUpperCase()
  let power = 2 // Default to 2 decimal places (most common)

  for (const [key, value] of Object.entries(currencyMultipliers)) {
    if (value.includes(upperCurrency)) {
      power = parseInt(key, 10)
      break
    }
  }

  return Math.pow(10, power)
}

/**
 * Converts an amount to the smallest currency unit based on currency.
 * Used for payment providers like Checkout.com and Stripe that expect amounts in smallest units.
 * 
 * Examples:
 * - USD: 109.00 -> 10900 (cents)
 * - JPY: 109 -> 109 (no conversion, already in smallest unit)
 * - KWD: 109.000 -> 109000 (fils, 3 decimals)
 * 
 * @param {BigNumberInput} amount - The amount in major currency unit
 * @param {string} currency - The currency code (e.g., 'USD', 'EUR', 'JPY')
 * @returns {number} - The converted amount in the smallest currency unit
 */
export function getSmallestUnit(
  amount: BigNumberInput,
  currency: string
): number {
  const multiplier = getCurrencyMultiplier(currency)

  // Round to avoid floating point precision issues
  let amount_ =
    Math.round(new BigNumber(MathBN.mult(amount, multiplier)).numeric) /
    multiplier

  const smallestAmount = new BigNumber(MathBN.mult(amount_, multiplier))

  let numeric = smallestAmount.numeric

  // Some 3-decimal currencies require rounding to nearest 10
  if (multiplier === 1e3) {
    numeric = Math.ceil(numeric / 10) * 10
  }

  return parseInt(numeric.toString().split(".").shift()!, 10)
}

/**
 * Converts an amount from the smallest currency unit to the standard unit.
 * Used when receiving amounts from payment providers.
 * 
 * Examples:
 * - USD: 10900 cents -> 109.00
 * - JPY: 109 -> 109
 * - KWD: 109000 fils -> 109.000
 * 
 * @param {BigNumberInput} amount - The amount in the smallest currency unit
 * @param {string} currency - The currency code (e.g., 'USD', 'EUR', 'JPY')
 * @returns {number} - The converted amount in the standard currency unit
 */
export function getAmountFromSmallestUnit(
  amount: BigNumberInput,
  currency: string
): number {
  const multiplier = getCurrencyMultiplier(currency)
  const standardAmount = new BigNumber(MathBN.div(amount, multiplier))
  return standardAmount.numeric
}
