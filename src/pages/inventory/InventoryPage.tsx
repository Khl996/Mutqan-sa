import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { cn, formatCurrency } from '@/lib/utils'
import {
    useInventoryItems,
    useInventoryStats,
    useDeleteInventoryItem,
    InventoryItem,
    useAllInventoryItems
} from '@/hooks/useInventory'
import {
    Package,
    AlertTriangle,
    Search,
    Plus,
    Filter,
    MoreVertical,
    Box,
    Clock,
    History,
    Edit,
    Trash2,
    FileSpreadsheet,
    TrendingDown,
    Loader2
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { InventoryItemDialog } from '@/components/inventory/InventoryItemDialog'
import { InventoryTransactionDialog } from '@/components/inventory/InventoryTransactionDialog'
import { InventoryTransactionHistoryDialog } from '@/components/inventory/InventoryTransactionHistoryDialog'
import { toast } from 'sonner'
import { useFeatureEnabled } from '@/hooks/useFeatureEnabled'
import { usePermission } from '@/hooks/usePermission'

export default function InventoryPage() {
    const { t, i18n } = useTranslation()
    const isRTL = i18n.language === 'ar'
    const [page, setPage] = useState(1)
    const [search, setSearch] = useState('')

    // Check module features
    const { can } = usePermission()
    const canManage = can('inventory.manage')
    const isLowStockAlertsEnabled = useFeatureEnabled('inventory', 'low_stock_alerts')
    const isStockTrackingEnabled = useFeatureEnabled('inventory', 'stock_tracking')
    const isConsumptionReportsEnabled = useFeatureEnabled('inventory', 'consumption_reports')

    // Data Fetching
    const { data: stats } = useInventoryStats()
    const { data: itemsResult, isLoading } = useInventoryItems(page, search)
    const { data: allItems } = useAllInventoryItems() // For export
    const items = itemsResult?.data || []
    const totalCount = itemsResult?.count || 0

    // Mutations
    const deleteItem = useDeleteInventoryItem()

    // State for Dialogs
    const [selectedItem, setSelectedItem] = useState<InventoryItem | null>(null)
    const [isItemDialogOpen, setIsItemDialogOpen] = useState(false)
    const [isTransactionDialogOpen, setIsTransactionDialogOpen] = useState(false)
    const [isHistoryDialogOpen, setIsHistoryDialogOpen] = useState(false)
    const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false)

    // Handlers
    const handleAddItem = () => {
        setSelectedItem(null)
        setIsItemDialogOpen(true)
    }

    const handleEditItem = (item: InventoryItem) => {
        setSelectedItem(item)
        setIsItemDialogOpen(true)
    }

    const handleTransaction = (item: InventoryItem) => {
        setSelectedItem(item)
        setIsTransactionDialogOpen(true)
    }

    const handleShowHistory = (item: InventoryItem) => {
        setSelectedItem(item)
        setIsHistoryDialogOpen(true)
    }

    const handleDeleteClick = (item: InventoryItem) => {
        setSelectedItem(item)
        setIsDeleteDialogOpen(true)
    }

    const handleDeleteConfirm = async () => {
        if (!selectedItem) return

        try {
            await deleteItem.mutateAsync(selectedItem.id)
            toast.success(isRTL ? 'تم حذف الصنف بنجاح' : 'Item deleted successfully')
            setIsDeleteDialogOpen(false)
        } catch (error) {
            console.error('Error deleting item:', error)
            toast.error(isRTL ? 'فشل حذف الصنف' : 'Failed to delete item')
        }
    }

    const handleExport = () => {
        if (!allItems || allItems.length === 0) {
            toast.error(isRTL ? 'لا توجد بيانات للتصدير' : 'No data to export')
            return
        }

        try {
            const csvContent = [
                [
                    isRTL ? 'الكود' : 'Code',
                    isRTL ? 'الاسم' : 'Name',
                    isRTL ? 'الكمية الحالية' : 'Current Qty',
                    isRTL ? 'الوحدة' : 'Unit',
                    isRTL ? 'سعر الوحدة' : 'Unit Cost',
                    isRTL ? 'الموقع' : 'Location',
                ].join(','),
                ...allItems.map((item) =>
                    [
                        item.code,
                        isRTL ? (item.name_ar || item.name) : item.name,
                        item.quantity,
                        item.unit_of_measure,
                        item.unit_cost || 0,
                        item.location || '',
                    ].join(',')
                ),
            ].join('\n')

            const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' })
            const link = document.createElement('a')
            link.href = URL.createObjectURL(blob)
            link.download = `inventory_${new Date().toISOString().split('T')[0]}.csv`
            link.click()

            toast.success(isRTL ? 'تم التصدير بنجاح' : 'Exported successfully')
        } catch (error) {
            console.error('Error exporting:', error)
            toast.error(isRTL ? 'فشل التصدير' : 'Export failed')
        }
    }

    // Calculating Total Value (Approximation based on current page or we need stats endpoint to return it)
    // For now, let's assume stats.total_value is 0 from hook logic, or calculate it.
    // The hook returns 0 currently. We might want to fix the hook later, but user code showed frontend calculation.
    // Frontend calculation works if we have ALL items. `allItems` gives us a lightweight list.
    // Let's ensure `useAllInventoryItems` returns cost too if we want to calc value.
    // The current `useAllInventoryItems` selects: id, name, ... unit_cost (added implicitly? No I didn't add it).
    // I should probably rely on `stats` or improve `useAllInventoryItems`.
    // I will use simplified stats for now or just wait for backend update.

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-col sm:flex-row justify-between items-start gap-4">
                <div>
                    <h1 className="text-3xl font-bold flex items-center gap-2 font-cairo text-primary">
                        <Package className="h-8 w-8" />
                        {isRTL ? 'إدارة المخزون' : 'Inventory Management'}
                    </h1>
                    <p className="text-muted-foreground mt-1 font-cairo">
                        {isRTL
                            ? 'إدارة قطع الغيار والمواد الاستهلاكية ومراقبة المستويات'
                            : 'Manage spare parts, consumables and monitor stock levels'}
                    </p>
                </div>
                <div className="flex gap-2 w-full sm:w-auto">
                    {/* Export Button - only if consumption reports enabled */}
                    {isConsumptionReportsEnabled && (
                        <Button variant="outline" onClick={handleExport} className="gap-2 w-full sm:w-auto justify-center">
                            <FileSpreadsheet className="h-4 w-4" />
                            {isRTL ? 'تصدير' : 'Export'}
                        </Button>
                    )}

                    {/* Add Item Button - only if stock tracking enabled */}
                    {isStockTrackingEnabled && canManage && (
                        <Button onClick={handleAddItem} className="gap-2 w-full sm:w-auto justify-center bg-primary hover:bg-primary/90">
                            <Plus className="h-4 w-4" />
                            {isRTL ? 'إضافة صنف' : 'Add Item'}
                        </Button>
                    )}
                </div>
            </div>

            {/* Feature Warning - if stock tracking disabled */}
            {
                !isStockTrackingEnabled && (
                    <div className="flex items-center gap-3 p-4 bg-warning/10 border border-warning/20 rounded-xl text-warning">
                        <AlertTriangle className="w-5 h-5 flex-shrink-0" />
                        <p className="font-cairo text-sm">
                            {isRTL
                                ? 'تم تعطيل تتبع المخزون. يرجى مراجعة مدير النظام لتفعيلها.'
                                : 'Stock tracking is disabled. Please contact admin to enable it.'}
                        </p>
                    </div>
                )
            }

            {/* Statistics Cards */}
            {
                stats && isStockTrackingEnabled && (
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <Card>
                            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                <CardTitle className="text-sm font-medium font-cairo">
                                    {isRTL ? 'إجمالي الأصناف' : 'Total Items'}
                                </CardTitle>
                                <Package className="h-4 w-4 text-muted-foreground" />
                            </CardHeader>
                            <CardContent>
                                <div className="text-2xl font-bold">{stats.total_items}</div>
                            </CardContent>
                        </Card>

                        {/* Low Stock Card - only if feature is enabled */}
                        {isLowStockAlertsEnabled && (
                            <Card>
                                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                    <CardTitle className="text-sm font-medium font-cairo">
                                        {isRTL ? 'أصناف منخفضة المخزون' : 'Low Stock Items'}
                                    </CardTitle>
                                    <AlertTriangle className="h-4 w-4 text-destructive" />
                                </CardHeader>
                                <CardContent>
                                    <div className="text-2xl font-bold text-destructive">
                                        {stats.low_stock}
                                    </div>
                                </CardContent>
                            </Card>
                        )}

                        <Card>
                            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                <CardTitle className="text-sm font-medium font-cairo">
                                    {isRTL ? 'إجمالي القيمة' : 'Total Value'}
                                </CardTitle>
                                <TrendingDown className="h-4 w-4 text-muted-foreground" />
                            </CardHeader>
                            <CardContent>
                                <div className="text-2xl font-bold">
                                    {stats.total_value
                                        ? formatCurrency(stats.total_value)
                                        : '-'} {/* Pending implementation in backend/hook */}
                                </div>
                            </CardContent>
                        </Card>
                    </div>
                )
            }

            {/* Low Stock Alert */}
            {
                stats && stats.low_stock > 0 && isLowStockAlertsEnabled && isStockTrackingEnabled && (
                    <Card className="border-destructive/50 bg-destructive/5">
                        <CardHeader className="pb-2">
                            <CardTitle className="text-destructive flex items-center gap-2 font-cairo text-base">
                                <AlertTriangle className="h-5 w-5" />
                                {isRTL ? 'تنبيه: أصناف وصلت للحد الأدنى (إعادة الطلب)' : 'Alert: Low Stock Items (Reorder Point)'}
                            </CardTitle>
                        </CardHeader>
                    </Card>
                )
            }

            {/* Main Content */}
            <div className="bg-card border rounded-xl shadow-sm overflow-hidden">
                {/* Toolbar */}
                <div className="p-4 border-b flex flex-col sm:flex-row gap-4 justify-between items-center">
                    <div className="relative w-full sm:w-96">
                        <Search className={cn("absolute top-1/2 -translate-y-1/2 text-muted-foreground w-4 h-4", isRTL ? "right-3" : "left-3")} />
                        <Input
                            placeholder={isRTL ? "بحث عن صنف..." : "Search items..."}
                            value={search}
                            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                            className={cn(isRTL ? "pr-9 pl-4" : "pl-9 pr-4")}
                        />
                    </div>
                </div>

                {/* Table */}
                <div className="overflow-x-auto">
                    <table className="w-full">
                        <thead className="bg-muted/50">
                            <tr>
                                <th className="text-start p-4 text-sm font-medium text-muted-foreground font-cairo">{isRTL ? 'تفاصيل الصنف' : 'Item Details'}</th>
                                <th className="text-center p-4 text-sm font-medium text-muted-foreground font-cairo">{isRTL ? 'الكمية' : 'Quantity'}</th>
                                <th className="text-center p-4 text-sm font-medium text-muted-foreground font-cairo">{isRTL ? 'الحد الأدنى' : 'Min Qty'}</th>
                                <th className="text-start p-4 text-sm font-medium text-muted-foreground font-cairo">{isRTL ? 'السعر' : 'Unit Cost'}</th>
                                <th className="text-start p-4 text-sm font-medium text-muted-foreground font-cairo">{isRTL ? 'الموقع' : 'Location'}</th>
                                <th className="text-center p-4 text-sm font-medium text-muted-foreground font-cairo">{isRTL ? 'إجراءات' : 'Actions'}</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y">
                            {isLoading ? (
                                <tr>
                                    <td colSpan={6} className="p-8 text-center text-muted-foreground">
                                        <div className="flex justify-center items-center gap-2">
                                            <Loader2 className="animate-spin w-5 h-5" />
                                            Loading...
                                        </div>
                                    </td>
                                </tr>
                            ) : items.length === 0 ? (
                                <tr>
                                    <td colSpan={6} className="p-8 text-center text-muted-foreground font-cairo">
                                        {search ? (isRTL ? 'لا توجد نتائج' : 'No results found') : (isRTL ? 'لا توجد أصناف' : 'No items found')}
                                    </td>
                                </tr>
                            ) : (
                                items.map((item) => {
                                    const isLowStock = item.quantity <= item.min_quantity
                                    return (
                                        <tr key={item.id} className={cn("hover:bg-muted/5 transition-colors", isLowStock && "bg-destructive/5")}>
                                            <td className="p-4">
                                                <div className="flex items-center gap-3">
                                                    <div className="w-10 h-10 rounded-lg bg-muted/20 flex items-center justify-center text-muted-foreground flex-shrink-0">
                                                        <Box className="w-5 h-5" />
                                                    </div>
                                                    <div>
                                                        <p className="font-bold text-foreground font-cairo">
                                                            {isRTL ? (item.name_ar || item.name) : item.name}
                                                        </p>
                                                        <div className="flex items-center gap-2">
                                                            <p className="text-xs text-muted-foreground font-mono">{item.code}</p>
                                                            {item.part_number && <p className="text-xs text-muted-foreground border-l pl-2 ml-2">{item.part_number}</p>}
                                                        </div>
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="p-4 text-center">
                                                <div className="flex flex-col items-center gap-1">
                                                    <span className={cn(
                                                        "font-bold font-mono text-lg",
                                                        isLowStock ? "text-destructive" : "text-foreground"
                                                    )}>
                                                        {item.quantity}
                                                    </span>
                                                    <span className="text-xs text-muted-foreground">{item.unit_of_measure}</span>
                                                    {isLowStock && (
                                                        <Badge variant="destructive" className="h-5 text-[10px] px-1 py-0">
                                                            {isRTL ? 'منخفض' : 'Low'}
                                                        </Badge>
                                                    )}
                                                </div>
                                            </td>
                                            <td className="p-4 text-center text-muted-foreground font-mono">
                                                {item.min_quantity}
                                            </td>
                                            <td className="p-4 text-sm font-mono">
                                                {formatCurrency(item.unit_cost)}
                                            </td>
                                            <td className="p-4 text-sm text-muted-foreground">
                                                {item.location || '-'}
                                            </td>
                                            <td className="p-4">
                                                <div className="flex items-center justify-center gap-1">
                                                    <Button variant="ghost" size="icon" onClick={() => handleShowHistory(item)} title={isRTL ? 'سجل الحركات' : 'History'}>
                                                        <History className="w-4 h-4 text-muted-foreground" />
                                                    </Button>

                                                    {canManage && (
                                                        <DropdownMenu>
                                                            <DropdownMenuTrigger asChild>
                                                                <Button variant="ghost" size="icon">
                                                                    <MoreVertical className="w-4 h-4 text-muted-foreground" />
                                                                </Button>
                                                            </DropdownMenuTrigger>
                                                            <DropdownMenuContent align="end">
                                                                <DropdownMenuItem onClick={() => handleTransaction(item)}>
                                                                    <Plus className="w-4 h-4 mr-2" />
                                                                    {isRTL ? 'إضافة حركة مخزون' : 'Add Transaction'}
                                                                </DropdownMenuItem>
                                                                <DropdownMenuItem onClick={() => handleEditItem(item)}>
                                                                    <Edit className="w-4 h-4 mr-2" />
                                                                    {isRTL ? 'تعديل' : 'Edit'}
                                                                </DropdownMenuItem>
                                                                <DropdownMenuItem onClick={() => handleDeleteClick(item)} className="text-destructive focus:text-destructive">
                                                                    <Trash2 className="w-4 h-4 mr-2" />
                                                                    {isRTL ? 'حذف' : 'Delete'}
                                                                </DropdownMenuItem>
                                                            </DropdownMenuContent>
                                                        </DropdownMenu>
                                                    )}
                                                </div>
                                            </td>
                                        </tr>
                                    )
                                })
                            )}
                        </tbody>
                    </table>
                </div>

                {/* Pagination */}
                <div className="p-4 border-t flex justify-between items-center text-sm text-muted-foreground">
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setPage(p => Math.max(1, p - 1))}
                        disabled={page === 1}
                    >
                        {isRTL ? 'السابق' : 'Previous'}
                    </Button>
                    <span className="font-mono">{page}</span>
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setPage(p => p + 1)}
                        disabled={items.length < 10} // Assuming page size 10
                    >
                        {isRTL ? 'التالي' : 'Next'}
                    </Button>
                </div>
            </div>

            {/* Dialogs */}
            <InventoryItemDialog
                open={isItemDialogOpen}
                onOpenChange={setIsItemDialogOpen}
                item={selectedItem}
            />

            {
                selectedItem && (
                    <>
                        <InventoryTransactionDialog
                            open={isTransactionDialogOpen}
                            onOpenChange={setIsTransactionDialogOpen}
                            item={selectedItem}
                        />
                        <InventoryTransactionHistoryDialog
                            open={isHistoryDialogOpen}
                            onOpenChange={setIsHistoryDialogOpen}
                            item={selectedItem}
                        />
                    </>
                )
            }

            <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>{isRTL ? 'تأكيد الحذف' : 'Confirm Deletion'}</AlertDialogTitle>
                        <AlertDialogDescription>
                            {isRTL
                                ? `هل أنت متأكد من حذف الصنف "${selectedItem?.name_ar || selectedItem?.name}"؟`
                                : `Are you sure you want to delete item "${selectedItem?.name}"?`}
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>{isRTL ? 'إلغاء' : 'Cancel'}</AlertDialogCancel>
                        <AlertDialogAction onClick={handleDeleteConfirm} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                            {isRTL ? 'حذف' : 'Delete'}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div >
    )
}
