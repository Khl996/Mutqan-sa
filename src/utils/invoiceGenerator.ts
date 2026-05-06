import type { BillingInvoice } from "@/hooks/useBillingEngine";
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

// Helper to fetch file as base64
const fetchFileAsBase64 = async (url: string): Promise<string> => {
    try {
        const response = await fetch(url);
        if (!response.ok) throw new Error(`Failed to fetch ${url}`);
        const blob = await response.blob();
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => {
                const result = reader.result as string;
                // Remove data URL prefix for jsPDF addImage (sometimes needed, sometimes not)
                // For addFileToVFS, we usually need the raw base64 without prefix.
                // However, reader.result includes "data:application/octet-stream;base64,"
                resolve(result);
            };
            reader.onerror = reject;
            reader.readAsDataURL(blob);
        });
    } catch (error) {
        console.error("Error fetching file:", error);
        return "";
    }
};

export const generateInvoicePDF = async (invoice: BillingInvoice, tenantName: string, tenantAddress?: string | null) => {
    const doc = new jsPDF();

    // -- 1. إعداد الخط العربي والقوالب (اللوجو) --
    let fontBase64 = "";
    let logoBase64 = "";

    try {
        // محاولة جلب خط عربي (Amiri) لدعم اللغة العربية
        // نستخدم رابط CDN موثوق (Google Fonts Repository)
        // ملاحظة: قد يتطلب الأمر تكوين CORS على الخادم، ولكن GitHub Raw يعمل عادةً.
        // بدلاً من ذلك، نستخدم رابط مباشر إذا أمكن.
        const fontUrl = "https://raw.githubusercontent.com/google/fonts/main/ofl/amiri/Amiri-Regular.ttf";
        const logoUrl = "/images/brand/mutqan-symbol-white.png";

        const [fontDataUi, logoDataUi] = await Promise.all([
            fetchFileAsBase64(fontUrl),
            fetchFileAsBase64(logoUrl)
        ]);

        fontBase64 = fontDataUi.split(',')[1]; // Remove prefix
        logoBase64 = logoDataUi; // Keep prefix for addImage usually, or remove depending on version. jsPDF addImage handles data URI.

        if (fontBase64) {
            doc.addFileToVFS("Amiri-Regular.ttf", fontBase64);
            doc.addFont("Amiri-Regular.ttf", "Amiri", "normal");
            doc.setFont("Amiri");
        }
    } catch (e) {
        console.warn("Failed to load resources (font/logo):", e);
    }

    // -- 2. الهيدر (Header) --
    doc.setFillColor(43, 140, 135);
    doc.rect(0, 0, 210, 50, 'F');

    // الشعار (Logo)
    if (logoBase64) {
        try {
            doc.addImage(logoBase64, 'PNG', 15, 10, 30, 30);
        } catch (e) {
            doc.setTextColor(255, 255, 255);
            doc.setFontSize(16);
            doc.text("Mutqan", 20, 25);
        }
    } else {
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(16);
        doc.text("Mutqan", 20, 35);
    }

    // عنوان الفاتورة
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(24);
    doc.text("INVOICE", 190, 25, { align: "right" });
    doc.setFontSize(10);
    doc.text("Official Receipt", 190, 31, { align: "right" });

    // معلوماتنا
    doc.setTextColor(80, 80, 80);
    doc.setFontSize(10);
    const companyInfoY = 60;

    // Use font if loaded, else fallback
    if (fontBase64) doc.setFont("Amiri");
    else doc.setFont("helvetica", "bold");

    doc.text("Mutqan Platform", 20, companyInfoY);

    if (!fontBase64) doc.setFont("helvetica", "normal");

    doc.text("Saudi Arabia", 20, companyInfoY + 5);
    doc.text("Freelance Doc: FL-814908933", 20, companyInfoY + 10);
    doc.text("info@mutqan-sa.com", 20, companyInfoY + 15);
    doc.text("www.mutqan-sa.com", 20, companyInfoY + 20);

    // تفاصيل الفاتورة
    doc.text(`Invoice No:`, 140, companyInfoY);
    doc.text(`${invoice.invoice_number}`, 190, companyInfoY, { align: "right" });

    doc.text(`Date:`, 140, companyInfoY + 6);
    doc.text(`${new Date(invoice.created_at).toLocaleDateString('en-GB')}`, 190, companyInfoY + 6, { align: "right" });

    // -- 3. معلومات العميل (Bill To) --
    doc.setFillColor(245, 247, 250);
    doc.roundedRect(20, 90, 170, 20, 2, 2, 'F');

    doc.setFontSize(10);
    doc.setTextColor(100, 100, 100);
    doc.text("Bill To:", 25, 97);

    doc.setFontSize(12);
    doc.setTextColor(0, 0, 0);
    if (!fontBase64) doc.setFont("helvetica", "bold");

    // Arabic Name Support!
    doc.text(tenantName || "Valued Customer", 25, 105);

    if (tenantAddress) {
        doc.setFontSize(10);
        doc.setTextColor(120, 120, 120);
        doc.text(tenantAddress, 25, 112);
    }

    // -- 4. الجدول (Table) --
    const periodLabel = (invoice.billing_period_start && invoice.billing_period_end)
        ? `${new Date(invoice.billing_period_start).toLocaleDateString('en-GB')} – ${new Date(invoice.billing_period_end).toLocaleDateString('en-GB')}`
        : null

    const tableBody: [string, string][] = [
        [
            invoice.notes || 'Platform Subscription',
            `${Number(invoice.subtotal).toFixed(2)} SAR`
        ]
    ]
    if (periodLabel) {
        tableBody.push([`Billing period: ${periodLabel}`, ''])
    }
    if (invoice.discount_amount && Number(invoice.discount_amount) > 0) {
        tableBody.push([`Discount`, `-${Number(invoice.discount_amount).toFixed(2)} SAR`])
    }

    autoTable(doc, {
        startY: 115,
        head: [['Description', 'Amount']],
        body: tableBody,
        theme: 'grid',
        headStyles: {
            fillColor: [43, 140, 135],
            textColor: 255,
            fontStyle: 'bold',
            halign: 'left',
            font: fontBase64 ? "Amiri" : "helvetica" // Apply font to table header
        },
        styles: {
            fontSize: 10,
            cellPadding: 6,
            textColor: 50,
            font: fontBase64 ? "Amiri" : "helvetica" // Apply font to table body
        },
        columnStyles: {
            1: { halign: 'right', fontStyle: 'bold' }
        }
    });

    // -- 5. الإجماليات (Totals) --
    // @ts-expect-error - jspdf-autotable extends jsPDF prototype
    const finalY = doc.lastAutoTable.finalY + 10;

    doc.setFontSize(10);
    if (!fontBase64) doc.setFont("helvetica", "normal");

    // Subtotal
    doc.text("Subtotal:", 140, finalY);
    doc.text(`${Number(invoice.subtotal).toFixed(2)} SAR`, 190, finalY, { align: "right" });

    const hasTax = Number(invoice.tax_amount) > 0
    let totalsY = finalY

    if (hasTax) {
        const taxRate = Math.round((invoice.tax_rate ?? 0) * 100)
        doc.text(`VAT / ضريبة القيمة المضافة (${taxRate}%):`, 140, totalsY + 7);
        doc.text(`${Number(invoice.tax_amount).toFixed(2)} SAR`, 190, totalsY + 7, { align: "right" });
        totalsY += 7
    }

    doc.setDrawColor(220, 220, 220);
    doc.line(140, totalsY + 5, 190, totalsY + 5);

    doc.setFontSize(14);
    if (!fontBase64) doc.setFont("helvetica", "bold");
    doc.setTextColor(43, 140, 135);
    doc.text("Total:", 140, totalsY + 15);
    doc.text(`${Number(invoice.total).toFixed(2)} SAR`, 190, totalsY + 15, { align: "right" });

    // -- 6. التذييل (Footer) --
    const pageHeight = doc.internal.pageSize.height;
    doc.setFontSize(8);
    doc.setTextColor(120, 120, 120);
    if (!fontBase64) doc.setFont("helvetica", "italic");

    if (!hasTax) {
        doc.text("* Not subject to VAT (Freelance Document).", 105, pageHeight - 15, { align: "center" });
    }

    if (!fontBase64) doc.setFont("helvetica", "normal");
    doc.text("Thank you for trusting Mutqan.", 105, pageHeight - 10, { align: "center" });

    doc.save(`Invoice-${invoice.invoice_number}.pdf`);
};
