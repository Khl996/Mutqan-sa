import React from 'react'
import ReactDOM from 'react-dom/client'
import WorkOrderPrintView from '@/components/work-orders/WorkOrderPrintView'
import { mergeWithDefaults } from '@/config/tenantSettings'
import type { ProofTenantContext } from '@/hooks/useTenantSettings'
import type { OperationLog, WorkOrder } from '@/hooks/useWorkOrders'
import '@/i18n/config'
import '@/index.css'

const language = new URLSearchParams(window.location.search).get('lang') === 'en' ? 'en' : 'ar'
const settings = mergeWithDefaults(null)
settings.pdf_identity = {
    ...settings.pdf_identity,
    organization_name: 'Mutqan Facility Services',
    organization_name_ar: 'منشأة متقن للخدمات',
    footer_note: language === 'ar'
        ? 'نسخة تجريبية للمراجعة البصرية'
        : 'Design-review fixture',
    // The fixture keeps recorded evidence visible in the PDF inventory while
    // deliberately excluding hosted Storage reads from the local review path.
    show_reporter_images: false,
    show_before_after_images: false,
}

const proofTenant: ProofTenantContext = {
    id: 'tenant-proof-preview',
    name: 'Mutqan Facility Services',
    name_ar: 'منشأة متقن للخدمات',
    settings,
}

const workOrder: WorkOrder = {
    id: 'work-order-proof-preview',
    tenant_id: proofTenant.id,
    code: 'WO-2026-0147',
    title: language === 'ar' ? 'إعادة تأهيل مضخة مياه التبريد' : 'Cooling-water pump rehabilitation',
    description: language === 'ar'
        ? 'معالجة ارتفاع الاهتزاز واستبدال مانع التسرب الميكانيكي، ثم إعادة المحاذاة واختبار التشغيل تحت الحمل.'
        : 'Resolve excessive vibration, replace the mechanical seal, realign the assembly, and test it under load.',
    issue_type_id: 'issue-mechanical',
    issue_type: 'Mechanical',
    status: 'completed',
    priority: 'high',
    reported_by: 'reporter-1',
    assigned_to: 'technician-1',
    assigned_team: 'team-1',
    building_id: 'building-1',
    floor_id: 'floor-1',
    department_id: null,
    room_id: 'room-1',
    asset_id: 'asset-1',
    reported_at: '2026-08-24T05:10:00.000Z',
    start_time: '2026-08-24T06:00:00.000Z',
    end_time: '2026-08-24T08:35:00.000Z',
    completed_at: '2026-08-24T09:00:00.000Z',
    due_date: null,
    estimated_cost: 1800,
    actual_cost: 1620,
    attachments: [],
    before_images: [],
    after_images: [],
    created_at: '2026-08-24T05:10:00.000Z',
    updated_at: '2026-08-24T09:00:00.000Z',
    technician_notes: language === 'ar'
        ? 'تم عزل المعدة والتحقق من انعدام الطاقة، ثم استبدال مانع التسرب وضبط المحاذاة بالليزر. انتهى اختبار التشغيل دون تسرب وباهتزاز ضمن الحد المقبول.'
        : 'Isolated the equipment, verified zero energy, replaced the seal, and laser-aligned the assembly. The loaded test completed without leakage and within the vibration limit.',
    supervisor_notes: language === 'ar' ? 'تمت مراجعة العزل ونتائج الاختبار الميداني.' : 'Isolation and field-test results reviewed.',
    engineer_notes: language === 'ar' ? 'القيم النهائية مقبولة تشغيليًا.' : 'Final readings are operationally acceptable.',
    reporter_notes: language === 'ar' ? 'أعيدت المعدة للخدمة.' : 'Equipment returned to service.',
    reporter_image_url: null,
    pdf_snapshot: {
        contract_version: 2,
        code: 'WO-2026-0147',
        title: language === 'ar' ? 'إعادة تأهيل مضخة مياه التبريد' : 'Cooling-water pump rehabilitation',
        description: language === 'ar'
            ? 'معالجة ارتفاع الاهتزاز واستبدال مانع التسرب الميكانيكي، ثم إعادة المحاذاة واختبار التشغيل تحت الحمل.'
            : 'Resolve excessive vibration, replace the mechanical seal, realign the assembly, and test it under load.',
        priority: 'high',
        created_at: '2026-08-24T05:10:00.000Z',
        closed_at: '2026-08-24T09:00:00.000Z',
        reporter_notes: language === 'ar' ? 'أعيدت المعدة للخدمة.' : 'Equipment returned to service.',
        reporter_image_url: null,
        before_images: ['tenant-proof-preview/work-order-proof-preview/before/photo-1.jpg'],
        after_images: [
            'tenant-proof-preview/work-order-proof-preview/after/photo-1.jpg',
            'tenant-proof-preview/work-order-proof-preview/after/photo-2.jpg',
        ],
        issue_type: { id: 'issue-mechanical', name: 'Mechanical', name_ar: 'ميكانيكي' },
        building: { id: 'building-1', name: 'Utilities Building', name_ar: 'مبنى الخدمات' },
        floor: { id: 'floor-1', name: 'Ground floor', name_ar: 'الدور الأرضي' },
        room: { id: 'room-1', name: 'Pump room', name_ar: 'غرفة المضخات' },
        assigned_team: { id: 'team-1', name: 'Mechanical Team', name_ar: 'الفريق الميكانيكي' },
        assignee: { id: 'technician-1', full_name: language === 'ar' ? 'فهد القحطاني' : 'Fahad Alqahtani' },
        reporter: { id: 'reporter-1', full_name: language === 'ar' ? 'سلمان الدوسري' : 'Salman Aldosari' },
        closed_by: { id: 'manager-1', full_name: language === 'ar' ? 'عبدالله الحربي' : 'Abdullah Alharbi' },
        asset: {
            id: 'asset-1',
            code: 'CHWP-03',
            name: 'Cooling Water Pump 03',
            name_ar: 'مضخة مياه التبريد 03',
        },
    },
    reporter: { id: 'reporter-1', full_name: 'Salman Aldosari', full_name_ar: 'سلمان الدوسري' },
    assignee: { id: 'technician-1', full_name: 'Fahad Alqahtani', full_name_ar: 'فهد القحطاني' },
    assignedTeam: { id: 'team-1', code: 'MECH', name: 'Mechanical Team', name_ar: 'الفريق الميكانيكي' },
    building: { id: 'building-1', name: 'Utilities Building', name_ar: 'مبنى الخدمات' },
    floor: { id: 'floor-1', name: 'Ground floor', name_ar: 'الدور الأرضي' },
    room: { id: 'room-1', name: 'Pump room', name_ar: 'غرفة المضخات' },
    asset: { id: 'asset-1', code: 'CHWP-03', name: 'Cooling Water Pump 03', name_ar: 'مضخة مياه التبريد 03' },
}

