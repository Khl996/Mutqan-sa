import { WorkOrder } from '@/hooks/useWorkOrders'
import { MapPin, Box, Building2, Layers } from 'lucide-react'
import { Link } from 'react-router-dom'

interface WorkOrderAssetLocationProps {
    workOrder: WorkOrder
    isRTL: boolean
}

export default function WorkOrderAssetLocation({ workOrder, isRTL }: WorkOrderAssetLocationProps) {
    const locationBuilding = workOrder.building || workOrder.asset?.building
    const locationFloor = workOrder.floor || workOrder.asset?.floor
    const locationRoom = workOrder.room || workOrder.asset?.room

    if (!workOrder.asset && !locationBuilding && !locationFloor && !locationRoom) return null

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
                    {locationBuilding && (
                        <div className="flex items-center gap-3 p-2 rounded hover:bg-muted/50">
                            <Building2 className="w-4 h-4 text-muted-foreground" />
                            <div>
                                <p className="text-xs text-muted-foreground font-cairo">{isRTL ? 'المبنى' : 'Building'}</p>
                                <p className="font-medium">{isRTL ? locationBuilding.name_ar || locationBuilding.name : locationBuilding.name}</p>
                            </div>
                        </div>
                    )}

                    {locationFloor && (
                        <div className="flex items-center gap-3 p-2 rounded hover:bg-muted/50">
                            <Layers className="w-4 h-4 text-muted-foreground" />
                            <div>
                                <p className="text-xs text-muted-foreground font-cairo">{isRTL ? 'الطابق' : 'Floor'}</p>
                                <p className="font-medium">{isRTL ? (locationFloor.name_ar || locationFloor.name) : locationFloor.name}</p>
                            </div>
                        </div>
                    )}

                    {locationRoom && (
                        <div className="flex items-center gap-3 p-2 rounded hover:bg-muted/50">
                            <MapPin className="w-4 h-4 text-muted-foreground" />
                            <div>
                                <p className="text-xs text-muted-foreground font-cairo">{isRTL ? 'الغرفة' : 'Room'}</p>
                                <p className="font-medium">{isRTL ? (locationRoom.name_ar || locationRoom.name) : locationRoom.name}</p>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}
