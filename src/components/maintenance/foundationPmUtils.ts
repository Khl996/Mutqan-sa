import type {
    PMFrequencyType,
    PMGenerationMode,
    PMItemType,
    PMJobPlanInput,
    PMJobPlanItemInput,
    PMJsonItem,
    PMPriority,
    PMScheduleInput,
    PMScheduleStatus,
} from '@/hooks/usePMFoundation'

export type PMCopy = typeof en

export const FREQUENCIES: PMFrequencyType[] = ['daily', 'weekly', 'monthly', 'quarterly', 'semi_annual', 'annual', 'custom']
export const ITEM_TYPES: PMItemType[] = ['yes_no', 'numeric', 'text', 'photo']
export const SCHEDULE_STATUSES: PMScheduleStatus[] = ['draft', 'active', 'paused', 'archived']
export const PRIORITIES: PMPriority[] = ['low', 'medium', 'high', 'critical']

export const en = {
    title: 'Preventive Maintenance',
    subtitle: 'Foundation-based PM administration: job plans, schedules, generated work orders, and technician execution.',
    dashboard: 'Dashboard',
    reports: 'Reports',
    jobPlans: 'Job Plans',
    schedules: 'Schedules',
    workOrders: 'Work Orders',
    createJobPlan: 'New Job Plan',
    editJobPlan: 'Edit Job Plan',
    createSchedule: 'New Schedule',
    editSchedule: 'Edit Schedule',
    search: 'Search',
    all: 'All',
    save: 'Save',
    cancel: 'Cancel',
    backToMaintenance: 'Back to maintenance',
    openDetails: 'Open details',
    archive: 'Archive',
    execute: 'Execute',
    printPdf: 'Print / PDF',
    workOrderPdf: 'Work order PDF',
    executionReportPdf: 'Execution report PDF',
    pmReport: 'PM report',
    pmCompliance: 'PM compliance',
    overdueWorkOrders: 'Overdue work orders',
    start: 'Start',
    complete: 'Complete',
    noData: 'No records yet.',
    generateNow: 'Generate work orders now',
    generating: 'Generating...',
    generatedLabel: 'generated',
    generatedWorkOrdersMessage: 'Created {count} work orders.',
    noWorkOrdersGeneratedMessage: 'No work orders were created. Check that a PM Schedule is active, due, and has linked assets.',
    generationHint: 'Generate due active PM schedules into work orders when you are ready.',
    zeroGenerationHint: 'No eligible schedules were due. Check that a PM Schedule is active, due, and has linked assets.',
    generationFailed: 'Could not generate work orders',
    archiveConfirmTitle: 'Confirm archive',
    archiveConfirmDescription: 'This record will be archived and hidden from normal operational use.',
    archiveConfirmAction: 'Archive',
    completeBlockedHint: 'Complete {count} required checks before closing this work order.',
    checklistLockedByOpenWos: 'This job plan has open work orders. Finish or cancel them before changing checklist items.',
    workflowPlan: 'Create job plan',
    workflowSchedule: 'Create PM schedule',
    workflowGenerate: 'Generate work orders',
    workflowExecute: 'Execute work order',
    workOrdersEmptyTitle: 'No generated work orders yet',
    workOrdersEmptyHint: 'Check that there is an active, due PM Schedule, or generate work orders now.',
    jobPlansEmptyTitle: 'No job plans yet',
    jobPlansEmptyHint: 'Create the reusable checklist and execution instructions first.',
    schedulesEmptyTitle: 'Preventive maintenance has not started yet',
    schedulesEmptyHint: 'Preventive maintenance helps move the facility from reactive work to proactive control. Create a plan or schedule to reduce recurring failures.',
    noMatchingRecordsTitle: 'No matching records',
    noMatchingRecordsHint: 'Adjust the search or filters to see more PM records.',
    operationalSummary: 'Operational summary',
    operationalSummaryHint: 'Use these cards to see whether PM work is ready, late, generated, or completed.',
    activeSchedules: 'Active schedules',
    activeSchedulesHint: 'PM schedules currently allowed to generate work orders.',
    dueToday: 'Due today',
    dueTodayHint: 'Active PM schedules whose next due date is today.',
    generatedWorkOrders: 'Generated work orders',
    generatedWorkOrdersHint: 'Preventive work orders created from PM schedules.',
    completedOnTimeHint: 'Generated PM work orders completed within the compliance window.',
    completedLateHint: 'Generated PM work orders completed after the compliance deadline.',
    overdueHint: 'Generated PM work orders currently past compliance deadline.',
    dueStatus: 'Due status',
    dueNow: 'Due now',
    dueTodayStatus: 'Due today',
    dueSoonLead: 'Ready in lead time',
    notDueYet: 'Not due yet',
    upcoming: 'Upcoming',
    inactive: 'Inactive',
    noNextDueDate: 'No next due date',
    noAssetsLinked: 'No linked assets',
    eligibleForGeneration: 'Eligible for generation',
    eligibleYes: 'Yes',
    eligibleNo: 'No',
    lastGenerated: 'Last generated',
    neverGenerated: 'Never generated',
    assetsLinked: 'Assets linked',
    totalGenerated: 'Total generated',
    basicInfo: 'Basic info',
    linkedAssets: 'Linked assets',
    itemType: 'Item type',
    sortOrder: 'Sort order',
    lastGenerationInfo: 'Last generation info',
    noItems: 'No checklist items.',
    noAssets: 'No linked assets.',
    createdAt: 'Created',
    updatedAt: 'Updated',
    version: 'Version',
    usageCount: 'Usage',
    trigger: 'Trigger',
    startDate: 'Start date',
    endDate: 'End date',
    leadTime: 'Lead time',
    defaultPriority: 'Default priority',
    loading: 'Loading PM module...',
    loadingExecution: 'Loading work order...',
    saving: 'Saving...',
    moduleDisabled: 'Preventive maintenance module is not enabled for this tenant.',
    code: 'Code',
    name: 'Name',
    arabicName: 'Arabic name',
    description: 'Description',
    category: 'Category',
    status: 'Status',
    estimatedDuration: 'Estimated duration',
    safetyNotes: 'Safety notes',
    requiredSkill: 'Required skill',
    requiredRole: 'Required role',
    tools: 'Tools',
    parts: 'Parts',
    materials: 'Materials',
    references: 'Reference docs',
    checklist: 'Checklist',
    itemLabel: 'Item label',
    required: 'Required',
    critical: 'Critical',
    unit: 'Unit',
    addItem: 'Add item',
    jobPlan: 'Job plan',
    generationMode: 'Generation mode',
    frequency: 'Frequency',
    interval: 'Interval',
    nextDue: 'Next due',
    complianceWindow: 'Compliance window',
    assets: 'Assets',
    sourceSchedule: 'Source schedule',
    sourceScheduleId: 'Source schedule ID',
    assetCount: 'Asset count',
    checksProgress: 'Checks progress',
    priority: 'Priority',
    scheduled: 'Scheduled',
    deadline: 'Deadline',
    modeBatch: 'Batch route',
    modePerAsset: 'Per asset',
    modeBatchHint: 'One work order covers all linked assets in a single route.',
    modePerAssetHint: 'One separate work order is created for each linked asset.',
    dueSoon: 'Due soon',
    overdue: 'Overdue',
    completedOnTime: 'Completed on time',
    completedLate: 'Completed late',
    compliance: 'Compliance',
    total: 'Total',
    technicianView: 'Technician execution',
    checks: 'Checks',
    photoUrl: 'Photo URL',
    choosePhoto: 'Choose photo',
    uploadPhoto: 'Upload photo',
    replacePhoto: 'Replace photo',
    removePhoto: 'Remove photo',
    photoPreview: 'Photo preview',
    photoUploadSuccess: 'Photo uploaded',
    photoRemoveSuccess: 'Photo removed',
    invalidPhotoType: 'Use JPG, PNG, WebP, HEIC, or HEIF only.',
    photoTooLarge: 'Image must be 5 MB or smaller.',
    photoPreviewFailed: 'Could not load photo preview.',
    selectedFile: 'Selected file',
    notes: 'Notes',
    workOrderInfo: 'Work order info',
    currentAsset: 'Current asset',
    assetList: 'Assets in this route',
    requiredItems: 'Required checks',
    executionNotes: 'Execution notes',
    startExecution: 'Start execution',
    completeWorkOrder: 'Complete work order',
    saveItem: 'Save check',
    requiredRemaining: 'Required remaining',
    completedStatus: 'Completed',
    executionCompleted: 'This work order is completed.',
    checkSaved: 'Check saved',
    executionError: 'Execution action failed',
    noChecks: 'No checks for this asset.',
    pass: 'Yes / Pass',
    fail: 'No / Fail',
    notApplicable: 'N/A',
    pendingStatus: 'Pending',
    result: 'Result',
    notAvailable: 'Not available',
    photoUrlHint: 'Paste photo URL only',
    selectedAsset: 'Selected asset',
    itemsDone: 'done',
    minutesUnit: 'min',
    daysUnit: 'days',
    statusLabels: {
        draft: 'Draft',
        active: 'Active',
        paused: 'Paused',
        completed: 'Completed',
        archived: 'Archived',
        pending: 'Pending',
        assigned: 'Assigned',
        in_progress: 'In progress',
        pending_supervisor_approval: 'Pending supervisor approval',
        pending_engineer_review: 'Pending engineer review',
        pending_reporter_closure: 'Pending reporter closure',
        auto_closed: 'Auto closed',
        rejected_by_technician: 'Rejected by technician',
        cancelled: 'Cancelled',
        on_hold: 'On hold',
        pass: 'Pass',
        fail: 'Fail',
        na: 'N/A',
    },
    priorityLabels: {
        low: 'Low',
        medium: 'Medium',
        high: 'High',
        critical: 'Critical',
    },
    itemTypeLabels: {
        yes_no: 'Yes / No',
        pass_fail: 'Pass / Fail',
        numeric: 'Numeric',
        text: 'Text',
        photo: 'Photo',
        signature: 'Signature',
        select: 'Select',
        multi_select: 'Multi-select',
        header: 'Section header',
    },
    frequencyLabels: {
        daily: 'Daily',
        weekly: 'Weekly',
        monthly: 'Monthly',
        quarterly: 'Quarterly',
        semi_annual: 'Semi annual',
        annual: 'Annual',
        custom: 'Custom',
    },
    generationEngineSettings: 'Generation engine settings',
    notSpecified: 'Not specified',
    anchorMode: 'Anchor mode',
    anchorFixed: 'Fixed',
    anchorFloating: 'Floating',
    anchorFixedHint: 'The next due date advances when the work order is generated.',
    anchorFloatingHint: 'The next due date advances after the work order is completed or cancelled, based on the anchor point.',
    masterTemplate: 'Master template',
    masterTemplateLinkedWarning: 'This schedule is linked to a master template; some fields cannot be edited directly.',
    engineEnabledBadge: 'Enabled in the generation engine',
    viewForecast: 'View upcoming forecast',
    forecastTitle: 'Upcoming forecast',
    forecastDisclaimer: 'This is a read-only forecast and does not create actual work orders.',
    forecastOccurrence: 'Occurrence',
    dueDate: 'Due date',
    forecastDeferred: 'Deferred by blackout window',
    forecastBlackoutLabel: 'Reason',
    forecastEmpty: 'No upcoming occurrences to forecast.',
    forecastFailed: 'Could not load forecast',
    forecastLoading: 'Loading forecast...',
    deferredBadge: 'Deferred due to a blackout window',
}

