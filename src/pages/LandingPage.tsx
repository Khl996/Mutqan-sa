import { Link } from 'react-router-dom'
import {
    ClipboardList,
    Box,
    BarChart3,
    Zap,
    ArrowLeft,
    CheckCircle2,
    Building2,
    Stethoscope,
    GraduationCap,
    Factory,
    MessagesSquare,
    FileWarning,
    History,
    Monitor,
    RefreshCw,
    Mail,
    Smartphone,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { motion, type Variants } from 'framer-motion'

// ─── Animation primitives ──────────────────────────────────────────────────────

const stagger: Variants = {
    hidden: {},
    visible: { transition: { staggerChildren: 0.09, delayChildren: 0.05 } },
}

const rise: Variants = {
    hidden: { opacity: 0, y: 22 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.55 } },
}

// ─── Landing Page ──────────────────────────────────────────────────────────────

export default function LandingPage() {
    return (
        <div className="min-h-screen bg-slate-50 font-cairo text-slate-900" dir="rtl">

            {/* ══════════════════════════════════════════════════════════════
                NAV
            ══════════════════════════════════════════════════════════════ */}
            <nav className="fixed top-0 w-full z-50 bg-white/80 backdrop-blur-2xl border-b border-slate-200/70">
                <div className="max-w-7xl mx-auto px-5 sm:px-8 h-[66px] flex items-center justify-between">
                    <img src="/images/logo.png" alt="متقن" className="h-10 w-auto" />

                    <div className="flex items-center gap-2 sm:gap-5">
                        <Link
                            to="/contact"
                            className="hidden sm:block text-sm font-semibold text-slate-500 hover:text-slate-900 transition-colors"
                        >
                            تواصل معنا
                        </Link>
                        <Link
                            to="/login"
                            className="text-sm font-semibold text-slate-500 hover:text-slate-900 transition-colors"
                        >
                            تسجيل الدخول
                        </Link>
                        <Link
                            to="/register"
                            className="inline-flex items-center gap-2 px-4 sm:px-5 py-2.5 bg-[#2E3A45] hover:bg-[#3a4a57] text-white rounded-xl text-sm font-bold transition-all duration-200 shadow-sm"
                        >
                            جرب مجاناً
                        </Link>
                    </div>
                </div>
            </nav>

            {/* ══════════════════════════════════════════════════════════════
                HERO
            ══════════════════════════════════════════════════════════════ */}
            <section className="relative pt-36 pb-24 lg:pt-52 lg:pb-36 overflow-hidden">

                {/* Ambient glow orbs — very subtle */}
                <div
                    className="absolute -top-24 left-1/2 -translate-x-1/2 w-[900px] h-[420px] rounded-full blur-3xl pointer-events-none"
                    style={{ background: 'radial-gradient(ellipse, rgba(58,175,169,0.08) 0%, transparent 70%)' }}
                />
                <div className="absolute top-28 right-[-80px] w-[320px] h-[320px] rounded-full blur-[100px] pointer-events-none bg-[#2E3A45]/5" />
                <div className="absolute bottom-0 left-[-60px] w-[260px] h-[260px] rounded-full blur-[80px] pointer-events-none bg-[#3AAFA9]/7" />

                <div className="max-w-7xl mx-auto px-5 sm:px-8 text-center relative z-10">

                    {/* Eyebrow badge */}
                    <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.45 }}
                        className="inline-flex items-center gap-2.5 px-4 py-1.5 rounded-full bg-white border border-slate-200/80 shadow-sm text-sm font-semibold text-slate-600 mb-8"
                    >
                        <span className="w-2 h-2 rounded-full bg-[#3AAFA9] shrink-0" />
                        الجيل الجديد من إدارة المرافق
                    </motion.div>

                    {/* Headline */}
                    <motion.h1
                        initial={{ opacity: 0, y: 24 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.65, delay: 0.1, ease: [0.22, 0.61, 0.36, 1] }}
                        className="text-5xl sm:text-6xl md:text-7xl lg:text-[88px] font-black text-slate-900 leading-[1.1] tracking-tight mb-6 max-w-4xl mx-auto"
                    >
                        تحكم في منشأتك
                        <br />
                        <span style={{ color: '#3AAFA9' }}>بذكاء مطلق</span>
                    </motion.h1>

                    {/* Subheadline */}
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.6, delay: 0.22 }}
                        className="max-w-2xl mx-auto mb-10 space-y-1.5"
                    >
                        <p className="text-lg md:text-xl text-slate-500 leading-relaxed">
                            نظام سحابي يجمع لك الصيانة، الأصول، وفرق العمل في منصة واحدة.
                        </p>
                        <p className="text-lg md:text-xl font-bold text-slate-800">
                            بدون تعقيد. بدون أوراق. بدون فوضى.
                        </p>
                    </motion.div>

                    {/* CTA row */}
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.55, delay: 0.34 }}
                        className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-20"
                    >
                        <Link
                            to="/register"
                            className="w-full sm:w-auto inline-flex items-center justify-center gap-2.5 px-8 py-4 rounded-2xl text-[17px] font-bold text-white transition-all duration-200 hover:-translate-y-0.5 group"
                            style={{
                                background: '#3AAFA9',
                                boxShadow: '0 8px 32px rgba(58,175,169,0.30)',
                            }}
                        >
                            ابدأ تجربتك المجانية
                            <ArrowLeft className="w-4 h-4 group-hover:-translate-x-0.5 transition-transform" />
                        </Link>
                        <p className="text-sm text-slate-400 font-medium">
                            لا تحتاج لبطاقة ائتمان &nbsp;·&nbsp; 14 يوماً مجاناً
                        </p>
                    </motion.div>

                    {/* Capability cards */}
                    <motion.div
                        initial="hidden"
                        animate="visible"
                        variants={stagger}
                        className="grid grid-cols-2 lg:grid-cols-4 gap-4 max-w-3xl mx-auto"
                    >
                        {[
                            { label: "أوامر عمل منجزة", val: "+150", icon: ClipboardList, ic: "#3B82F6", ib: "#EFF6FF" },
                            { label: "أصول مسجلة",      val: "100%", icon: Box,           ic: "#10B981", ib: "#ECFDF5" },
                            { label: "كفاءة التشغيل",   val: "High", icon: BarChart3,      ic: "#8B5CF6", ib: "#F5F3FF" },
                            { label: "توفير في التكاليف", val: "30%", icon: Zap,           ic: "#F59E0B", ib: "#FFFBEB" },
                        ].map((s, i) => (
                            <motion.div
                                key={i}
                                variants={rise}
                                className="bg-white rounded-2xl border border-slate-100 p-5 flex flex-col items-center gap-3 shadow-sm hover:shadow-md hover:-translate-y-1 transition-all duration-300"
                            >
                                <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: s.ib }}>
                                    <s.icon className="w-5 h-5" style={{ color: s.ic }} />
                                </div>
                                <span className="text-2xl font-black text-slate-900">{s.val}</span>
                                <span className="text-xs text-slate-500 font-medium text-center leading-snug">{s.label}</span>
                            </motion.div>
                        ))}
                    </motion.div>
                </div>
            </section>

            {/* ══════════════════════════════════════════════════════════════
                INDUSTRIES STRIP
            ══════════════════════════════════════════════════════════════ */}
            <section className="py-10 border-y border-slate-200/70 bg-white">
                <div className="max-w-7xl mx-auto px-5 sm:px-8">
                    <p className="text-[11px] font-bold text-slate-400 text-center mb-7 tracking-[0.18em] uppercase">
                        يخدم مختلف القطاعات
                    </p>
                    <div className="flex flex-wrap justify-center items-center gap-5 sm:gap-12">
                        {[
                            { icon: Building2,     label: "المجمعات التجارية" },
                            { icon: Stethoscope,   label: "المرافق الطبية" },
                            { icon: GraduationCap, label: "التعليم" },
                            { icon: Factory,       label: "الصناعة" },
                        ].map(({ icon: Icon, label }, i) => (
                            <div key={i} className="flex items-center gap-2.5 group cursor-default">
                                <div className="w-9 h-9 rounded-xl bg-slate-50 border border-slate-100 flex items-center justify-center group-hover:border-[#3AAFA9]/30 group-hover:bg-[#3AAFA9]/5 transition-all duration-200">
                                    <Icon className="w-4 h-4 text-slate-500 group-hover:text-[#3AAFA9] transition-colors duration-200" />
                                </div>
                                <span className="text-sm font-semibold text-slate-600 group-hover:text-slate-900 transition-colors duration-200">{label}</span>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            {/* ══════════════════════════════════════════════════════════════
                PAIN POINTS
            ══════════════════════════════════════════════════════════════ */}
            <section className="py-24 bg-slate-50" id="features">
                <div className="max-w-7xl mx-auto px-5 sm:px-8">

                    {/* Section header */}
                    <motion.div
                        initial="hidden"
                        whileInView="visible"
                        viewport={{ once: true, margin: "-80px" }}
                        variants={stagger}
                        className="text-center mb-14 max-w-2xl mx-auto"
                    >
                        <motion.span
                            variants={rise}
                            className="inline-block text-[11px] font-bold text-[#3AAFA9] tracking-[0.18em] uppercase mb-4"
                        >
                            لماذا مُتقَن
                        </motion.span>
                        <motion.h2
                            variants={rise}
                            className="text-3xl md:text-4xl lg:text-5xl font-black text-slate-900 leading-tight mb-4"
                        >
                            صممناه لأننا نعلم
                            <br />
                            <span className="text-slate-400 font-semibold">حجم المعاناة اليومية</span>
                        </motion.h2>
                        <motion.p variants={rise} className="text-slate-500 text-lg leading-relaxed">
                            مدراء المرافق والصيانة يعانون من نفس المشاكل. مُتقَن جاء ليحلها.
                        </motion.p>
                    </motion.div>

                    {/* Cards */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        {[
                            {
                                icon: MessagesSquare,
                                accent: "#EF4444", iconBg: "#FFF1F2",
                                tag: "التواصل", featured: false,
                                title: "قروبات الواتساب المزعجة",
                                body: "هل تضيع وقتك في تتبع البلاغات عبر مئات الرسائل الصوتية والنصية؟ مُتقَن ينظم لك كل شيء في تذاكر رسمية.",
                            },
                            {
                                icon: FileWarning,
                                accent: "#3AAFA9", iconBg: "#EDFAFA",
                                tag: "التوثيق", featured: true,
                                title: "الأوراق الضائعة",
                                body: "وداعاً للفواتير المفقودة وأوامر العمل الورقية. كل شيء موثق رقمياً، ومحفوظ في السحابة للوصول إليه في أي وقت.",
                            },
                            {
                                icon: History,
                                accent: "#F59E0B", iconBg: "#FFFBEB",
                                tag: "الصيانة", featured: false,
                                title: "الصيانة التفاعلية المكلفة",
                                body: "لا تنتظر تعطل المعدة لتصلحها. تحول للصيانة الوقائية وجدول أعمالك لتقلل التكاليف المفاجئة.",
                            },
                        ].map((card, i) => (
                            <motion.div
                                key={i}
                                initial={{ opacity: 0, y: 28 }}
                                whileInView={{ opacity: 1, y: 0 }}
                                viewport={{ once: true, margin: "-60px" }}
                                transition={{ duration: 0.5, delay: i * 0.1 }}
                                className={cn(
                                    "relative bg-white rounded-3xl p-8 border transition-all duration-300 hover:-translate-y-2",
                                    card.featured
                                        ? "border-[#3AAFA9]/20 shadow-lg md:-mt-4 hover:shadow-2xl"
                                        : "border-slate-100 shadow-sm hover:shadow-xl hover:border-slate-200"
                                )}
                            >
                                {/* Featured accent line */}
                                {card.featured && (
                                    <div
                                        className="absolute top-0 inset-x-0 h-[3px] rounded-t-3xl"
                                        style={{ background: 'linear-gradient(90deg, #3AAFA9 0%, #2E3A45 100%)' }}
                                    />
                                )}

                                <div className="flex items-start justify-between mb-6">
                                    <div
                                        className="w-12 h-12 rounded-2xl flex items-center justify-center"
                                        style={{ background: card.iconBg }}
                                    >
                                        <card.icon className="w-6 h-6" style={{ color: card.accent }} />
                                    </div>
                                    <span className="text-[11px] font-bold px-2.5 py-1 rounded-lg bg-slate-50 text-slate-400 border border-slate-100 tracking-wide">
                                        {card.tag}
                                    </span>
                                </div>

                                <h3 className="text-xl font-bold text-slate-900 mb-3 leading-snug">{card.title}</h3>
                                <p className="text-slate-500 text-[15px] leading-relaxed">{card.body}</p>
                            </motion.div>
                        ))}
                    </div>
                </div>
            </section>

            {/* ══════════════════════════════════════════════════════════════
                PWA FEATURES — dark section
            ══════════════════════════════════════════════════════════════ */}
            <section className="py-24 bg-[#1C2730] text-white overflow-hidden relative">
                <div className="absolute top-0 right-0 w-[450px] h-[450px] bg-[#3AAFA9]/10 rounded-full blur-[130px] pointer-events-none" />
                <div className="absolute bottom-0 left-[-80px] w-[320px] h-[320px] bg-[#3AAFA9]/5 rounded-full blur-[80px] pointer-events-none" />

                <div className="max-w-7xl mx-auto px-5 sm:px-8 relative z-10">
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">

                        {/* Text content */}
                        <motion.div
                            initial="hidden"
                            whileInView="visible"
                            viewport={{ once: true }}
                            variants={stagger}
                        >
                            <motion.span
                                variants={rise}
                                className="block text-[11px] font-bold text-[#3AAFA9] tracking-[0.18em] uppercase mb-4"
                            >
                                وصول شامل
                            </motion.span>
                            <motion.h2 variants={rise} className="text-3xl md:text-4xl lg:text-5xl font-black leading-[1.2] mb-5">
                                معك في الميدان
                                <br />
                                <span className="text-slate-400 font-medium text-2xl md:text-3xl">بدون تحميل تطبيقات</span>
                            </motion.h2>
                            <motion.p variants={rise} className="text-slate-400 text-lg mb-10 leading-relaxed max-w-md">
                                مُتقَن يعمل كتطبيق ويب تقدمي (PWA). سواء كنت في المكتب أو الموقع، افتح المتصفح وابدأ العمل فوراً.
                            </motion.p>

                            <motion.div variants={stagger} className="space-y-1.5">
                                {[
                                    { icon: Monitor,    title: "متجاوب 100%",           desc: "واجهة تتكيف تلقائياً مع جوالك وتابلتك وكمبيوترك." },
                                    { icon: RefreshCw,  title: "دائماً محدث",            desc: "لا حاجة لزيارة متجر التطبيقات، أنت دائماً على أحدث نسخة." },
                                    { icon: Mail,       title: "تنبيهات بريدية فورية",   desc: "إشعارات لحظية تصلك وتصل للفريق عند أي تحديث." },
                                    { icon: Zap,        title: "خفيف وسريع",             desc: "لا يستهلك مساحة تخزين جهازك، وسريع الاستجابة." },
                                ].map((item, idx) => (
                                    <motion.div
                                        key={idx}
                                        variants={rise}
                                        className="flex gap-4 p-4 rounded-2xl border border-transparent hover:bg-white/5 hover:border-white/10 transition-all duration-200 cursor-default group"
                                    >
                                        <div className="mt-0.5 w-10 h-10 rounded-xl bg-[#3AAFA9]/15 border border-[#3AAFA9]/20 flex items-center justify-center shrink-0 group-hover:bg-[#3AAFA9]/25 transition-colors">
                                            <item.icon className="w-5 h-5 text-[#3AAFA9]" />
                                        </div>
                                        <div>
                                            <h4 className="font-bold text-white mb-0.5 text-base">{item.title}</h4>
                                            <p className="text-slate-400 text-sm leading-relaxed">{item.desc}</p>
                                        </div>
                                    </motion.div>
                                ))}
                            </motion.div>
                        </motion.div>

                        {/* Abstract visual — desktop only */}
                        <div className="hidden lg:flex justify-center items-center">
                            <motion.div
                                initial={{ opacity: 0, scale: 0.88 }}
                                whileInView={{ opacity: 1, scale: 1 }}
                                viewport={{ once: true }}
                                transition={{ duration: 0.65, ease: "easeOut" }}
                                className="relative"
                            >
                                {/* Glow */}
                                <div className="absolute inset-0 bg-[#3AAFA9]/20 blur-[80px] rounded-full" />

                                {/* Icon box */}
                                <div
                                    className="relative w-56 h-56 rounded-[2.5rem] border border-white/10 shadow-2xl flex items-center justify-center"
                                    style={{ background: 'linear-gradient(135deg, #2a3840 0%, #1C2730 100%)' }}
                                >
                                    <Smartphone className="w-24 h-24 text-white/60" />

                                    {/* Floating chips */}
                                    <div className="absolute -top-5 -right-6 bg-[#3AAFA9] text-white px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-lg">
                                        <CheckCircle2 className="w-3.5 h-3.5" />
                                        جاهز دائماً
                                    </div>
                                    <div className="absolute -bottom-5 -left-6 bg-[#1a2028] border border-white/15 text-white px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-lg">
                                        <Zap className="w-3.5 h-3.5 text-yellow-400" />
                                        سريع وخفيف
                                    </div>
                                </div>
                            </motion.div>
                        </div>
                    </div>
                </div>
            </section>

            {/* ══════════════════════════════════════════════════════════════
                CTA
            ══════════════════════════════════════════════════════════════ */}
            <section className="py-28 relative overflow-hidden" style={{ background: '#2E3A45' }}>
                {/* Top glow */}
                <div
                    className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[280px] rounded-full blur-[100px] pointer-events-none"
                    style={{ background: 'radial-gradient(ellipse, rgba(58,175,169,0.18) 0%, transparent 70%)' }}
                />
                {/* Dot grid texture */}
                <div
                    className="absolute inset-0 opacity-[0.04] pointer-events-none"
                    style={{
                        backgroundImage: 'radial-gradient(circle, rgba(255,255,255,0.8) 1px, transparent 1px)',
                        backgroundSize: '28px 28px',
                    }}
                />

                <div className="max-w-4xl mx-auto px-5 sm:px-8 text-center relative z-10">
                    <motion.div
                        initial="hidden"
                        whileInView="visible"
                        viewport={{ once: true }}
                        variants={stagger}
                    >
                        <motion.span
                            variants={rise}
                            className="inline-block text-[11px] font-bold text-[#3AAFA9] tracking-[0.18em] uppercase mb-6"
                        >
                            ابدأ اليوم
                        </motion.span>
                        <motion.h2
                            variants={rise}
                            className="text-4xl md:text-5xl lg:text-6xl font-black text-white mb-5 leading-tight"
                        >
                            جاهز للبدء؟
                        </motion.h2>
                        <motion.p variants={rise} className="text-slate-300 text-xl mb-10 max-w-lg mx-auto leading-relaxed">
                            انضم للمستقبل، ورتب منشأتك اليوم. التجربة مجانية بالكامل.
                        </motion.p>
                        <motion.div variants={rise} className="flex flex-col sm:flex-row items-center justify-center gap-4">
                            <Link
                                to="/register"
                                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-9 py-4 text-white rounded-2xl text-lg font-bold transition-all duration-200 hover:-translate-y-0.5"
                                style={{
                                    background: '#3AAFA9',
                                    boxShadow: '0 8px 32px rgba(58,175,169,0.25)',
                                }}
                            >
                                أنشئ حساب منشأتك مجاناً
                            </Link>
                            <p className="text-slate-400 text-sm font-medium">
                                لا تحتاج لبطاقة ائتمان &nbsp;·&nbsp; 14 يوم تجربة مجانية
                            </p>
                        </motion.div>
                    </motion.div>
                </div>
            </section>

            {/* ══════════════════════════════════════════════════════════════
                FOOTER
            ══════════════════════════════════════════════════════════════ */}
            <footer className="bg-white border-t border-slate-200 pt-14 pb-8">
                <div className="max-w-7xl mx-auto px-5 sm:px-8">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-10 mb-10">

                        {/* Brand */}
                        <div>
                            <img src="/images/logo.png" alt="متقن" className="h-9 w-auto mb-5 opacity-75" />
                            <p className="text-slate-500 text-sm leading-relaxed max-w-[260px]">
                                مُتقَن هو الحل السحابي الأحدث لإدارة الصيانة والمرافق في المملكة العربية السعودية.
                            </p>
                        </div>

                        {/* Links */}
                        <div>
                            <h4 className="font-bold text-slate-900 mb-4 text-sm">الشركة</h4>
                            <ul className="space-y-2.5">
                                {[
                                    { to: "/about",   label: "من نحن" },
                                    { to: "/contact", label: "اتصل بنا" },
                                    { to: "/privacy", label: "سياسة الخصوصية" },
                                    { to: "/terms",   label: "سياسة الاستخدام" },
                                ].map(({ to, label }) => (
                                    <li key={to}>
                                        <Link to={to} className="text-sm text-slate-500 hover:text-slate-900 transition-colors">
                                            {label}
                                        </Link>
                                    </li>
                                ))}
                            </ul>
                        </div>

                        {/* Contact */}
                        <div>
                            <h4 className="font-bold text-slate-900 mb-4 text-sm">تواصل معنا</h4>
                            <a
                                href="mailto:Info@mutqan-sa.com"
                                className="text-sm text-slate-500 hover:text-[#3AAFA9] transition-colors"
                                dir="ltr"
                            >
                                Info@mutqan-sa.com
                            </a>
                        </div>
                    </div>

                    <div className="border-t border-slate-100 pt-6 text-center text-xs text-slate-400">
                        © {new Date().getFullYear()} مُتقَن لتقنية المعلومات. جميع الحقوق محفوظة.
                    </div>
                </div>
            </footer>
        </div>
    )
}
