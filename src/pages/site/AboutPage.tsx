
import { Link } from 'react-router-dom'
import { ArrowLeft, Building2, Stethoscope, GraduationCap, Factory } from 'lucide-react'
import { useTranslation } from 'react-i18next'

export default function AboutPage() {
    const { t } = useTranslation()

    return (
        <div className="min-h-screen bg-slate-50 font-cairo text-slate-900" dir="rtl">
            {/* Header */}
            <nav className="fixed top-0 w-full z-50 border-b border-white/20 bg-white/70 backdrop-blur-xl supports-[backdrop-filter]:bg-white/60">
                <div className="container mx-auto px-4 h-20 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <Link to="/">
                            <img src="/images/logo.png" alt="Mutqan Logo" className="h-12 w-auto object-contain" />
                        </Link>
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

            <main className="pt-32 pb-20">
                <div className="container mx-auto px-4">
                    <div className="max-w-4xl mx-auto space-y-12">
                        <div className="text-center space-y-6">
                            <h1 className="text-4xl md:text-5xl font-black text-slate-900 leading-tight">تقنية وُلدت في الميدان..<br />لتنهي فوضى الصيانة.</h1>
                        </div>

                        <div className="bg-white rounded-3xl p-8 md:p-12 shadow-sm border border-slate-100 space-y-10">
                            <div>
                                <h2 className="text-2xl font-bold text-primary mb-4 flex items-center gap-2">
                                    <span className="w-2 h-8 bg-secondary rounded-full"></span>
                                    القصة
                                </h2>
                                <p className="text-slate-600 leading-loose text-lg text-justify">
                                    لم يبدأ "مُتقَن" في مكاتب الشركات التقنية المكيفة، بل بدأ من قلب غرف المحركات، وبين أروقة المنشآت، ووسط ضجيج المعدات.
                                    نحن مهندسون ميدانيون، عشنا التحدي يومياً: أوراق تضيع، جداول صيانة تُنسى، وأعطال مفاجئة تربك العمل. أدركنا أن الحلول العالمية "معقدة ومكلفة"، والحلول التقليدية "لا تواكب السرعة".
                                    لذا، قررنا بناء "مُتقَن". ليس مجرد نظام لإدارة الصيانة، بل شريك رقمي يفهم لغة المهندس، ويحمي أصول المستثمر، ويمنح المدير راحة البال.
                                </p>
                            </div>

                            <hr className="border-slate-100" />

                            <div>
                                <h2 className="text-2xl font-bold text-primary mb-4 flex items-center gap-2">
                                    <span className="w-2 h-8 bg-secondary rounded-full"></span>
                                    رؤيتنا
                                </h2>
                                <p className="text-slate-600 leading-relaxed text-lg text-justify">
                                    أن نجعل "الصيانة الرقمية" ثقافة سهلة ومتاحة لكل منشأة في المملكة، لننتقل سوياً من مرحلة "إطفاء الحرائق" (React) إلى مرحلة "التحكم والوقاية" (Predict).
                                </p>
                            </div>

                            <hr className="border-slate-100" />

                            <div>
                                <h2 className="text-2xl font-bold text-primary mb-6 flex items-center gap-2">
                                    <span className="w-2 h-8 bg-secondary rounded-full"></span>
                                    لماذا نحن؟
                                </h2>
                                <ul className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                    <li className="bg-slate-50 p-6 rounded-2xl border border-slate-100 hover:shadow-md transition-all">
                                        <div className="w-10 h-10 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center mb-4">
                                            <Building2 className="w-5 h-5" />
                                        </div>
                                        <h3 className="font-bold text-slate-800 mb-2">منكم وإليكم</h3>
                                        <p className="text-slate-500 text-sm leading-relaxed">
                                            صُمم النظام بأيدي مهندسين سعوديين يعرفون تحديات السوق المحلي.
                                        </p>
                                    </li>
                                    <li className="bg-slate-50 p-6 rounded-2xl border border-slate-100 hover:shadow-md transition-all">
                                        <div className="w-10 h-10 bg-green-100 text-green-600 rounded-full flex items-center justify-center mb-4">
                                            <ArrowLeft className="w-5 h-5 rotate-45" />
                                        </div>
                                        <h3 className="font-bold text-slate-800 mb-2">البساطة أولاً</h3>
                                        <p className="text-slate-500 text-sm leading-relaxed">
                                            لا تحتاج لخبرة تقنية لتدير صيانتك؛ واجهاتنا تتحدث لغتك.
                                        </p>
                                    </li>
                                    <li className="bg-slate-50 p-6 rounded-2xl border border-slate-100 hover:shadow-md transition-all">
                                        <div className="w-10 h-10 bg-purple-100 text-purple-600 rounded-full flex items-center justify-center mb-4">
                                            <Factory className="w-5 h-5" />
                                        </div>
                                        <h3 className="font-bold text-slate-800 mb-2">متوافق ومحلي</h3>
                                        <p className="text-slate-500 text-sm leading-relaxed">
                                            سيرفراتنا، فواتيرنا، وأنظمتنا مصممة لتتوافق مع متطلبات العمل في المملكة.
                                        </p>
                                    </li>
                                </ul>
                            </div>
                        </div>

                        <div className="text-center">
                            <h3 className="text-2xl font-bold text-slate-900 mb-8">نخدم مختلف القطاعات</h3>
                            <div className="flex flex-wrap justify-center gap-8">
                                <div className="flex flex-col items-center gap-3 p-6 bg-white rounded-2xl border border-slate-100 shadow-sm w-40">
                                    <Building2 className="w-8 h-8 text-primary" />
                                    <span className="font-bold text-sm text-slate-700">المجمعات التجارية</span>
                                </div>
                                <div className="flex flex-col items-center gap-3 p-6 bg-white rounded-2xl border border-slate-100 shadow-sm w-40">
                                    <Stethoscope className="w-8 h-8 text-primary" />
                                    <span className="font-bold text-sm text-slate-700">القطاع الطبي</span>
                                </div>
                                <div className="flex flex-col items-center gap-3 p-6 bg-white rounded-2xl border border-slate-100 shadow-sm w-40">
                                    <GraduationCap className="w-8 h-8 text-primary" />
                                    <span className="font-bold text-sm text-slate-700">التعليم</span>
                                </div>
                                <div className="flex flex-col items-center gap-3 p-6 bg-white rounded-2xl border border-slate-100 shadow-sm w-40">
                                    <Factory className="w-8 h-8 text-primary" />
                                    <span className="font-bold text-sm text-slate-700">الصناعة</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </main>

            <footer className="bg-white border-t border-slate-200 py-12">
                <div className="container mx-auto px-4 text-center">
                    <p className="text-slate-500 text-sm">
                        © {new Date().getFullYear()} مُتقَن لتقنية المعلومات. جميع الحقوق محفوظة.
                    </p>
                </div>
            </footer>
        </div>
    )
}