export const ar: PMCopy = {
    ...en,
    title: 'الصيانة الوقائية',
    subtitle: 'إدارة PM على نموذج Foundation الجديد: قوالب العمل، الجداول، أوامر العمل الناتجة، وتنفيذ الفني.',
    dashboard: 'لوحة المؤشرات',
    jobPlans: 'قوالب العمل',
    schedules: 'جداول PM',
    workOrders: 'أوامر العمل',
    createJobPlan: 'قالب جديد',
    editJobPlan: 'تعديل القالب',
    createSchedule: 'جدول جديد',
    editSchedule: 'تعديل الجدول',
    search: 'بحث',
    all: 'الكل',
    save: 'حفظ',
    cancel: 'إلغاء',
    backToMaintenance: 'العودة للصيانة',
    openDetails: 'فتح التفاصيل',
    archive: 'أرشفة',
    execute: 'تنفيذ',
    start: 'بدء',
    complete: 'إكمال',
    noData: 'لا توجد سجلات بعد.',
    generateNow: 'توليد أوامر العمل الآن',
    generating: 'جاري التوليد...',
    generatedLabel: 'generated',
    generationHint: 'ولّد الجداول النشطة والمستحقة إلى أوامر عمل عندما تكون جاهزًا.',
    zeroGenerationHint: 'لا توجد جداول مستحقة للتوليد. تأكد من وجود PM Schedule نشط ومستحق وله أصول مرتبطة.',
    generationFailed: 'تعذر توليد أوامر العمل',
    workflowPlan: 'إنشاء قالب عمل',
    workflowSchedule: 'إنشاء جدول PM',
    workflowGenerate: 'توليد أوامر العمل',
    workflowExecute: 'تنفيذ أمر العمل',
    workOrdersEmptyTitle: 'لا توجد أوامر عمل ناتجة حاليًا',
    workOrdersEmptyHint: 'تأكد من أن هناك PM Schedule نشط ومستحق، أو اضغط توليد أوامر العمل الآن.',
    dueStatus: 'حالة الاستحقاق',
    dueNow: 'مستحق الآن',
    notDueYet: 'غير مستحق بعد',
    eligibleForGeneration: 'قابل للتوليد',
    eligibleYes: 'نعم',
    eligibleNo: 'لا',
    lastGenerated: 'آخر توليد',
    neverGenerated: 'لم يتم التوليد بعد',
    assetsLinked: 'الأصول المرتبطة',
    totalGenerated: 'إجمالي المولد',
    basicInfo: 'البيانات الأساسية',
    linkedAssets: 'الأصول المرتبطة',
    itemType: 'نوع البند',
    sortOrder: 'الترتيب',
    lastGenerationInfo: 'معلومات آخر توليد',
    noItems: 'لا توجد بنود فحص.',
    noAssets: 'لا توجد أصول مرتبطة.',
    createdAt: 'تاريخ الإنشاء',
    updatedAt: 'آخر تحديث',
    version: 'الإصدار',
    usageCount: 'مرات الاستخدام',
    trigger: 'المشغل',
    startDate: 'تاريخ البداية',
    endDate: 'تاريخ النهاية',
    leadTime: 'مهلة التوليد',
    defaultPriority: 'الأولوية الافتراضية',
    loading: 'جاري تحميل وحدة الصيانة...',
    loadingExecution: 'جاري تحميل أمر العمل...',
    saving: 'جاري الحفظ...',
    moduleDisabled: 'وحدة الصيانة الوقائية غير مفعلة لهذا المستأجر.',
    code: 'الكود',
    name: 'الاسم',
    arabicName: 'الاسم العربي',
    description: 'الوصف',
    category: 'التصنيف',
    status: 'الحالة',
    estimatedDuration: 'المدة المتوقعة',
    safetyNotes: 'ملاحظات السلامة',
    requiredSkill: 'المهارة المطلوبة',
    requiredRole: 'الدور المطلوب',
    tools: 'الأدوات',
    parts: 'قطع الغيار',
    materials: 'المواد',
    references: 'المراجع',
    checklist: 'بنود الفحص',
    itemLabel: 'نص البند',
    required: 'إلزامي',
    critical: 'حرج',
    unit: 'الوحدة',
    addItem: 'إضافة بند',
    jobPlan: 'قالب العمل',
    generationMode: 'نمط التوليد',
    frequency: 'التكرار',
    interval: 'الفاصل',
    nextDue: 'الاستحقاق القادم',
    complianceWindow: 'نافذة الالتزام',
    assets: 'الأصول',
    sourceSchedule: 'جدول المصدر',
    priority: 'الأولوية',
    scheduled: 'مجدول',
    deadline: 'آخر موعد',
    modeBatch: 'جولة مجمعة',
    modePerAsset: 'لكل أصل',
    dueSoon: 'قريب الاستحقاق',
    overdue: 'متأخر',
    completedOnTime: 'مكتمل في الوقت',
    completedLate: 'مكتمل متأخر',
    compliance: 'الالتزام',
    total: 'الإجمالي',
    technicianView: 'تنفيذ الفني',
    checks: 'الفحوصات',
    photoUrl: 'رابط الصورة',
    choosePhoto: 'اختيار صورة',
    uploadPhoto: 'رفع الصورة',
    replacePhoto: 'استبدال الصورة',
    removePhoto: 'إزالة الصورة',
    photoPreview: 'معاينة الصورة',
    photoUploadSuccess: 'تم رفع الصورة',
    photoRemoveSuccess: 'تمت إزالة الصورة',
    invalidPhotoType: 'استخدم JPG أو PNG أو WebP أو HEIC أو HEIF فقط.',
    photoTooLarge: 'يجب أن يكون حجم الصورة 5 MB أو أقل.',
    photoPreviewFailed: 'تعذر تحميل معاينة الصورة.',
    selectedFile: 'الملف المحدد',
    notes: 'ملاحظات',
    workOrderInfo: 'معلومات أمر العمل',
    currentAsset: 'الأصل الحالي',
    assetList: 'الأصول في الجولة',
    requiredItems: 'البنود المطلوبة',
    executionNotes: 'ملاحظات التنفيذ',
    startExecution: 'بدء التنفيذ',
    completeWorkOrder: 'إكمال أمر العمل',
    saveItem: 'حفظ البند',
    requiredRemaining: 'إلزامي متبقي',
    completedStatus: 'مكتمل',
    executionCompleted: 'أمر العمل مكتمل.',
    checkSaved: 'تم حفظ الفحص',
    executionError: 'فشل إجراء التنفيذ',
    noChecks: 'لا توجد بنود لهذا الأصل.',
    pass: 'نعم / ناجح',
    fail: 'لا / فشل',
    notApplicable: 'لا ينطبق',
    photoUrlHint: 'ألصق رابط الصورة فقط',
    selectedAsset: 'الأصل المحدد',
    itemsDone: 'مكتمل',
}

