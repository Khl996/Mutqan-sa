
import { useTranslation } from 'react-i18next'
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
} from '@/components/ui/dialog'
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { useInventoryTransactions, InventoryItem } from '@/hooks/useInventory'
import { format } from 'date-fns'
import { Loader2 } from 'lucide-react'

interface InventoryTransactionHistoryDialogProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    item: InventoryItem
}

export function InventoryTransactionHistoryDialog({ open, onOpenChange, item }: InventoryTransactionHistoryDialogProps) {
    const { t, i18n } = useTranslation()
    const isRTL = i18n.language === 'ar'

    const { data: transactions, isLoading } = useInventoryTransactions(item.id)

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto" dir={isRTL ? 'rtl' : 'ltr'}>
                <DialogHeader>
                    <DialogTitle>
                        {isRTL ? 'سجل الحركات' : 'Transaction History'} - {isRTL ? (item.name_ar || item.name) : item.name}
                    </DialogTitle>
                    <DialogDescription className="hidden">
                        {isRTL ? 'عرض سجل حركات المخزون' : 'View inventory transaction history'}
                    </DialogDescription>
                </DialogHeader>

                <div className="mt-4">
                    {isLoading ? (
                        <div className="flex justify-center p-8">
                            <Loader2 className="w-8 h-8 animate-spin text-primary" />
                        </div>
                    ) : !transactions || transactions.length === 0 ? (
                        <div className="text-center p-8 text-muted-foreground">
                            {isRTL ? 'لا توجد حركات مسجلة' : 'No transactions found'}
                        </div>
                    ) : (
                        <div className="border rounded-md">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead className="text-start">{isRTL ? 'التاريخ' : 'Date'}</TableHead>
                                        <TableHead className="text-center">{isRTL ? 'النوع' : 'Type'}</TableHead>
                                        <TableHead className="text-center">{isRTL ? 'الكمية' : 'Quantity'}</TableHead>
                                        <TableHead className="text-center">{isRTL ? 'الرصيد بعد' : 'Balance After'}</TableHead>
                                        <TableHead className="text-start">{isRTL ? 'ملاحظات' : 'Notes'}</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {transactions.map((tx: any) => (
                                        <TableRow key={tx.id}>
                                            <TableCell className="font-mono text-xs text-start">
                                                {format(new Date(tx.created_at), 'yyyy-MM-dd HH:mm')}
                                            </TableCell>
                                            <TableCell className="text-center">
                                                <Badge variant={
                                                    tx.transaction_type === 'in' ? 'success' :
                                                        tx.transaction_type === 'out' ? 'destructive' : 'secondary'
                                                }>
                                                    {tx.transaction_type === 'in' ? (isRTL ? 'وارد' : 'In') :
                                                        tx.transaction_type === 'out' ? (isRTL ? 'صادر' : 'Out') :
                                                            (isRTL ? 'تعديل' : 'Adj')}
                                                </Badge>
                                            </TableCell>
                                            <TableCell className="font-bold text-center">
                                                <span dir="ltr">{tx.transaction_type === 'out' ? '-' : '+'}{tx.quantity}</span>
                                            </TableCell>
                                            <TableCell className="text-center">{tx.quantity_after}</TableCell>
                                            <TableCell className="max-w-[150px] truncate text-muted-foreground text-xs text-start" title={tx.notes}>
                                                {tx.notes || '-'}
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </div>
                    )}
                </div>
            </DialogContent>
        </Dialog>
    )
}
