import { WorkOrder } from '@/hooks/useWorkOrders'
import { User, Shield, Wrench, type LucideIcon } from 'lucide-react'

interface WorkOrderQuickInfoProps {
    workOrder: WorkOrder
    isRTL: boolean
}

export default function WorkOrderQuickInfo({ workOrder, isRTL }: WorkOrderQuickInfoProps) {
    const PersonRow = ({ icon: Icon, label, name, role }: { icon: LucideIcon, label: string, name?: string | null, role?: string }) => (
        <div className="flex items-start gap-3 p-3 rounded-lg hover:bg-muted/50 transition-colors">
            <div className="p-2 bg-muted/10 rounded-full text-muted-foreground">
                <Icon className="w-4 h-4" />
            </div>
            <div className="flex-1 min-w-0">
                <p className="text-xs text-muted-foreground font-cairo mb-0.5">{label}</p>
                <p className="text-sm font-medium truncate">{name || (isRTL ? 'غير معين' : 'Not assigned')}</p>
                {role && <p className="text-xs text-primary/80 mt-0.5">{role}</p>}
            </div>
        </div>
    )

    return (
        <div className="bg-card border rounded-xl p-5 shadow-sm space-y-4">
            <h3 className="font-bold text-sm font-cairo text-muted-foreground uppercase tracking-wider mb-2">
                {isRTL ? 'فريق العمل' : 'Team & People'}
            </h3>

            <div className="space-y-1 divide-y divide-dashed divide-muted/50">
                {/* Reporter */}
                <PersonRow
                    icon={User}
                    label={isRTL ? 'المبلغ' : 'Reported By'}
                    name={isRTL ? workOrder.reporter?.full_name_ar || workOrder.reporter?.full_name : workOrder.reporter?.full_name}
                />

                {/* Assigned Technician */}
                <PersonRow
                    icon={Wrench}
                    label={isRTL ? 'الفني المسؤول' : 'Technician'}
                    name={isRTL ? workOrder.assignee?.full_name_ar || workOrder.assignee?.full_name : workOrder.assignee?.full_name}
                    role={
                        workOrder.assignedTeam
                            ? (isRTL ? workOrder.assignedTeam.name_ar || workOrder.assignedTeam.name : workOrder.assignedTeam.name)
                            : undefined
                    }
                />

                {/* Supervisor (if approved) */}
                {workOrder.supervisor_approved_by && (
                    <PersonRow
                        icon={Shield}
                        label={isRTL ? 'اعتماد المشرف' : 'Supervisor'}
                        name={isRTL ? 'مشرف الصيانة' : 'Maintenance Supervisor'} // Mock, should fetch name
                    />
                )}
            </div>
        </div>
    )
}