Object.assign(ar, {
    generatedWorkOrdersMessage: 'تم إنشاء {count} أوامر عمل.',
    noWorkOrdersGeneratedMessage: 'لم يتم إنشاء أوامر عمل. تأكد من وجود جدول PM نشط ومستحق وله أصول مرتبطة.',
    archiveConfirmTitle: 'تأكيد الأرشفة',
    archiveConfirmDescription: 'سيتم أرشفة هذا السجل وإخفاؤه من الاستخدام التشغيلي المعتاد.',
    archiveConfirmAction: 'أرشفة',
    completeBlockedHint: 'أكمل {count} بنود إلزامية قبل إغلاق أمر العمل.',
    checklistLockedByOpenWos: 'قالب العمل لديه أوامر عمل مفتوحة. أكملها أو ألغها قبل تعديل بنود الفحص.',
    modeBatchHint: 'أمر عمل واحد يغطي كل الأصول المرتبطة في جولة واحدة.',
    modePerAssetHint: 'يتم إنشاء أمر عمل مستقل لكل أصل مرتبط.',
    minutesUnit: 'دقيقة',
    daysUnit: 'يوم',
    priorityLabels: {
        low: 'منخفضة',
        medium: 'متوسطة',
        high: 'عالية',
        critical: 'حرجة',
    },
    itemTypeLabels: {
        yes_no: 'نعم / لا',
        pass_fail: 'نجاح / فشل',
        numeric: 'رقمي',
        text: 'نص',
        photo: 'صورة',
        signature: 'توقيع',
        select: 'اختيار',
        multi_select: 'اختيار متعدد',
        header: 'عنوان قسم',
    },
    jobPlansEmptyTitle: 'لا توجد قوالب عمل بعد',
    jobPlansEmptyHint: 'ابدأ بإنشاء قالب العمل الذي يحتوي البنود وتعليمات التنفيذ.',
    schedulesEmptyTitle: 'لم تبدأ خطة الصيانة الوقائية بعد',
    schedulesEmptyHint: 'الصيانة الوقائية تساعدك على الانتقال من رد الفعل إلى التحكم المسبق. أنشئ خطة أو جدولًا لتقليل الأعطال المتكررة.',
    noMatchingRecordsTitle: 'لا توجد نتائج مطابقة',
    noMatchingRecordsHint: 'عدّل البحث أو الفلاتر لعرض سجلات أكثر.',
    operationalSummary: 'ملخص التشغيل',
    operationalSummaryHint: 'استخدم هذه البطاقات لمعرفة ما هو جاهز أو متأخر أو مولد أو مكتمل.',
    activeSchedules: 'الجداول النشطة',
    activeSchedulesHint: 'جداول PM المسموح لها بتوليد أوامر عمل.',
    dueToday: 'مستحق اليوم',
    dueTodayHint: 'جداول PM النشطة التي تاريخ استحقاقها القادم اليوم.',
    generatedWorkOrders: 'أوامر العمل المولدة',
    generatedWorkOrdersHint: 'أوامر العمل الوقائية الناتجة من جداول PM.',
    completedOnTimeHint: 'أوامر PM المكتملة داخل نافذة الالتزام.',
    completedLateHint: 'أوامر PM المكتملة بعد موعد الالتزام.',
    overdueHint: 'أوامر PM التي تجاوزت موعد الالتزام ولم تكتمل.',
    dueTodayStatus: 'مستحق اليوم',
    dueSoonLead: 'جاهز ضمن مهلة التوليد',
    upcoming: 'قادم',
    inactive: 'غير نشط',
    noNextDueDate: 'لا يوجد تاريخ استحقاق قادم',
    noAssetsLinked: 'لا توجد أصول مرتبطة',
    sourceScheduleId: 'معرف جدول المصدر',
    assetCount: 'عدد الأصول',
    checksProgress: 'تقدم البنود',
    printPdf: 'طباعة / PDF',
    workOrderPdf: 'PDF أمر العمل',
    executionReportPdf: 'PDF تقرير التنفيذ',
    pmReport: 'تقرير PM',
    pmCompliance: 'التزام PM',
    overdueWorkOrders: 'أوامر العمل المتأخرة',
    reports: 'التقارير',
    pendingStatus: 'قيد الانتظار',
    result: 'النتيجة',
    notAvailable: 'غير متاح',
    statusLabels: {
        draft: 'مسودة',
        active: 'نشط',
        paused: 'متوقف مؤقتًا',
        completed: 'مكتمل',
        archived: 'مؤرشف',
        pending: 'قيد الانتظار',
        assigned: 'مسند',
        in_progress: 'قيد التنفيذ',
        pending_supervisor_approval: 'بانتظار اعتماد المشرف',
        pending_engineer_review: 'بانتظار مراجعة المهندس',
        pending_reporter_closure: 'بانتظار إغلاق المبلغ',
        auto_closed: 'مغلق تلقائيًا',
        rejected_by_technician: 'مرفوض من الفني',
        cancelled: 'ملغى',
        on_hold: 'معلق',
        pass: 'ناجح',
        fail: 'فشل',
        na: 'لا ينطبق',
    },
    frequencyLabels: {
        daily: 'يومي',
        weekly: 'أسبوعي',
        monthly: 'شهري',
        quarterly: 'ربع سنوي',
        semi_annual: 'نصف سنوي',
        annual: 'سنوي',
        custom: 'مخصص',
    },
    generationEngineSettings: 'إعدادات محرك التوليد',
    notSpecified: 'غير محدد',
    anchorMode: 'نمط الارتكاز',
    anchorFixed: 'ثابت',
    anchorFloating: 'متحرك',
    anchorFixedHint: 'يتقدم تاريخ الاستحقاق القادم عند توليد أمر العمل.',
    anchorFloatingHint: 'يتقدم تاريخ الاستحقاق القادم بعد إنجاز أو إلغاء أمر العمل حسب نقطة الارتكاز.',
    masterTemplate: 'القالب الأساسي',
    masterTemplateLinkedWarning: 'هذه الجدولة مرتبطة بقالب أساسي، بعض الحقول لا يمكن تعديلها مباشرة.',
    engineEnabledBadge: 'مفعّلة في محرك التوليد',
    viewForecast: 'عرض التوقعات القادمة',
    forecastTitle: 'التوقعات القادمة',
    forecastDisclaimer: 'هذه توقعات قراءة فقط ولا تُنشئ أوامر عمل فعلية.',
    forecastOccurrence: 'الدورة رقم',
    dueDate: 'تاريخ الاستحقاق',
    forecastDeferred: 'مؤجل بسبب نافذة حظر',
    forecastBlackoutLabel: 'سبب التأجيل',
    forecastEmpty: 'لا توجد دورات قادمة للتوقع.',
    forecastFailed: 'تعذر تحميل التوقعات',
    forecastLoading: 'جاري تحميل التوقعات...',
    deferredBadge: 'مؤجل بسبب نافذة حظر',
})