const logs: OperationLog[] = [
    {
        id: 'log-1', tenant_id: proofTenant.id, code: 'LOG-1', type: 'governance', asset_id: 'asset-1',
        work_order_id: workOrder.id, description: language === 'ar' ? 'اعتماد مسار التنفيذ' : 'Execution route approved',
        reason: language === 'ar' ? 'أولوية عالية مع توقف جزئي' : 'High priority with partial outage',
        performed_by: 'manager-1', technician_name: language === 'ar' ? 'عبدالله الحربي' : 'Abdullah Alharbi',
        timestamp: '2026-08-24T05:30:00.000Z', created_at: '2026-08-24T05:30:00.000Z', status: 'completed',
    },
    {
        id: 'log-2', tenant_id: proofTenant.id, code: 'LOG-2', type: 'maintenance', asset_id: 'asset-1',
        work_order_id: workOrder.id, description: language === 'ar' ? 'إتمام الإصلاح والاختبار' : 'Repair and testing completed',
        reason: null, performed_by: 'technician-1', technician_name: language === 'ar' ? 'فهد القحطاني' : 'Fahad Alqahtani',
        timestamp: '2026-08-24T08:35:00.000Z', created_at: '2026-08-24T08:35:00.000Z', status: 'completed',
    },
    {
        id: 'log-3', tenant_id: proofTenant.id, code: 'LOG-3', type: 'status_change', asset_id: 'asset-1',
        work_order_id: workOrder.id, description: language === 'ar' ? 'إغلاق أمر العمل' : 'Work order closed',
        reason: null, performed_by: 'manager-1', technician_name: language === 'ar' ? 'عبدالله الحربي' : 'Abdullah Alharbi',
        timestamp: '2026-08-24T09:00:00.000Z', created_at: '2026-08-24T09:00:00.000Z', status: 'completed',
    },
]

document.documentElement.lang = language
document.documentElement.dir = language === 'ar' ? 'rtl' : 'ltr'
document.title = language === 'ar'
    ? `إثبات الإنجاز — ${workOrder.code}`
    : `Proof of Work — ${workOrder.code}`

async function printFixture() {
    await document.fonts.ready
    window.print()
}

ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
        <>
            <div className="fixed start-5 top-5 z-10 print:hidden">
                <button
                    type="button"
                    onClick={() => void printFixture()}
                    className="rounded-lg bg-slate-950 px-4 py-3 text-sm font-bold text-white shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500"
                >
                    {language === 'ar' ? 'طباعة أو حفظ PDF' : 'Print or save PDF'}
                </button>
            </div>
            <div className="mx-auto my-8 w-[210mm] overflow-hidden bg-white shadow-2xl print:m-0 print:shadow-none">
                <WorkOrderPrintView
                    workOrder={workOrder}
                    logs={logs}
                    language={language}
                    generatedAt="2026-08-24T09:05:00.000Z"
                    proofTenant={proofTenant}
                />
            </div>
        </>
    </React.StrictMode>
)
