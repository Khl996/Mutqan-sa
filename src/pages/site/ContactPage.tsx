
import { Link } from 'react-router-dom'
import { Mail, Send } from 'lucide-react'
import { useTranslation } from 'react-i18next'

export default function ContactPage() {
    const { t } = useTranslation()

    return (
        <div className="min-h-screen bg-slate-50 font-cairo text-slate-900" dir="rtl">
            <nav className="fixed top-0 w-full z-50 border-b border-white/20 bg-white/70 backdrop-blur-xl supports-[backdrop-filter]:bg-white/60">
                <div className="container mx-auto px-4 h-20 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <Link to="/">
                            <img src="/images/logo.png" alt="Mutqan Logo" className="h-12 w-auto object-contain" />
                        </Link>
                    </div>
                    <Link
                        to="/register"
                        className="bg-primary hover:bg-primary/90 text-white px-6 py-2.5 rounded-full text-sm font-bold transition-all shadow-lg shadow-primary/20 hover:shadow-primary/40 hover:-translate-y-0.5"
                    >
                        جرب مُتقَن مجاناً
                    </Link>
                </div>
            </nav>

            <main className="pt-32 pb-20">
                <div className="container mx-auto px-4">
                    <div className="text-center mb-16 space-y-4">
                        <h1 className="text-4xl md:text-5xl font-black text-slate-900">تواصل معنا</h1>
                        <p className="text-xl text-slate-600 max-w-2xl mx-auto">
                            فريقنا جاهز للإجابة على جميع استفساراتكم ومساعدتكم في بدء رحلتكم مع مُتقَن.
                        </p>
                    </div>

                    <div className="max-w-4xl mx-auto space-y-12">

                        {/* Contact Info - Centered */}
                        <div className="bg-white p-8 rounded-3xl border border-slate-100 shadow-sm hover:shadow-md transition-shadow">
                            <h2 className="text-2xl font-bold text-slate-900 mb-6 text-center">معلومات التواصل</h2>
                            <div className="flex flex-col md:flex-row items-center justify-center gap-8">
                                <div className="flex items-center gap-4 bg-purple-50 p-6 rounded-2xl border border-purple-100 w-full md:w-auto">
                                    <div className="p-3 bg-white text-purple-600 rounded-xl shadow-sm">
                                        <Mail className="w-6 h-6" />
                                    </div>
                                    <div>
                                        <h3 className="font-bold text-slate-800">البريد الإلكتروني</h3>
                                        <p className="text-slate-500 mt-1"><a href="mailto:info@mutqan-sa.com" className="hover:text-primary font-mono dir-ltr">info@mutqan-sa.com</a></p>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Banner */}
                        <div className="bg-slate-900 p-8 rounded-3xl text-white relative overflow-hidden text-center">
                            <div className="absolute top-0 right-0 w-64 h-64 bg-primary/20 rounded-full blur-[80px] -translate-y-1/2 translate-x-1/3 pointer-events-none"></div>
                            <h3 className="text-xl font-bold mb-4 relative z-10">هل أنت مستعد لتجربة مُتقَن؟</h3>
                            <p className="text-slate-300 mb-6 relative z-10">ابدأ فترتك التجريبية المجانية لمدة 14 يوماً واستمتع بكافة الميزات.</p>
                            <Link to="/register" className="inline-block px-10 py-3 bg-primary hover:bg-primary/90 rounded-xl font-bold text-white transition-colors relative z-10">
                                ابدأ الآن مجاناً
                            </Link>
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
