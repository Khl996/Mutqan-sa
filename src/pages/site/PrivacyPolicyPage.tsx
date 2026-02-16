
import { Link } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { useTranslation } from 'react-i18next'

export default function PrivacyPolicyPage() {
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
                    <div className="max-w-4xl mx-auto bg-white p-8 md:p-12 rounded-3xl shadow-sm border border-slate-100">
                        <h1 className="text-3xl md:text-4xl font-black text-slate-900 mb-8 pb-4 border-b border-slate-100">سياسة الخصوصية</h1>

                        <div className="space-y-8 text-slate-600 leading-relaxed text-lg">
                            <section>
                                <h2 className="text-xl font-bold text-slate-800 mb-3">1. تمهيد</h2>
                                <p>
                                    نحترم في "مُتقَن" خصوصيتك ونلتزم بحماية بياناتك الشخصية وفقاً لـ نظام حماية البيانات الشخصية في المملكة العربية السعودية. توضح هذه السياسة كيفية جمعنا واستخدامنا لبياناتك.
                                </p>
                            </section>

                            <section>
                                <h2 className="text-xl font-bold text-slate-800 mb-3">2. البيانات التي نجمعها</h2>
                                <p className="mb-2">نقوم بجمع البيانات التالية لغرض تقديم الخدمة:</p>
                                <ul className="list-disc list-inside mt-2 space-y-2 mr-4">
                                    <li><strong>بيانات الحساب:</strong> الاسم الكامل، البريد الإلكتروني، رقم الجوال.</li>
                                    <li><strong>بيانات التشغيل:</strong> المعلومات التي تدخلها حول المنشآت، الأصول، والمعدات لغرض إدارة الصيانة.</li>
                                    <li><strong>بيانات الدفع:</strong> سجلات العمليات المالية (مع العلم أننا لا نخزن أرقام البطاقات البنكية؛ حيث تتم معالجتها بآمان تام عبر بوابة الدفع "Tap").</li>
                                </ul>
                            </section>

                            <section>
                                <h2 className="text-xl font-bold text-slate-800 mb-3">3. الغرض من معالجة البيانات</h2>
                                <p className="mb-2">تستخدم البيانات حصراً للأغراض التالية:</p>
                                <ul className="list-disc list-inside mt-2 space-y-2 mr-4">
                                    <li>تشغيل الخدمة وتمكينك من إدارة الصيانة.</li>
                                    <li>التواصل معك بخصوص التحديثات، الفواتير، والدعم الفني.</li>
                                    <li>تحسين جودة الخدمة وتطوير المنصة.</li>
                                </ul>
                            </section>

                            <section>
                                <h2 className="text-xl font-bold text-slate-800 mb-3">4. مشاركة البيانات</h2>
                                <p className="mb-2">نلتزم بعدم بيع أو تأجير بياناتك لأي طرف ثالث. تتم مشاركة البيانات فقط في الحالات التالية:</p>
                                <ul className="list-disc list-inside mt-2 space-y-2 mr-4">
                                    <li>مع مزودي الخدمات الأساسيين (مثل مزود الاستضافة Vercel، وبوابة الدفع Tap) لغرض تشغيل الخدمة فقط.</li>
                                    <li>الامتثال لأي طلب قانوني من الجهات الحكومية المختصة في المملكة العربية السعودية.</li>
                                </ul>
                            </section>

                            <section>
                                <h2 className="text-xl font-bold text-slate-800 mb-3">5. حقوقك (كمستخدم)</h2>
                                <p className="mb-2">وفقاً للنظام، يحق لك:</p>
                                <ul className="list-disc list-inside mt-2 space-y-2 mr-4">
                                    <li>الاطلاع على بياناتك الشخصية المسجلة لدينا.</li>
                                    <li>طلب تصحيح البيانات غير الصحيحة.</li>
                                    <li>طلب حذف بياناتك (ما لم يكن هناك مقتضى نظامي للاحتفاظ بها، مثل السجلات المالية للفواتير).</li>
                                </ul>
                            </section>

                            <section>
                                <h2 className="text-xl font-bold text-slate-800 mb-3">6. أمن المعلومات</h2>
                                <p>
                                    نطبق إجراءات أمنية وتقنية وتنظيمية ملائمة لحماية بياناتك من الفقدان أو الدخول غير المشروع، ونستخدم بروتوكولات التشفير القياسية (SSL) لحماية البيانات أثناء النقل.
                                </p>
                            </section>

                            <section>
                                <h2 className="text-xl font-bold text-slate-800 mb-3">7. التغييرات على السياسة</h2>
                                <p>
                                    قد نقوم بتحديث هذه السياسة من وقت لآخر. سيتم إشعارك بأي تغييرات جوهرية عبر البريد الإلكتروني أو إشعار داخل المنصة.
                                </p>
                            </section>

                            <div className="pt-8 mt-8 border-t border-slate-100">
                                <p className="text-sm text-slate-500">
                                    لأي استفسارات، يرجى التواصل معنا عبر: <a href="mailto:Info@mutqan-sa.com" className="text-primary hover:underline font-mono dir-ltr">Info@mutqan-sa.com</a>
                                </p>
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
