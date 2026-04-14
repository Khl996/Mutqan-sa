/**
 * billing.ts
 *
 * Canonical billing types for the Mutqan platform.
 * All types are defined in useBillingEngine.ts (co-located with hooks).
 * This file re-exports them as a stable public surface for pages/components
 * that need types without importing hook internals.
 */

export type {
    // Enums / unions
    NewSubscriptionStatus,
    BillingCycle,
    AddOnBillingType,
    DiscountTypeEngine,
    BillingQuoteStatus,
    BillingInvoiceStatus,

    // Records
    BillingAddOn,
    DiscountPolicy,
    BillingLineItem,
    BillingQuote,
    BillingInvoice,

    // Engine I/O
    PricingBreakdown,
    ActivationResult,
    QuoteResult,
    CalculateInput,
    CreateQuoteEngineInput,
    ActivateInput,

    // Subscription
    TenantSubscriptionNew,
} from '@/hooks/useBillingEngine'

// Re-export plan types from useSubscriptionPlans for convenience
export type { SubscriptionPlan, CreatePlanInput } from '@/hooks/useSubscriptionPlans'