export const today = () => new Date().toISOString().slice(0, 10)

export const blankItem = (sortOrder = 10): PMJobPlanItemInput => ({
    sort_order: sortOrder,
    label: '',
    label_ar: '',
    item_type: 'yes_no',
    is_required: true,
    is_critical: false,
    unit: '',
    min_value: null,
    max_value: null,
    warning_min: null,
    warning_max: null,
    help_text: '',
})

export const blankPlan = (): PMJobPlanInput => ({
    code: '',
    name: '',
    name_ar: '',
    description: '',
    category: '',
    asset_type_hint: '',
    status: 'active',
    estimated_duration_minutes: 30,
    requires_safety_checks: false,
    safety_notes: '',
    required_parts: [],
    required_tools: [],
    required_materials: [],
    reference_documents: [],
    required_skill: '',
    required_role: '',
    items: [
        blankItem(10),
        { ...blankItem(20), item_type: 'numeric' },
        { ...blankItem(30), item_type: 'text', is_required: false },
    ],
})

export const blankSchedule = (): PMScheduleInput => ({
    code: '',
    name: '',
    name_ar: '',
    description: '',
    job_plan_id: '',
    generation_mode: 'batch_route',
    trigger_type: 'calendar',
    frequency_type: 'daily',
    frequency_interval: 1,
    start_date: today(),
    next_due_date: today(),
    lead_time_days: 0,
    compliance_window_days: null,
    default_priority: 'medium',
    status: 'active',
    notes: '',
    asset_ids: [],
})

