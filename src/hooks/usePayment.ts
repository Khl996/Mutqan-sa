import { useState } from 'react'
import { toast } from 'sonner'
import { useTranslation } from 'react-i18next'
import { supabase } from '@/lib/supabase'

interface PaymentRequest {
    planId: string
    planName: string
    billingCycle: 'monthly' | 'yearly'
    amount: number
    currency: string
    tenantId: string
    customerEmail?: string
    customerName?: string
    customerPhone?: string
}

interface VerifyPaymentResult {
    success: boolean
    status: string
    message: string
    subscription?: {
        subscription_id: string
        invoice_id: string | null
        plan_id: string
        billing_cycle: string
        period_start: string
        period_end: string
        amount: number
    }
}

export function usePayment() {
    const { i18n } = useTranslation()
    const isRTL = i18n.language === 'ar'
    const [isProcessing, setIsProcessing] = useState(false)

    /**
     * Step 1: Create a charge and redirect user to Tap payment page
     */
    const initiatePayment = async (request: PaymentRequest) => {
        setIsProcessing(true)
        try {
            // Get current session token for auth
            const { data: { session } } = await supabase.auth.getSession()
            if (!session?.access_token) {
                throw new Error(isRTL ? 'يرجى تسجيل الدخول أولاً' : 'Please log in first')
            }

            const response = await fetch('/api/create-charge', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${session.access_token}`,
                },
                body: JSON.stringify(request),
            })

            const data = await response.json()

            if (!response.ok) {
                throw new Error(data.error || 'Payment creation failed')
            }

            // Redirect user to Tap payment page
            if (data.redirect_url) {
                window.location.href = data.redirect_url
            } else {
                throw new Error('No redirect URL received')
            }

        } catch (error: any) {
            console.error('Payment Error:', error)
            toast.error(
                isRTL
                    ? 'حدث خطأ في إنشاء عملية الدفع. يرجى المحاولة مرة أخرى.'
                    : 'Failed to create payment. Please try again.'
            )
            setIsProcessing(false)
        }
    }

    /**
     * Step 2: Verify payment after redirect back from Tap
     */
    const verifyPayment = async (tapId: string): Promise<VerifyPaymentResult> => {
        try {
            const { data: { session } } = await supabase.auth.getSession()
            if (!session?.access_token) {
                throw new Error(isRTL ? 'يرجى تسجيل الدخول أولاً' : 'Please log in first')
            }

            const response = await fetch('/api/verify-payment', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${session.access_token}`,
                },
                body: JSON.stringify({ tap_id: tapId }),
            })

            const data = await response.json()

            if (!response.ok) {
                throw new Error(data.error || 'Verification failed')
            }

            return data

        } catch (error: any) {
            console.error('Verify Error:', error)
            return {
                success: false,
                status: 'ERROR',
                message: error.message || 'Verification failed',
            }
        }
    }

    return {
        initiatePayment,
        verifyPayment,
        isProcessing,
    }
}
