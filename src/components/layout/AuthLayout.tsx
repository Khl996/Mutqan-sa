import { Outlet, Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { useTranslation } from 'react-i18next'

export default function AuthLayout() {
    const { isAuthenticated, isLoading } = useAuth()
    const { t } = useTranslation()
    const location = useLocation()

    // Show loading spinner while checking auth
    if (isLoading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-background">
                <div className="flex flex-col items-center gap-4">
                    <div className="w-12 h-12 border-4 border-secondary border-t-transparent rounded-full animate-spin" />
                    <p className="text-muted">{t('common.loading')}</p>
                </div>
            </div>
        )
    }



    // Redirect to dashboard if already authenticated
    // Skip redirect for Register page to allow tenant creation logic to complete
    if (isAuthenticated && location.pathname !== '/register') {
        return <Navigate to="/dashboard" replace />
    }

    return (
        <div className="min-h-screen w-full relative overflow-hidden flex flex-row">
            {/* Background Image & Overlay */}
            <div className="absolute inset-0 z-0 select-none">
                <img
                    src="/images/dashboard-hero.jpg"
                    alt="Dashboard Background"
                    className="w-full h-full object-cover blur-[7px] scale-105"
                />
                <div
                    className="absolute inset-0"
                    style={{ backgroundColor: 'rgba(46, 58, 69, 0.85)' }}
                />
                {/* Soft Radial Light Effect (Center-Right) */}
                <div className="absolute top-1/2 right-[20%] -translate-y-1/2 w-[600px] h-[600px] bg-primary/30 rounded-full blur-[120px] mix-blend-soft-light pointer-events-none" />
            </div>

            {/* Content Container */}
            <div className="relative z-10 w-full h-full flex flex-col md:flex-row">

                {/* 
                    RTL Layout Logic:
                    Natural DOM Order: Element 1 -> Start (Right), Element 2 -> End (Left).
                    Goal: Right side = Hero, Left side = Login Card.
                    So: Element 1 = Hero, Element 2 = Login Card.
                */}

                {/* HERO SECTION (Right Side in RTL) */}
                <div className="hidden md:flex flex-1 flex-col justify-center px-16 lg:px-24">
                    <div className="max-w-xl space-y-8 animate-in fade-in slide-in-from-right-8 duration-700">
                        {/* Logo */}
                        <img
                            src="/images/logo-white.png"
                            alt="Mutqan Logo"
                            className="h-64 w-auto object-contain mb-8 drop-shadow-2xl"
                        />

                        {/* Typography */}
                        <div className="space-y-4">
                            <h1 className="text-4xl lg:text-5xl font-bold text-white font-cairo leading-tight">
                                منصة متكاملة لإدارة الأصول والصيانة والتشغيل
                            </h1>
                            <p className="text-xl text-white/90 font-cairo font-light leading-relaxed max-w-lg">
                                تحكم كامل في منشأتك من البلاغ إلى التقارير التنفيذية
                            </p>
                        </div>


                    </div>
                </div>

                {/* LOGIN CARD CONTAINER (Left Side in RTL) */}
                <div className="flex-1 flex items-center justify-center p-6 md:p-12">
                    <div className="w-full max-w-[440px] animate-in fade-in slide-in-from-left-8 duration-700 delay-150">
                        <Outlet />
                    </div>
                </div>

            </div>
        </div>
    )
}