export function parseLines(value: string, docs = false): PMJsonItem[] {
    return value
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line) => {
            const [first, second, third] = line.split('|').map((part) => part.trim())
            if (docs) return { label: first, url: second || undefined }
            return { name: first, qty: second ? Number(second) || undefined : undefined, unit: third || undefined }
        })
}

export function stringifyLines(items?: PMJsonItem[], docs = false) {
    return (items ?? [])
        .map((item) => docs
            ? [item.label ?? item.name ?? '', item.url ?? ''].filter(Boolean).join(' | ')
            : [item.name ?? item.label ?? '', item.qty ?? '', item.unit ?? ''].filter(Boolean).join(' | '))
        .join('\n')
}

export function numberOrNull(value: string) {
    if (value.trim() === '') return null
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : null
}

export function displayName(row: { name: string; name_ar?: string | null }, isAr: boolean) {
    return isAr ? row.name_ar || row.name : row.name
}

export function modeLabel(mode: PMGenerationMode, copy: PMCopy) {
    return mode === 'per_asset' ? copy.modePerAsset : copy.modeBatch
}

export function statusLabel(status: string, copy: PMCopy) {
    return copy.statusLabels[status as keyof typeof copy.statusLabels] ?? humanizeKey(status)
}

export function frequencyLabel(frequency: string | null | undefined, interval: number | null | undefined, copy: PMCopy) {
    if (!frequency) return '-'
    const label = copy.frequencyLabels[frequency as keyof typeof copy.frequencyLabels] ?? humanizeKey(frequency)
    return interval && interval > 1 ? `${label} / ${interval}` : label
}

