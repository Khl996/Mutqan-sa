import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useAllInventoryItems } from '@/hooks/useInventory'
import { useTenantSettings } from '@/hooks/useTenantSettings'
import { Package, Plus, Trash2, AlertCircle, ShieldAlert } from 'lucide-react'

export interface SelectedPart {
    part_id: string
    name: string
    quantity: number
    unit: string
}

interface InventorySelectorProps {
    parts: SelectedPart[]
    onChange: (parts: SelectedPart[]) => void
    isRTL: boolean
}

export default function InventorySelector({ parts, onChange, isRTL }: InventorySelectorProps) {
    const { t } = useTranslation()
    const { data: inventoryItems, isLoading } = useAllInventoryItems()
    const { data: tenantSettings } = useTenantSettings()

    // Check if approval is required for consumption
    const requireApproval = tenantSettings?.inventory?.require_approval_for_consumption ?? false

    const [selectedItemId, setSelectedItemId] = useState('')
    const [quantity, setQuantity] = useState(1)
    const [error, setError] = useState<string | null>(null)

    const selectedItem = inventoryItems?.find(item => item.id === selectedItemId)

    const handleAddPart = () => {
        if (!selectedItem) return
        if (quantity <= 0) {
            setError(t('validation.minQuantity', 'Quantity must be greater than 0'))
            return
        }
        if (quantity > selectedItem.quantity) {
            setError(isRTL ? 'الكمية المطلوبة غير متوفرة في المخزون' : 'Insufficient stock')
            return
        }

        const newPart: SelectedPart = {
            part_id: selectedItem.id,
            name: isRTL ? (selectedItem.name_ar || selectedItem.name) : selectedItem.name,
            quantity: quantity,
            unit: selectedItem.unit_of_measure
        }

        // Check if already added
        if (parts.some(p => p.part_id === newPart.part_id)) {
            setError(isRTL ? 'هذا العنصر مضاف بالفعل' : 'Item already added')
            return
        }

        onChange([...parts, newPart])

        // Reset form
        setSelectedItemId('')
        setQuantity(1)
        setError(null)
    }

    const handleRemovePart = (id: string) => {
        onChange(parts.filter(p => p.part_id !== id))
    }

    return (
        <div className="space-y-4 border rounded-xl p-4 bg-muted/5">
            <h4 className="font-bold text-sm font-cairo flex items-center gap-2 text-primary">
                <Package className="w-4 h-4" />
                {isRTL ? 'استهلاك قطع الغيار' : 'Spare Parts Consumption'}
            </h4>

            {/* Approval Warning */}
            {requireApproval && (
                <div className="flex items-center gap-2 p-2 bg-warning/10 border border-warning/20 rounded-lg text-warning text-xs font-cairo">
                    <ShieldAlert className="w-4 h-4 flex-shrink-0" />
                    {isRTL
                        ? 'يتطلب صرف القطع موافقة المدير قبل الاعتماد'
                        : 'Parts consumption requires manager approval'}
                </div>
            )}

            {/* Add Part Form */}
            <div className="flex gap-2 flex-wrap sm:flex-nowrap items-end">
                <div className="flex-1 min-w-[200px]">
                    <label className="text-xs text-muted-foreground font-cairo mb-1 block">
                        {isRTL ? 'اختر القطعة' : 'Select Part'}
                    </label>
                    <select
                        className="w-full p-2 border rounded-lg bg-background text-sm font-cairo outline-none focus:ring-2 focus:ring-primary/20"
                        value={selectedItemId}
                        onChange={(e) => {
                            setSelectedItemId(e.target.value)
                            setError(null)
                        }}
                        disabled={isLoading}
                    >
                        <option value="">{isRTL ? '-- اختر --' : '-- Select --'}</option>
                        {inventoryItems?.map(item => (
                            <option key={item.id} value={item.id} disabled={item.quantity <= 0}>
                                {isRTL ? (item.name_ar || item.name) : item.name} ({item.quantity} {item.unit_of_measure})
                            </option>
                        ))}
                    </select>
                </div>
                <div className="w-24">
                    <label className="text-xs text-muted-foreground font-cairo mb-1 block">
                        {isRTL ? 'الكمية' : 'Qty'}
                    </label>
                    <input
                        type="number"
                        min="0.1"
                        step="0.1"
                        className="w-full p-2 border rounded-lg bg-background text-sm font-cairo outline-none focus:ring-2 focus:ring-primary/20"
                        value={quantity}
                        onChange={(e) => setQuantity(parseFloat(e.target.value))}
                    />
                </div>
                <button
                    onClick={handleAddPart}
                    disabled={!selectedItemId}
                    className="p-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    <Plus className="w-5 h-5" />
                </button>
            </div>

            {error && (
                <p className="text-xs text-red-500 font-cairo flex items-center gap-1">
                    <AlertCircle className="w-3 h-3" />
                    {error}
                </p>
            )}

            {/* parts List */}
            {parts.length > 0 && (
                <div className="space-y-2">
                    {parts.map(part => (
                        <div key={part.part_id} className="flex items-center justify-between p-2 bg-background border rounded-lg">
                            <div>
                                <p className="font-bold text-sm font-cairo">{part.name}</p>
                                <p className="text-xs text-muted-foreground">
                                    {part.quantity} {part.unit}
                                </p>
                            </div>
                            <button
                                onClick={() => handleRemovePart(part.part_id)}
                                className="text-red-500 hover:text-red-600 p-1 rounded hover:bg-red-50"
                            >
                                <Trash2 className="w-4 h-4" />
                            </button>
                        </div>
                    ))}
                </div>
            )}
        </div>
    )
}
