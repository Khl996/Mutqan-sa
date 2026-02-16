
import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import * as z from 'zod'
import { useTranslation } from 'react-i18next'
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog'
import {
    Form,
    FormControl,
    FormField,
    FormItem,
    FormLabel,
    FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useCreateInventoryItem, useUpdateInventoryItem, InventoryItem } from '@/hooks/useInventory'
import { toast } from 'sonner'
import { Loader2 } from 'lucide-react'

const formSchema = z.object({
    code: z.string().min(1, 'Code is required'),
    name: z.string().min(1, 'Name is required'),
    name_ar: z.string().optional(),
    category_id: z.string().optional(), // We'll handle categories simpler for now
    quantity: z.coerce.number().min(0),
    min_quantity: z.coerce.number().min(0),
    unit_of_measure: z.string().min(1, 'Unit is required'),
    unit_cost: z.coerce.number().min(0),
    location: z.string().optional(),
    description: z.string().optional(),
    part_number: z.string().optional(),
})

interface InventoryItemDialogProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    item: InventoryItem | null
    onSuccess?: () => void
}

export function InventoryItemDialog({ open, onOpenChange, item, onSuccess }: InventoryItemDialogProps) {
    const { t, i18n } = useTranslation()
    const isRTL = i18n.language === 'ar'

    const createItem = useCreateInventoryItem()
    const updateItem = useUpdateInventoryItem()

    const form = useForm<z.infer<typeof formSchema>>({
        resolver: zodResolver(formSchema),
        defaultValues: {
            code: '',
            name: '',
            name_ar: '',
            quantity: 0,
            min_quantity: 0,
            unit_of_measure: 'pcs',
            unit_cost: 0,
            location: '',
            description: '',
            part_number: '',
        },
    })

    useEffect(() => {
        if (item) {
            form.reset({
                code: item.code,
                name: item.name,
                name_ar: item.name_ar || '',
                quantity: item.quantity,
                min_quantity: item.min_quantity || 0,
                unit_of_measure: item.unit_of_measure || 'pcs',
                unit_cost: item.unit_cost || 0,
                location: item.location || '',
                part_number: item.part_number || '',
                // description is not in the type currently but might be in DB, keeping consistent with type
            })
        } else {
            form.reset({
                code: '',
                name: '',
                name_ar: '',
                quantity: 0,
                min_quantity: 0,
                unit_of_measure: 'pcs',
                unit_cost: 0,
                location: '',
                part_number: '',
            })
        }
    }, [item, form, open])

    const onSubmit = async (values: z.infer<typeof formSchema>) => {
        try {
            if (item) {
                await updateItem.mutateAsync({
                    id: item.id,
                    ...values
                })
                toast.success(isRTL ? 'تم تحديث الصنف بنجاح' : 'Item updated successfully')
            } else {
                await createItem.mutateAsync(values)
                toast.success(isRTL ? 'تم إضافة الصنف بنجاح' : 'Item added successfully')
            }
            onOpenChange(false)
            if (onSuccess) onSuccess()
        } catch (error) {
            console.error(error)
            toast.error(isRTL ? 'حدث خطأ ما' : 'An error occurred')
        }
    }

    const isLoading = createItem.isPending || updateItem.isPending

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto" dir={isRTL ? 'rtl' : 'ltr'}>
                <DialogHeader>
                    <DialogTitle>
                        {item ? (isRTL ? 'تعديل صنف' : 'Edit Item') : (isRTL ? 'إضافة صنف جديد' : 'Add New Item')}
                    </DialogTitle>
                    <DialogDescription>
                        {isRTL ? 'أدخل تفاصيل الصنف أدناه' : 'Enter item details below'}
                    </DialogDescription>
                </DialogHeader>

                <Form {...form}>
                    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <FormField
                                control={form.control}
                                name="code"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>{isRTL ? 'الكود' : 'Code'}</FormLabel>
                                        <FormControl>
                                            <Input {...field} />
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                            <FormField
                                control={form.control}
                                name="part_number"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>{isRTL ? 'رقم القطعة' : 'Part Number'}</FormLabel>
                                        <FormControl>
                                            <Input {...field} />
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                            <FormField
                                control={form.control}
                                name="name"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>{isRTL ? 'الاسم (EN)' : 'Name (EN)'}</FormLabel>
                                        <FormControl>
                                            <Input {...field} />
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                            <FormField
                                control={form.control}
                                name="name_ar"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>{isRTL ? 'الاسم (عربي)' : 'Name (Ar)'}</FormLabel>
                                        <FormControl>
                                            <Input {...field} />
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />

                            <FormField
                                control={form.control}
                                name="quantity"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>{isRTL ? 'الكمية الحالية' : 'Quantity'}</FormLabel>
                                        <FormControl>
                                            <Input type="number" step="0.01" {...field} />
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                            <FormField
                                control={form.control}
                                name="min_quantity"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>{isRTL ? 'الحد الأدنى' : 'Min Quantity'}</FormLabel>
                                        <FormControl>
                                            <Input type="number" step="0.01" {...field} />
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />

                            <FormField
                                control={form.control}
                                name="unit_of_measure"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>{isRTL ? 'الوحدة' : 'Unit'}</FormLabel>
                                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                                            <FormControl>
                                                <SelectTrigger>
                                                    <SelectValue placeholder="Select unit" />
                                                </SelectTrigger>
                                            </FormControl>
                                            <SelectContent>
                                                <SelectItem value="pcs">{isRTL ? 'قطعة' : 'Pcs'}</SelectItem>
                                                <SelectItem value="kg">{isRTL ? 'كجم' : 'Kg'}</SelectItem>
                                                <SelectItem value="ltr">{isRTL ? 'لتر' : 'Ltr'}</SelectItem>
                                                <SelectItem value="m">{isRTL ? 'متر' : 'Meter'}</SelectItem>
                                                <SelectItem value="box">{isRTL ? 'صندوق' : 'Box'}</SelectItem>
                                            </SelectContent>
                                        </Select>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                            <FormField
                                control={form.control}
                                name="unit_cost"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>{isRTL ? 'سعر الوحدة' : 'Unit Cost'}</FormLabel>
                                        <FormControl>
                                            <Input type="number" step="0.01" {...field} />
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                            <FormField
                                control={form.control}
                                name="location"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>{isRTL ? 'الموقع' : 'Location'}</FormLabel>
                                        <FormControl>
                                            <Input {...field} />
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                        </div>

                        <DialogFooter className="mt-6 gap-2">
                            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                                {isRTL ? 'إلغاء' : 'Cancel'}
                            </Button>
                            <Button type="submit" disabled={isLoading}>
                                {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                {isRTL ? 'حفظ' : 'Save'}
                            </Button>
                        </DialogFooter>
                    </form>
                </Form>
            </DialogContent>
        </Dialog>
    )
}
