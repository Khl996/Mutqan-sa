import { useTranslation } from 'react-i18next'
import { WorkOrder } from '@/hooks/useWorkOrders'
import { MapPin, Box, Building2, Layers } from 'lucide-react'
import { Link } from 'react-router-dom'

interface WorkOrderAssetLocationProps {
    workOrder: WorkOrder
    isRTL: boolean
}

export default function WorkOrderAssetLocation({ workOrder, isRTL }: WorkOrderAssetLocationProps) {
    const { t } = useTranslation()

    if (!workOrder.asset && !workOrder.building) return null

    return (
        <div className="bg-card border rounded-xl p-5 shadow-sm space-y-4">
            <h3 className="font-bold text-sm font-cairo text-muted-foreground uppercase tracking-wider mb-2">
                {isRTL ? 'الموقع والأصل' : 'Location & Asset'}
            </h3>

            <div className="space-y-3">
                {/* Asset Info */}
                {workOrder.asset && (
                    <div className="p-3 bg-secondary/5 border border-secondary/20 rounded-lg space-y-2">
                        <div className="flex items-center gap-2 text-secondary font-medium text-sm">
                            <Box className="w-4 h-4" />
                            <span className="font-cairo">{isRTL ? 'الأصل المتضرر' : 'Affected Asset'}</span>
                        </div>
                        <div className="pl-6 rtl:pr-6 rtl:pl-0">
                            <Link to={`/assets/${workOrder.asset.id}`} className="font-bold hover:underline block text-primary">
                                {isRTL ? workOrder.asset.name_ar || workOrder.asset.name : workOrder.asset.name}
                            </Link>
                            <span className="text-xs text-muted font-mono bg-background px-1.5 py-0.5 rounded border mt-1 inline-block">
                                {workOrder.asset.code}
                            </span>
                        </div>
                    </div>
                )}

                {/* Location Info */}
                <div className="space-y-2 text-sm">
                    {workOrder.building && (
                        <div className="flex items-center gap-3 p-2 rounded hover:bg-muted/50">
                            <Building2 className="w-4 h-4 text-muted-foreground" />
                            <div>
                                <p className="text-xs text-muted-foreground font-cairo">{isRTL ? 'المبنى' : 'Building'}</p>
                                <p className="font-medium">{isRTL ? workOrder.building.name_ar || workOrder.building.name : workOrder.building.name}</p>
                            </div>
                        </div>
                    )}

                    {/* Floor/Room placeholders as they are not joined yet in the hook but good to support visually */}
                    {workOrder.floor_id && (
                        <div className="flex items-center gap-3 p-2 rounded hover:bg-muted/50">
                            <Layers className="w-4 h-4 text-muted-foreground" />
                            <div>
                                <p className="text-xs text-muted-foreground font-cairo">{isRTL ? 'الطابق' : 'Floor'}</p>
                                <p className="font-medium">Floor #{workOrder.floor_id.slice(0, 4)}</p>
                            </div>
                        </div>
                    )}

                    {workOrder.room_id && (
                        <div className="flex items-center gap-3 p-2 rounded hover:bg-muted/50">
                            <MapPin className="w-4 h-4 text-muted-foreground" />
                            <div>
                                <p className="text-xs text-muted-foreground font-cairo">{isRTL ? 'الغرفة' : 'Room'}</p>
                                <p className="font-medium">Room #{workOrder.room_id.slice(0, 4)}</p>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}
