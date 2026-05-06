
import { Link } from 'react-router-dom'
import { MutqanLogo } from '@/components/ui/MutqanLogo'

export default function TermsOfUsePage() {
    return (
        <div className="min-h-screen bg-slate-50 font-cairo text-slate-900" dir="rtl">
            <nav className="fixed top-0 w-full z-50 border-b border-white/20 bg-white/70 backdrop-blur-xl supports-[backdrop-filter]:bg-white/60">
                <div className="container mx-auto px-4 h-20 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <Link to="/">
                            <MutqanLogo
                                variant="horizontal"
                                size="md"
                                theme="light"
                                label="Mutqan"
                            />
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
                        <h1 className="text-3xl md:text-4xl font-black text-slate-900 mb-8 pb-4 border-b border-slate-100">شروط الاستخدام</h1>

                        <div className="space-y-8 text-slate-600 leading-relaxed text-lg">
                            <section>
                                <h2 className="text-xl font-bold text-slate-800 mb-3">مقدمة</h2>
                                <p>
                                    تحكم هذه الشروط ("الشروط") استخدامك لمنصة مُتقَن (Mutqan) ("المنصة"، "نحن"، "الخاص بنا")، المتاحة عبر الرابط <span className="font-mono dir-ltr select-all">mutqan-sa.com</span>. المنصة مملوكة ومشغلة بموجب وثيقة عمل حر في المملكة العربية السعودية. بمجرد التسجيل أو استخدام الخدمة، فإنك توافق على الالتزام بهذه الشروط.
                                </p>
                            </section>

                            <section>
                                <h2 className="text-xl font-bold text-slate-800 mb-3">1. أهلية الاستخدام والتسجيل</h2>
                                <ul className="list-disc list-inside mt-2 space-y-2 mr-4">
                                    <li>بصفتك مستخدماً، تقر بأنك تملك الأهلية القانونية الكاملة للتعاقد، أو أنك مفوض قانونياً عن المنشأة التي تمثلها (B2B).</li>
                                    <li>أنت مسؤول عن دقة البيانات المدخلة (الاسم، البريد، بيانات المنشأة) وعن الحفاظ على سرية معلومات الدخول الخاصة بحسابك.</li>
                                </ul>
                            </section>

                            <section>
                                <h2 className="text-xl font-bold text-slate-800 mb-3">2. طبيعة الخدمة والترخيص</h2>
                                <ul className="list-disc list-inside mt-2 space-y-2 mr-4">
                                    <li>تمنحك "مُتقَن" ترخيصاً محدوداً، غير حصري، وغير قابل للتحويل لاستخدام برنامج إدارة الصيانة (CMMS) السحابي لأغراضك الداخلية فقط.</li>
                                    <li>لا يجوز لك تأجير، أو إعادة بيع، أو هندسة المنصة عكسياً، أو استنساخ أي جزء من الكود المصدري.</li>
                                </ul>
                            </section>

                            <section>
                                <h2 className="text-xl font-bold text-slate-800 mb-3">3. الاشتراكات والمدفوعات</h2>
                                <ul className="list-disc list-inside mt-2 space-y-2 mr-4">
                                    <li><strong>الرسوم:</strong> يتم دفع رسوم الاشتراك (السنوية) مسبقاً عبر وسائل الدفع المعتمدة في المنصة (مثل بوابة Tap).</li>
                                    <li><strong>الضرائب:</strong> الأسعار المعلنة حالياً لا تشمل ضريبة القيمة المضافة (VAT)، حيث أن المنصة تعمل بموجب وثيقة عمل حر وغير مسجلة في الضريبة حالياً. تحتفظ المنصة بحقها في تعديل الأسعار أو إضافة الضريبة مستقبلاً عند التسجيل الضريبي، وسيتم إشعاركم بذلك.</li>
                                    <li><strong>الاسترجاع:</strong> لا يحق للعميل استرداد المبالغ المدفوعة عن الفترات المتبقية من الاشتراك السنوي إلا في حال وجود خطأ تقني جسيم من جانب المنصة يمنع استخدام الخدمة كلياً.</li>
                                    <li><strong>التجديد والإلغاء:</strong> يجدد الاشتراك تلقائياً ما لم يقم العميل بإلغائه قبل موعد التجديد.
                                        <ul className="list-[circle] list-inside mt-2 space-y-1 mr-6 text-slate-500">
                                            <li>سياسة الإلغاء: في حال قام العميل بإلغاء الاشتراك، يستمر حقه في استخدام المنصة والاستفادة من كافة المزايا المدفوعة حتى نهاية فترة الاشتراك الحالية المدفوعة مسبقاً، ولن يتم تجديد الاشتراك أو خصم مبالغ جديدة بعد انتهائها.</li>
                                        </ul>
                                    </li>
                                </ul>
                            </section>

                            <section>
                                <h2 className="text-xl font-bold text-slate-800 mb-3">4. حدود المسؤولية (إخلاء المسؤولية)</h2>
                                <ul className="list-disc list-inside mt-2 space-y-2 mr-4">
                                    <li>تُقدم الخدمة "كما هي" (As Is). بينما نسعى لضمان استقرار الخدمة، فإننا لا نضمن خلوها تماماً من الأخطاء أو التوقفات الطارئة.</li>
                                    <li>منصة "مُتقَن" هي أداة تقنية مساعدة، ولا نتحمل أي مسؤولية قانونية أو مالية عن القرارات الإدارية، أو تعطل المعدات، أو الخسائر التشغيلية التي قد تنتج عن استخدامك للنظام أو اعتمادك على بياناته.</li>
                                </ul>
                            </section>

                            <section>
                                <h2 className="text-xl font-bold text-slate-800 mb-3">5. حقوق الملكية الفكرية</h2>
                                <p>
                                    جميع الحقوق الفكرية المتعلقة بالمنصة، بما في ذلك البرمجيات، التصاميم، الشعارات، والمحتوى، هي ملكية حصرية لمالك منصة "مُتقَن".
                                </p>
                            </section>

                            <section>
                                <h2 className="text-xl font-bold text-slate-800 mb-3">6. القانون الواجب التطبيق وتسوية النزاعات</h2>
                                <p>
                                    تخضع هذه الشروط لأنظمة المملكة العربية السعودية. في حال نشوب أي نزاع، يتم حله ودياً، وإذا تعذر ذلك، ينعقد الاختصاص للمحاكم المختصة في المملكة العربية السعودية.
                                </p>
                            </section>

                            <div className="pt-8 mt-8 border-t border-slate-100">
                                <p className="text-sm text-slate-500">
                                    لأي استفسارات قانونية، يرجى التواصل معنا عبر: <a href="mailto:info@mutqan-sa.com" className="text-primary hover:underline font-mono dir-ltr">info@mutqan-sa.com</a>
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
