import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { toast } from 'sonner'
import { useTranslation } from 'react-i18next'
import { supabase } from '@/lib/supabase'

// Define the payment provider types here (e.g., 'moyasar', 'stripe', 'checkout')
// Currently set to 'manual' or 'test' until gateway is approved
type PaymentProvider = 'moyasar' | 'stripe' | 'manual'

interface PaymentRequest {
    planId: string
    billingCycle: 'monthly' | 'yearly'
    amount: number
    currency: string
    tenantId: string
}

export function usePayment() {
    const { t, i18n } = useTranslation()
    const isRTL = i18n.language === 'ar'
    const [isProcessing, setIsProcessing] = useState(false)

    // specific gateway config (to be filled later)
    // const MOYASAR_API_KEY = import.meta.env.VITE_MOYASAR_KEY

    const initiatePayment = async (request: PaymentRequest) => {
        setIsProcessing(true)
        try {
            console.log('🚀 Initiating Payment:', request)

            // TODO: INTEGRATION POINT
            // 1. Create an order/invoice record in your DB (optional but recommended)
            // 2. Call the Payment Gateway API
            //    - If using Redirect method (e.g. Stripe Checkout, Moyasar Hosted):
            //      window.location.href = paymentUrl;
            //    - If using Custom UI:
            //      Perform API call and handle 3DSecure

            // SIMULATION for now
            await new Promise(resolve => setTimeout(resolve, 1500))

            // Mock success based on gateway
            // In a real flow, this often happens via Webhook or Redirect Callback

            // For now, we just show a message that integration is pending
            toast.info(isRTL
                ? 'جاري تجهيز بوابة الدفع (سيتم تفعيلها قريباً)'
                : 'Payment Gateway is being set up (Coming Soon)'
            )

            // IF SUCCESSFUL (Mock logic for later)
            // await updateSubscription(request) 

        } catch (error) {
            console.error('Payment Error:', error)
            toast.error(isRTL ? 'حدث خطأ في عملية الدفع' : 'Payment processing failed')
        } finally {
            setIsProcessing(false)
        }
    }

    return {
        initiatePayment,
        isProcessing
    }
}
