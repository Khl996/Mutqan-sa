import { Link } from 'react-router-dom'
import {
    LayoutDashboard,
    ClipboardList,
    Box,
    BarChart3,
    Smartphone,
    Zap,
    ArrowLeft,
    CheckCircle2,
    Building2,
    Stethoscope,
    GraduationCap,
    Factory,
    MessagesSquare,
    FileWarning,
    History
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { motion } from 'framer-motion'
import { useTranslation } from 'react-i18next'

export default function LandingPage() {
    const { t } = useTranslation()

    // Animation variants for smooth entry
    const fadeIn = {
        hidden: { opacity: 0, y: 20 },
        visible: { opacity: 1, y: 0, transition: { duration: 0.6 } }
    };

    return (
        <div className="min-h-screen bg-slate-50 font-cairo text-slate-900" dir="rtl">

            {/* Navigation - Glass Effect */}
            <nav className="fixed top-0 w-full z-50 border-b border-white/20 bg-white/70 backdrop-blur-xl supports-[backdrop-filter]:bg-white/60">
                <div className="container mx-auto px-4 h-20 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        {/* Logo - تأكد من مسار الشعار */}
                        <img src="/images/logo.png" alt="Mutqan Logo" className="h-12 w-auto object-contain" />
                    </div>
                    <div className="flex items-center gap-3 sm:gap-6">
                        <Link to="/contact" className="text-sm font-bold text-slate-600 hover:text-primary transition-colors">
                            تواصل معنا
                        </Link>
                        <Link to="/login" className="text-sm font-bold text-slate-600 hover:text-primary transition-colors">
                            تسجيل الدخول
                        </Link>
                        <Link
                            to="/register"
                            className="bg-primary hover:bg-primary/90 text-white px-6 py-2.5 rounded-full text-sm font-bold transition-all shadow-lg shadow-primary/20 hover:shadow-primary/40 hover:-translate-y-0.5"
                        >
                            جرب مُتقَن مجاناً
                        </Link>
                    </div>
                </div>
            </nav>

            {/* Hero Section - Abstract & Typographic Focus (بدون صور داشبورد) */}
            <section className="relative pt-32 pb-20 lg:pt-48 lg:pb-32 overflow-hidden flex flex-col items-center justify-center min-h-[85vh]">

                {/* Dynamic Background Elements - Animated Blobs */}
                <motion.div
                    animate={{
                        scale: [1, 1.2, 1],
                        rotate: [0, 90, 0],
                    }}
                    transition={{ duration: 20, repeat: Infinity }}
                    className="absolute top-0 right-0 w-[600px] h-[600px] bg-primary/10 rounded-full blur-[120px] -z-10 translate-x-1/3 -translate-y-1/4"
                />
                <motion.div
                    animate={{
                        scale: [1, 1.3, 1],
                        rotate: [0, -90, 0],
                    }}
                    transition={{ duration: 25, repeat: Infinity }}
                    className="absolute bottom-0 left-0 w-[500px] h-[500px] bg-secondary/10 rounded-full blur-[100px] -z-10 -translate-x-1/3 translate-y-1/3"
                />

                <div className="container mx-auto px-4 text-center relative z-10">
                    <motion.div
                        initial="hidden"
                        whileInView="visible"
                        viewport={{ once: true }}
                        variants={fadeIn}
                        className="max-w-5xl mx-auto space-y-10"
                    >
                        {/* New Minimal Badge */}
                        <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white border border-slate-200 shadow-sm text-slate-600 text-sm font-bold mb-6 hover:scale-105 transition-transform cursor-default">
                            <Zap className="w-4 h-4 text-yellow-500 fill-yellow-500" />
                            <span className="bg-gradient-to-r from-slate-800 to-slate-600 bg-clip-text text-transparent">
                                الجيل الجديد من إدارة المرافق
                            </span>
                        </div>

                        <h1 className="text-5xl md:text-7xl lg:text-8xl font-black text-slate-900 leading-normal tracking-tighter">
                            تحكم في منشأتك <br />
                            <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary via-blue-600 to-secondary">
                                بذكاء مطلق
                            </span>
                        </h1>

                        <p className="text-xl md:text-2xl text-slate-500 max-w-3xl mx-auto leading-relaxed font-medium">
                            نظام سحابي يجمع لك الصيانة، الأصول، وفرق العمل في منصة واحدة.
                            <span className="block mt-2 text-slate-900 font-bold">بدون تعقيد. بدون أوراق. بدون فوضى.</span>
                        </p>

                        <div className="flex flex-col sm:flex-row items-center justify-center gap-6 pt-8">
                            <Link
                                to="/register"
                                className="w-full sm:w-auto px-10 py-5 bg-slate-900 text-white rounded-2xl text-xl font-bold hover:bg-slate-800 transition-all shadow-2xl shadow-slate-900/30 hover:-translate-y-1 flex items-center justify-center gap-3 group"
                            >
                                <span>ابدأ تجربتك الآن</span>
                                <ArrowLeft className="w-5 h-5 group-hover:-translate-x-1 transition-transform" />
                            </Link>
                        </div>

                        {/* Abstract Feature Cards - Floating Stats */}
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-6 mt-20 max-w-4xl mx-auto">
                            {[
                                { label: "أوامر عمل منجزة", val: "+150", icon: ClipboardList, col: "text-blue-500", bg: "bg-blue-50" },
                                { label: "أصول مسجلة", val: "100%", icon: Box, col: "text-emerald-500", bg: "bg-emerald-50" },
                                { label: "كفاءة التشغيل", val: "High", icon: BarChart3, col: "text-purple-500", bg: "bg-purple-50" },
                                { label: "توفير في التكاليف", val: "30%", icon: Zap, col: "text-yellow-500", bg: "bg-yellow-50" },
                            ].map((stat, i) => (
                                <motion.div
                                    key={i}
                                    initial={{ opacity: 0, y: 30 }}
                                    whileInView={{ opacity: 1, y: 0 }}
                                    transition={{ delay: i * 0.1 + 0.5 }}
                                    className="bg-white/80 backdrop-blur-md border border-slate-100 p-6 rounded-2xl shadow-sm hover:shadow-xl transition-all hover:-translate-y-1 flex flex-col items-center justify-center gap-3"
                                >
                                    <div className={`p-3 rounded-full ${stat.bg}`}>
                                        <stat.icon className={`w-6 h-6 ${stat.col}`} />
                                    </div>
                                    <span className="font-bold text-slate-900 text-2xl">{stat.val}</span>
                                    <span className="text-sm text-slate-500 font-medium">{stat.label}</span>
                                </motion.div>
                            ))}
                        </div>
                    </motion.div>
                </div>
            </section>

            {/* Social Proof / Industries */}
            <section className="py-12 border-y border-slate-100 bg-white">
                <div className="container mx-auto px-4 text-center">
                    <p className="text-sm font-bold text-slate-400 mb-8 tracking-wider">الحل الأمثل لإدارة المرافق في مختلف القطاعات</p>
                    <div className="flex flex-wrap justify-center items-center gap-8 md:gap-16 opacity-70 hover:opacity-100 transition-all duration-500">
                        {/* Industry Icons */}
                        <div className="flex flex-col items-center gap-3 group cursor-pointer">
                            <div className="p-4 rounded-full bg-slate-50 group-hover:bg-slate-100 transition-colors">
                                <Building2 className="w-8 h-8 text-slate-600 group-hover:text-primary transition-colors" />
                            </div>
                            <span className="font-bold text-sm text-slate-600">المجمعات التجارية</span>
                        </div>
                        <div className="flex flex-col items-center gap-3 group cursor-pointer">
                            <div className="p-4 rounded-full bg-slate-50 group-hover:bg-slate-100 transition-colors">
                                <Stethoscope className="w-8 h-8 text-slate-600 group-hover:text-primary transition-colors" />
                            </div>
                            <span className="font-bold text-sm text-slate-600">المرافق الطبية</span>
                        </div>
                        <div className="flex flex-col items-center gap-3 group cursor-pointer">
                            <div className="p-4 rounded-full bg-slate-50 group-hover:bg-slate-100 transition-colors">
                                <GraduationCap className="w-8 h-8 text-slate-600 group-hover:text-primary transition-colors" />
                            </div>
                            <span className="font-bold text-sm text-slate-600">التعليم</span>
                        </div>
                        <div className="flex flex-col items-center gap-3 group cursor-pointer">
                            <div className="p-4 rounded-full bg-slate-50 group-hover:bg-slate-100 transition-colors">
                                <Factory className="w-8 h-8 text-slate-600 group-hover:text-primary transition-colors" />
                            </div>
                            <span className="font-bold text-sm text-slate-600">الصناعة</span>
                        </div>
                    </div>
                </div>
            </section>

            {/* Pain Points - Bento Grid Style */}
            <section className="py-24 bg-slate-50" id="features">
                <div className="container mx-auto px-4">
                    <div className="text-center mb-16 max-w-3xl mx-auto">
                        <h2 className="text-3xl md:text-4xl font-bold text-slate-900 mb-4">لماذا مُتقَن؟</h2>
                        <p className="text-slate-600 text-lg">صممناه لأننا نعلم حجم المعاناة اليومية لمدراء المرافق والصيانة.</p>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                        {/* Card 1 */}
                        <motion.div
                            whileHover={{ y: -5 }}
                            className="bg-white p-8 rounded-3xl border border-slate-100 shadow-sm hover:shadow-md transition-all group"
                        >
                            <div className="w-14 h-14 rounded-2xl bg-red-50 text-red-500 flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                                <MessagesSquare className="w-7 h-7" />
                            </div>
                            <h3 className="text-xl font-bold mb-3 text-slate-900">قروبات الواتساب المزعجة</h3>
                            <p className="text-slate-500 leading-relaxed">
                                هل تضيع وقتك في تتبع البلاغات عبر مئات الرسائل الصوتية والنصية؟ مُتقَن ينظم لك كل شيء في تذاكر رسمية.
                            </p>
                        </motion.div>
                        {/* Card 2 */}
                        <motion.div
                            whileHover={{ y: -5 }}
                            className="bg-white p-8 rounded-3xl border border-slate-100 shadow-sm hover:shadow-md transition-all group md:-mt-4 border-t-4 border-t-primary"
                        >
                            <div className="w-14 h-14 rounded-2xl bg-blue-50 text-blue-500 flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                                <FileWarning className="w-7 h-7" />
                            </div>
                            <h3 className="text-xl font-bold mb-3 text-slate-900">الأوراق الضائعة</h3>
                            <p className="text-slate-500 leading-relaxed">
                                وداعاً للفواتير المفقودة وأوامر العمل الورقية. كل شيء موثق رقمياً، ومحفوظ في السحابة للوصول إليه في أي وقت.
                            </p>
                        </motion.div>
                        {/* Card 3 */}
                        <motion.div
                            whileHover={{ y: -5 }}
                            className="bg-white p-8 rounded-3xl border border-slate-100 shadow-sm hover:shadow-md transition-all group"
                        >
                            <div className="w-14 h-14 rounded-2xl bg-orange-50 text-orange-500 flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                                <History className="w-7 h-7" />
                            </div>
                            <h3 className="text-xl font-bold mb-3 text-slate-900">الصيانة التفاعلية المكلفة</h3>
                            <p className="text-slate-500 leading-relaxed">
                                لا تنتظر تعطل المعدة لتصلحها. تحول للصيانة الوقائية وجدول أعمالك لتقلل التكاليف المفاجئة.
                            </p>
                        </motion.div>
                    </div>
                </div>
            </section>

            {/* Features Showcase - PWA Focus (Code-Only Visual) */}
            <section className="py-24 bg-slate-900 text-white overflow-hidden relative">
                {/* Decoration */}
                <div className="absolute top-0 right-0 w-96 h-96 bg-primary/20 rounded-full blur-[100px] pointer-events-none" />

                <div className="container mx-auto px-4">
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
                        {/* Text Content */}
                        <div>
                            <span className="text-primary font-bold tracking-wider text-sm uppercase">وصول شامل</span>
                            <h2 className="text-3xl md:text-5xl font-bold mt-2 mb-6 leading-tight">معك في الميدان.. <br /> بدون تحميل تطبيقات</h2>
                            <p className="text-slate-400 text-lg mb-8">
                                مُتقَن يعمل كتطبيق ويب تقدمي (PWA). سواء كنت تستخدم لابتوب المكتب أو جوالك في الموقع، افتح المتصفح وابدأ العمل فوراً.
                            </p>

                            <div className="space-y-6">
                                {[
                                    { title: "متجاوب 100%", desc: "واجهة تتكيف تلقائياً مع حجم شاشتك (جوال، تابلت، كمبيوتر)." },
                                    { title: "دائماً محدث", desc: "لا حاجة لزيارة متجر التطبيقات، أنت دائماً على أحدث نسخة." },
                                    { title: "تنبيهات بريدية فورية", desc: "وداعاً لـ 'ما شفت الرسالة'. إشعارات لحظية تصلك وتصل للفريق عند أي تحديث." },
                                    { title: "خفيف وسريع", desc: "لا يستهلك مساحة تخزين جهازك، وسريع الاستجابة." }
                                ].map((item, idx) => (
                                    <div key={idx} className="flex gap-4 p-4 rounded-xl hover:bg-white/5 transition-colors cursor-default border border-transparent hover:border-white/10">
                                        <div className="mt-1">
                                            <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center text-primary">
                                                <Smartphone className="w-6 h-6" />
                                            </div>
                                        </div>
                                        <div>
                                            <h4 className="text-xl font-bold mb-1">{item.title}</h4>
                                            <p className="text-slate-400 text-sm leading-relaxed">{item.desc}</p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Visual - Abstract Glowing Icon (No Image Needed) */}
                        <div className="relative flex justify-center items-center h-80">
                            <motion.div
                                initial={{ opacity: 0, scale: 0.8 }}
                                whileInView={{ opacity: 1, scale: 1 }}
                                transition={{ duration: 0.5 }}
                                className="relative z-10"
                            >
                                {/* Glowing Circles */}
                                <div className="absolute inset-0 bg-primary/30 blur-[60px] rounded-full animate-pulse"></div>

                                {/* Icon Container */}
                                <div className="relative w-48 h-48 bg-gradient-to-tr from-slate-800 to-slate-700 rounded-[3rem] border border-slate-600 shadow-2xl flex items-center justify-center group hover:scale-105 transition-transform duration-500">
                                    <Smartphone className="w-20 h-20 text-white opacity-80 group-hover:text-primary transition-colors duration-300" />

                                    {/* Small floating badges */}
                                    <div className="absolute -right-4 -top-4 bg-slate-800 border border-slate-600 p-3 rounded-2xl shadow-lg animate-bounce delay-100">
                                        <Zap className="w-6 h-6 text-yellow-500" />
                                    </div>
                                    <div className="absolute -left-4 -bottom-4 bg-slate-800 border border-slate-600 p-3 rounded-2xl shadow-lg animate-bounce delay-300">
                                        <CheckCircle2 className="w-6 h-6 text-green-500" />
                                    </div>
                                </div>
                            </motion.div>
                        </div>
                    </div>
                </div>
            </section>

            {/* CTA Section */}
            <section className="py-24 relative overflow-hidden bg-white">
                <div className="absolute inset-0 bg-primary/5"></div>
                <div className="container mx-auto px-4 text-center relative z-10">
                    <h2 className="text-4xl md:text-5xl font-bold text-slate-900 mb-6">جاهز للبدء؟</h2>
                    <p className="text-xl text-slate-600 mb-10 max-w-2xl mx-auto">
                        انضم للمستقبل، ورتب منشأتك اليوم. التجربة مجانية بالكامل.
                    </p>
                    <div className="flex flex-col sm:flex-row justify-center items-center gap-4">
                        <Link
                            to="/register"
                            className="w-full sm:w-auto px-10 py-4 bg-primary text-white rounded-xl text-lg font-bold hover:bg-primary/90 transition-all shadow-xl shadow-primary/30 transform hover:-translate-y-1"
                        >
                            أنشئ حساب منشأتك
                        </Link>
                        <p className="text-sm text-slate-500 mt-4 sm:mt-0 font-medium">لا تحتاج لبطاقة ائتمان • 14 يوم تجربة مجانية</p>
                    </div>
                </div>
            </section>

            {/* Clean Footer */}
            <footer className="bg-white border-t border-slate-200 pt-16 pb-8">
                <div className="container mx-auto px-4">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-12">
                        <div className="col-span-1 md:col-span-1">
                            {/* Logo Placeholder */}
                            <img src="/images/logo.png" alt="Mutqan" className="h-10 w-auto mb-6 opacity-80" />
                            <p className="text-slate-500 text-sm leading-relaxed">
                                مُتقَن هو الحل السحابي الأحدث لإدارة الصيانة والمرافق في المملكة العربية السعودية.
                            </p>
                        </div>
                        <div>
                            <h4 className="font-bold mb-4 text-slate-900">الشركة</h4>
                            <ul className="space-y-2 text-sm text-slate-500">
                                <li><Link to="/about" className="hover:text-primary transition-colors">من نحن</Link></li>
                                <li><Link to="/contact" className="hover:text-primary transition-colors">اتصل بنا</Link></li>
                                <li><Link to="/privacy" className="hover:text-primary transition-colors">سياسة الخصوصية</Link></li>
                                <li><Link to="/terms" className="hover:text-primary transition-colors">سياسة الاستخدام</Link></li>
                            </ul>
                        </div>
                        <div>
                            <h4 className="font-bold mb-4 text-slate-900">تواصل معنا</h4>
                            <ul className="space-y-2 text-sm text-slate-500">
                                <li className="font-mono dir-ltr">Info@mutqan-sa.com</li>
                            </ul>
                        </div>
                    </div>
                    <div className="border-t border-slate-100 pt-8 text-center text-sm text-slate-400">
                        © {new Date().getFullYear()} مُتقَن لتقنية المعلومات. جميع الحقوق محفوظة.
                    </div>
                </div>
            </footer>
        </div>
    )
}