export function priorityLabel(priority: string | null | undefined, copy: PMCopy) {
    if (!priority) return '-'
    return copy.priorityLabels[priority as keyof typeof copy.priorityLabels] ?? humanizeKey(priority)
}

export function itemTypeLabel(type: string | null | undefined, copy: PMCopy) {
    if (!type) return '-'
    return copy.itemTypeLabels[type as keyof typeof copy.itemTypeLabels] ?? humanizeKey(type)
}

export function durationLabel(minutes: number | null | undefined, copy: PMCopy) {
    return minutes ? `${minutes} ${copy.minutesUnit}` : '-'
}

export function daysLabel(days: number | null | undefined, copy: PMCopy) {
    return `${days ?? 0} ${copy.daysUnit}`
}

export function percentLabel(value: number | null | undefined) {
    return value === null || value === undefined ? '-' : `${Number(value).toFixed(1).replace(/\.0$/, '')}%`
}

export function fillCount(template: string, count: number) {
    return template.replace('{count}', String(count))
}

function humanizeKey(value: string) {
    return value
        .split('_')
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(' ')
}

export function statusClass(status: string) {
    switch (status) {
        case 'active':
        case 'completed':
        case 'auto_closed':
        case 'pass':
            return 'bg-emerald-500/15 text-emerald-700 border-emerald-500/20'
        case 'in_progress':
        case 'assigned':
        case 'paused':
        case 'pending':
        case 'pending_supervisor_approval':
        case 'pending_engineer_review':
        case 'pending_reporter_closure':
        case 'on_hold':
            return 'bg-amber-500/15 text-amber-700 border-amber-500/20'
        case 'fail':
        case 'archived':
        case 'cancelled':
        case 'rejected_by_technician':
            return 'bg-rose-500/15 text-rose-700 border-rose-500/20'
        default:
            return 'bg-slate-500/10 text-slate-700 border-slate-500/20'
    }
}
