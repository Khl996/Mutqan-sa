import { forwardRef, type CSSProperties, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import type { OperationLog, WorkOrder } from '@/hooks/useWorkOrders'
import { STATUS_DISPLAY } from '@/config/workOrderStatus'
import type { ProofTenantContext } from '@/hooks/useTenantSettings'
import { MutqanLogo } from '@/components/ui/MutqanLogo'
import { supabase } from '@/lib/supabase'
import { isSafeProofStoragePath } from '@/lib/proofStorage'
import {
    buildEffectiveProofIdentity,
    buildProofOfWorkViewModel,
    formatProofDateTime,
    type EffectiveProofIdentity,
    type ProofLanguage,
} from '@/lib/proofOfWork'

interface WorkOrderPrintViewProps {
    workOrder: WorkOrder
    logs: OperationLog[]
    language: ProofLanguage
    generatedAt: string
    proofTenant: ProofTenantContext
}

function InfoRow({ label, value, strong = false }: { label: string; value: ReactNode; strong?: boolean }) {
    return (
        <div className="grid grid-cols-[9rem_1fr] gap-4 border-b border-[var(--mutqan-border)] py-2.5 last:border-b-0">
            <dt className="text-[var(--mutqan-muted)]">{label}</dt>
            <dd className={strong ? 'font-bold text-[var(--mutqan-text)]' : 'text-[var(--mutqan-text)]'}>
                {value}
            </dd>
        </div>
    )
}

function SectionTitle({ children }: { children: ReactNode }) {
    return (
        <h3 className="mb-4 border-b-2 border-[var(--mutqan-accent)] pb-2 text-base font-bold text-[var(--mutqan-text)]">
            {children}
        </h3>
    )
}

function PrintHeader({ identity, language }: { identity: EffectiveProofIdentity; language: ProofLanguage }) {
    const fallbackLabel = language === 'ar' ? 'متقن' : 'Mutqan'

    if (identity.letterheadUrl) {
        return (
            <div className="mb-7 border-b border-[var(--mutqan-border)] pb-5">
                <img
                    src={identity.letterheadUrl}
                    alt={identity.name}
                    className="block w-full object-contain"
                    style={{ maxHeight: '32mm' }}
                />
            </div>
        )
    }

    return (
        <div className="mb-7 flex items-center justify-between gap-6 border-b-2 border-[var(--mutqan-text)] pb-5">
            <div className="flex min-w-0 items-center gap-4">
                {identity.logoUrl ? (
                    <img
                        src={identity.logoUrl}
                        alt={identity.name}
                        className="shrink-0 object-contain"
                        style={{ maxHeight: '22mm', maxWidth: '70mm' }}
                    />
                ) : (
                    <MutqanLogo size="lg" label={fallbackLabel} />
                )}
                {(identity.name !== fallbackLabel || identity.secondary) && (
                    <div className="min-w-0">
                        <p className="text-lg font-bold leading-tight text-[var(--mutqan-text)]">
                            {identity.name}
                        </p>
                        {identity.secondary && (
                            <p className="mt-1 text-sm text-[var(--mutqan-muted)]">
                                {identity.secondary}
                            </p>
                        )}
                    </div>
                )}
            </div>
            <div className="h-10 w-1 shrink-0 rounded-full bg-[var(--mutqan-accent)]" aria-hidden="true" />
        </div>
    )
}

const WorkOrderPrintView = forwardRef<HTMLDivElement, WorkOrderPrintViewProps>(({
    workOrder,
    logs,
    language,
    generatedAt,
    proofTenant,
}, ref) => {
    const { t } = useTranslation(undefined, { lng: language })
    const isRTL = language === 'ar'
    const settings = proofTenant.settings
    const identity = buildEffectiveProofIdentity({
        language,
        tenant: proofTenant,
        settings: settings.pdf_identity,
    })
    const storageLogoUrl = identity.logoPath && isSafeProofStoragePath(identity.logoPath)
        ? supabase.storage.from('tenant-assets').getPublicUrl(identity.logoPath).data.publicUrl
        : null
    const printIdentity: EffectiveProofIdentity = {
        ...identity,
        logoUrl: storageLogoUrl ?? identity.logoUrl,
    }
    const timeZone = settings.display.timezone
    const proof = buildProofOfWorkViewModel({
        workOrder,
        logs,
        language,
        tenant: proofTenant,
    })
    const status = STATUS_DISPLAY[proof.workOrder.status] || STATUS_DISPLAY.pending
    const notRecorded = t('workOrders.proof.notRecorded')
    const displayDate = (value: string | null | undefined) => (
        formatProofDateTime(value, language, timeZone) ?? notRecorded
    )
    const recordBasis = proof.recordBasis === 'closure_snapshot_partial'
        ? t('workOrders.proof.basisClosureSnapshotPartial')
        : t('workOrders.proof.basisLiveRecord')

    return (
        <div
            ref={ref}
            className="min-h-screen bg-white p-8 font-cairo text-[var(--mutqan-text)]"
            dir={isRTL ? 'rtl' : 'ltr'}
            lang={language}
            style={{
                '--mutqan-text': '#0b1320',
                '--mutqan-muted': '#6b7785',
                '--mutqan-accent': '#00b2a9',
                '--mutqan-border': '#e6e9ed',
                '--mutqan-surface-soft': '#eef3f5',
            } as CSSProperties}
        >
            <style>{`
                @page { size: A4; margin: 14mm; }
                @media print {
                    .proof-avoid-break { break-inside: avoid; page-break-inside: avoid; }
                    .proof-table-row { break-inside: avoid; page-break-inside: avoid; }
                }
            `}</style>

            <PrintHeader identity={printIdentity} language={language} />

            <header className="proof-avoid-break mb-8">
                <div className="flex flex-wrap items-start justify-between gap-5">
                    <div className="max-w-2xl">
                        <p className="mb-2 text-sm font-bold tracking-wide text-[var(--mutqan-accent)]">
                            {t('workOrders.proof.title')}
                        </p>
                        <h1 className="text-3xl font-extrabold leading-tight text-[var(--mutqan-text)]">
                            {proof.workOrder.title}
                        </h1>
                        <p className="mt-3 text-sm leading-6 text-[var(--mutqan-muted)]">
                            {t('workOrders.proof.subtitle')}
                        </p>
                    </div>
                    <div className="min-w-52 rounded-xl border border-[var(--mutqan-border)] bg-[var(--mutqan-surface-soft)] p-4 text-sm">
                        <p className="font-mono text-lg font-bold text-[var(--mutqan-text)]">
                            <bdi dir="ltr">#{proof.workOrder.code}</bdi>
                        </p>
                        <p className="mt-2 font-bold text-[var(--mutqan-accent)]">
                            {t(`workOrders.${status.label}`)}
                        </p>
                    </div>
                </div>
                <dl className="mt-5 grid gap-3 rounded-xl border border-[var(--mutqan-border)] bg-[var(--mutqan-surface-soft)] p-4 text-xs sm:grid-cols-2">
                    <div>
                        <dt className="font-bold text-[var(--mutqan-muted)]">{t('workOrders.proof.recordBasis')}</dt>
                        <dd className="mt-1 text-[var(--mutqan-text)]">{recordBasis}</dd>
                    </div>
                    <div>
                        <dt className="font-bold text-[var(--mutqan-muted)]">{t('workOrders.proof.generatedAt')}</dt>
                        <dd className="mt-1 text-[var(--mutqan-text)]">{displayDate(generatedAt)}</dd>
                    </div>
                </dl>
            </header>

            <main className="space-y-8">
                <section className="proof-avoid-break grid gap-8 md:grid-cols-2">
                    <div>
                        <SectionTitle>{t('workOrders.proof.sections.summary')}</SectionTitle>
                        <dl className="text-sm">
                            <InfoRow label={t('workOrders.proof.fields.workOrderNumber')} value={proof.workOrder.code} strong />
                            <InfoRow label={t('workOrders.proof.fields.status')} value={t(`workOrders.${status.label}`)} strong />
                            <InfoRow label={t('workOrders.proof.fields.priority')} value={t(`workOrders.${proof.workOrder.priority}`)} />
                            <InfoRow label={t('workOrders.proof.fields.issueType')} value={proof.workOrder.issueType ?? notRecorded} />
                            <InfoRow label={t('workOrders.proof.fields.reportedAt')} value={displayDate(proof.timestamps.reportedAt)} />
                            <InfoRow label={t('workOrders.proof.fields.startedAt')} value={displayDate(proof.timestamps.startedAt)} />
                            <InfoRow label={t('workOrders.proof.fields.completedAt')} value={displayDate(proof.timestamps.closedAt)} />
                        </dl>
                    </div>

                    <div>
                        <SectionTitle>{t('workOrders.proof.sections.location')}</SectionTitle>
                        <dl className="text-sm">
                            <InfoRow label={t('workOrders.proof.fields.building')} value={proof.location.building ?? notRecorded} strong />
                            <InfoRow label={t('workOrders.proof.fields.floor')} value={proof.location.floor ?? notRecorded} />
                            <InfoRow label={t('workOrders.proof.fields.room')} value={proof.location.room ?? notRecorded} />
                            <InfoRow label={t('workOrders.proof.fields.asset')} value={proof.asset?.name ?? notRecorded} strong={Boolean(proof.asset)} />
                            <InfoRow label={t('workOrders.proof.fields.assetCode')} value={proof.asset?.code ?? notRecorded} />
                            <InfoRow label={t('workOrders.proof.fields.assignee')} value={proof.parties.assignee.name ?? notRecorded} strong />
                            <InfoRow label={t('workOrders.proof.fields.team')} value={proof.parties.team.name ?? notRecorded} />
                        </dl>
                    </div>
                </section>

                <section className="rounded-xl border border-[var(--mutqan-border)] bg-[var(--mutqan-surface-soft)] p-5">
                    <h3 className="text-sm font-bold text-[var(--mutqan-accent)]">
                        {t('workOrders.proof.fields.description')}
                    </h3>
                    <p className="mt-3 whitespace-pre-wrap text-sm leading-7 text-[var(--mutqan-text)]">
                        {proof.workOrder.description ?? notRecorded}
                    </p>
                </section>

                <section>
                    <SectionTitle>{t('workOrders.proof.sections.execution')}</SectionTitle>
                    <div className="grid gap-5 md:grid-cols-2">
                        {([
                            ['technicianNotes', proof.notes.technician],
                            ['supervisorNotes', proof.notes.supervisor],
                            ['engineerNotes', proof.notes.engineer],
                            ['reporterNotes', proof.notes.reporter],
                        ] as const).map(([label, value]) => (
                            <div key={label} className="rounded-xl border border-[var(--mutqan-border)] p-4">
                                <p className="text-xs font-bold text-[var(--mutqan-muted)]">
                                    {t(`workOrders.proof.fields.${label}`)}
                                </p>
                                <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-[var(--mutqan-text)]">
                                    {value ?? notRecorded}
                                </p>
                            </div>
                        ))}
                    </div>
                    <dl className="mt-5 grid gap-4 rounded-xl border border-[var(--mutqan-border)] p-4 text-sm md:grid-cols-2">
                        <div>
                            <dt className="text-[var(--mutqan-muted)]">{t('workOrders.proof.fields.reporter')}</dt>
                            <dd className="mt-1 font-bold">{proof.parties.reporter.name ?? notRecorded}</dd>
                        </div>
                        <div>
                            <dt className="text-[var(--mutqan-muted)]">{t('workOrders.proof.fields.closedBy')}</dt>
                            <dd className="mt-1 font-bold">{proof.parties.closedBy.name ?? notRecorded}</dd>
                        </div>
                    </dl>
                </section>

                <section className="proof-avoid-break">
                    <SectionTitle>{t('workOrders.proof.sections.evidence')}</SectionTitle>
                    <dl className="grid gap-x-8 rounded-xl border border-[var(--mutqan-border)] px-4 text-sm md:grid-cols-2">
                        <InfoRow
                            label={t('workOrders.proof.fields.reporterPhoto')}
                            value={proof.evidence.reporterImage ? t('workOrders.proof.recorded') : notRecorded}
                        />
                        <InfoRow
                            label={t('workOrders.proof.fields.beforePhoto')}
                            value={proof.evidence.beforeImages.length}
                        />
                        <InfoRow
                            label={t('workOrders.proof.fields.afterPhoto')}
                            value={proof.evidence.afterImages.length}
                        />
                    </dl>
                </section>

                <section>
                    <SectionTitle>{t('workOrders.proof.sections.operations')}</SectionTitle>
                    <div className="overflow-hidden rounded-xl border border-[var(--mutqan-border)]">
                        <table className="w-full border-collapse text-sm">
                            <thead>
                                <tr className="bg-[var(--mutqan-surface-soft)] text-start">
                                    <th className="p-3 text-start">{t('workOrders.proof.fields.date')}</th>
                                    <th className="p-3 text-start">{t('workOrders.proof.fields.operation')}</th>
                                    <th className="p-3 text-start">{t('workOrders.proof.fields.performedBy')}</th>
                                    <th className="p-3 text-start">{t('workOrders.proof.fields.notes')}</th>
                                </tr>
                            </thead>
                            <tbody>
                                {proof.operations.map((operation, index) => (
                                    <tr
                                        key={operation.id}
                                        className={`proof-table-row border-t border-[var(--mutqan-border)] ${index % 2 === 0 ? 'bg-white' : 'bg-[var(--mutqan-surface-soft)]'}`}
                                    >
                                        <td className="whitespace-nowrap p-3">{displayDate(operation.timestamp)}</td>
                                        <td className="p-3 font-bold">
                                            {t(`workOrders.proof.operationTypes.${operation.type}`, {
                                                defaultValue: t('workOrders.proof.operationTypes.other'),
                                            })}
                                        </td>
                                        <td className="p-3">{operation.performedBy ?? notRecorded}</td>
                                        <td className="p-3">
                                            <span className="block">{operation.description}</span>
                                            {operation.reason && (
                                                <span className="mt-1 block text-xs text-[var(--mutqan-muted)]">
                                                    {t('workOrders.proof.fields.reason')}: {operation.reason}
                                                </span>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                                {proof.operations.length === 0 && (
                                    <tr className="border-t border-[var(--mutqan-border)]">
                                        <td colSpan={4} className="p-6 text-center text-[var(--mutqan-muted)]">
                                            {t('workOrders.proof.noOperations')}
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </section>
            </main>

            <footer className="mt-10 flex items-center justify-between gap-4 border-t border-[var(--mutqan-border)] pt-4 text-xs text-[var(--mutqan-muted)]">
                <span>{t('workOrders.proof.generatedFrom')}</span>
                <span className="font-mono"><bdi dir="ltr">{proof.workOrder.code}</bdi></span>
            </footer>
        </div>
    )
})

WorkOrderPrintView.displayName = 'WorkOrderPrintView'
export default WorkOrderPrintView
