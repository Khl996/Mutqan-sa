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
    MoreVertical,
    Box,
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
import { PageHeader } from '@/components/ui/page-header'
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
    const { i18n } = useTranslation()
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
    const pageSize = 10
    const pageStart = totalCount === 0 ? 0 : (page - 1) * pageSize + 1
    const pageEnd = Math.min(page * pageSize, totalCount)

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

    return (
        <div className="space-y-6">
            <PageHeader
                icon={<Package className="h-5 w-5" />}
                title={isRTL ? 'إدارة المخزون' : 'Inventory Management'}
                description={isRTL
                    ? 'إدارة قطع الغيار والمواد الاستهلاكية ومراقبة مستويات المخزون ونقاط إعادة الطلب.'
                    : 'Manage spare parts, consumables, stock levels, and reorder points.'}
                actions={(
                    <div className="flex w-full gap-2 sm:w-auto">
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
                )}
            />

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
            <div className="bg-card border rounded-lg shadow-card overflow-hidden">
                {/* Toolbar */}
                <div className="p-4 border-b flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                    <div className="relative w-full sm:w-96">
                        <Search className={cn("absolute top-1/2 -translate-y-1/2 text-muted-foreground w-4 h-4", isRTL ? "right-3" : "left-3")} />
                        <Input
                            placeholder={isRTL ? "بحث عن صنف..." : "Search items..."}
                            value={search}
                            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                            className={cn(isRTL ? "pr-9 pl-4" : "pl-9 pr-4")}
                        />
                    </div>
                    <div className="flex flex-wrap items-center gap-2 font-cairo text-xs text-muted-foreground">
                        <span className="rounded-full border bg-background px-3 py-1">
                            {isRTL ? `${totalCount} صنف` : `${totalCount} items`}
                        </span>
                        {stats && isLowStockAlertsEnabled ? (
                            <span className={cn(
                                'rounded-full border px-3 py-1',
                                stats.low_stock > 0
                                    ? 'border-destructive/20 bg-destructive/10 text-destructive'
                                    : 'border-success/20 bg-success/10 text-success'
                            )}>
                                {isRTL ? `${stats.low_stock} منخفض المخزون` : `${stats.low_stock} low stock`}
                            </span>
                        ) : null}
                    </div>
                </div>

                {/* Table */}
                <div className="overflow-x-auto">
                    <table className="w-full">
                        <thead className="bg-muted/40">
                            <tr>
                                <th className="text-start px-4 py-3 text-sm font-medium text-muted-foreground font-cairo">{isRTL ? 'تفاصيل الصنف' : 'Item Details'}</th>
                                <th className="text-center px-4 py-3 text-sm font-medium text-muted-foreground font-cairo">{isRTL ? 'المخزون' : 'Stock'}</th>
                                <th className="text-center px-4 py-3 text-sm font-medium text-muted-foreground font-cairo">{isRTL ? 'حد الطلب' : 'Reorder Point'}</th>
                                <th className="text-start px-4 py-3 text-sm font-medium text-muted-foreground font-cairo">{isRTL ? 'قيمة الوحدة' : 'Unit Cost'}</th>
                                <th className="text-start px-4 py-3 text-sm font-medium text-muted-foreground font-cairo">{isRTL ? 'الموقع' : 'Location'}</th>
                                <th className="text-center px-4 py-3 text-sm font-medium text-muted-foreground font-cairo">{isRTL ? 'إجراءات' : 'Actions'}</th>
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
                                    const stockRatio = item.min_quantity > 0
                                        ? Math.min(100, Math.round((item.quantity / item.min_quantity) * 100))
                                        : 100
                                    return (
                                        <tr key={item.id} className={cn("hover:bg-secondary/5 transition-colors", isLowStock && "bg-destructive/5")}>
                                            <td className="px-4 py-3">
                                                <div className="flex items-center gap-3">
                                                    <div className={cn(
                                                        "w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0",
                                                        isLowStock ? 'bg-destructive/10 text-destructive' : 'bg-secondary/10 text-secondary'
                                                    )}>
                                                        <Box className="w-5 h-5" />
                                                    </div>
                                                    <div className="min-w-0">
                                                        <p className="font-bold text-foreground font-cairo">
                                                            {isRTL ? (item.name_ar || item.name) : item.name}
                                                        </p>
                                                        <div className="flex flex-wrap items-center gap-2">
                                                            <p className="text-xs text-muted-foreground font-mono">{item.code}</p>
                                                            {item.part_number && <p className="text-xs text-muted-foreground border-s ps-2">{item.part_number}</p>}
                                                            {item.category ? (
                                                                <span className="rounded-full bg-muted/30 px-2 py-0.5 text-[10px] text-muted-foreground font-cairo">
                                                                    {isRTL ? item.category.name_ar || item.category.name : item.category.name}
                                                                </span>
                                                            ) : null}
                                                        </div>
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="px-4 py-3 text-center">
                                                <div className="flex flex-col items-center gap-1.5">
                                                    <span className={cn(
                                                        "font-bold font-mono text-lg tabular-nums",
                                                        isLowStock ? "text-destructive" : "text-foreground"
                                                    )}>
                                                        {item.quantity}
                                                    </span>
                                                    <span className="text-xs text-muted-foreground">{item.unit_of_measure}</span>
                                                    <div className="h-1.5 w-20 overflow-hidden rounded-full bg-muted">
                                                        <div
                                                            className={cn('h-full rounded-full', isLowStock ? 'bg-destructive' : 'bg-success')}
                                                            style={{ width: `${stockRatio}%` }}
                                                        />
                                                    </div>
                                                    {isLowStock && (
                                                        <Badge variant="destructive" className="h-5 text-[10px] px-1 py-0">
                                                            {isRTL ? 'إعادة طلب' : 'Reorder'}
                                                        </Badge>
                                                    )}
                                                </div>
                                            </td>
                                            <td className="px-4 py-3 text-center text-muted-foreground font-mono tabular-nums">
                                                {item.min_quantity}
                                            </td>
                                            <td className="px-4 py-3 text-sm font-mono">
                                                {formatCurrency(item.unit_cost)}
                                            </td>
                                            <td className="px-4 py-3 text-sm text-muted-foreground font-cairo">
                                                {item.location || '-'}
                                            </td>
                                            <td className="px-4 py-3">
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
                <div className="p-4 border-t flex flex-col gap-3 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setPage(p => Math.max(1, p - 1))}
                        disabled={page === 1}
                    >
                        {isRTL ? 'السابق' : 'Previous'}
                    </Button>
                    <span className="text-center font-cairo">
                        {totalCount > 0
                            ? (isRTL ? `${pageStart}-${pageEnd} من ${totalCount}` : `${pageStart}-${pageEnd} of ${totalCount}`)
                            : (isRTL ? 'لا توجد نتائج' : 'No results')}
                    </span>
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setPage(p => p + 1)}
                        disabled={totalCount ? page * pageSize >= totalCount : items.length < pageSize}
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
