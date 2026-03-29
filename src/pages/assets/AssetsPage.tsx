import { useState, useRef, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'
import {
    useAssets,
    useAssetStats,
    useAssetHierarchy,
    Asset,
    HierarchyNode,
    useDeleteAsset
} from '@/hooks/useAssets'
import { useFeatureEnabled } from '@/hooks/useFeatureEnabled'
import { usePermission } from '@/hooks/usePermission'
import AddAssetModal from '@/components/assets/AddAssetModal'
import AddFloorModal from '@/components/facilities/AddFloorModal'
import AssetActionModal from '@/components/assets/AssetActionModal'
import {
    Box,
    Plus,
    Search,
    CheckCircle2,
    AlertTriangle,
    XCircle,
    Wrench,
    Building2,
    Tag,
    ChevronDown,
    ChevronRight,
    ChevronLeft,
    Layers,
    LayoutList,
    FolderTree,
    MoreVertical,
    Trash2,
    PlusCircle,
    Power,
    Ban,
    QrCode,
    History,
    ShieldCheck,
    AlertCircle
} from 'lucide-react'
import { toast } from 'sonner'

// Status and criticality colors (reused)
const statusConfig = {
    operational: { color: 'text-success', bg: 'bg-success/10', icon: CheckCircle2 },
    under_maintenance: { color: 'text-warning', bg: 'bg-warning/10', icon: Wrench },
    out_of_service: { color: 'text-destructive', bg: 'bg-destructive/10', icon: XCircle },
    retired: { color: 'text-muted', bg: 'bg-muted/10', icon: AlertTriangle },
}

const criticalityConfig = {
    low: { color: 'text-success', bg: 'bg-success/10' },
    medium: { color: 'text-info', bg: 'bg-info/10' },
    high: { color: 'text-warning', bg: 'bg-warning/10' },
    critical: { color: 'text-destructive', bg: 'bg-destructive/10' },
}

export default function AssetsPage() {
    const { t, i18n } = useTranslation()
    const isRTL = i18n.language === 'ar'

    // Check assets features
    const { can } = usePermission()
    const canManage = can('assets.manage')
    const isAssetTrackingEnabled = useFeatureEnabled('assets', 'asset_tracking')
    const isQrCodesEnabled = useFeatureEnabled('assets', 'qr_codes')
    const isAssetHistoryEnabled = useFeatureEnabled('assets', 'asset_history')
    const isWarrantyTrackingEnabled = useFeatureEnabled('assets', 'warranty_tracking')

    const [viewMode, setViewMode] = useState<'list' | 'tree'>('tree')
    const [searchQuery, setSearchQuery] = useState('')
    const [statusFilter, setStatusFilter] = useState<string>('all')
    const [isAddAssetModalOpen, setIsAddAssetModalOpen] = useState(false)
    const [isAddFloorModalOpen, setIsAddFloorModalOpen] = useState(false)

    // State for actions
    const [selectedBuildingForFloor, setSelectedBuildingForFloor] = useState<{ id: string, name: string } | null>(null)

    // State for Asset Operations
    const [actionModalState, setActionModalState] = useState<{
        isOpen: boolean
        assetId: string
        assetName: string
        currentStatus: string
        actionType: 'start' | 'stop' | 'maintenance' | 'retire'
    }>({
        isOpen: false,
        assetId: '',
        assetName: '',
        currentStatus: '',
        actionType: 'start'
    })

    // Fetch data
    const { data: assets, isLoading: listLoading } = useAssets()
    const { data: hierarchy, isLoading: treeLoading, refetch: refetchTree } = useAssetHierarchy()
    const { data: stats } = useAssetStats()
    const deleteAsset = useDeleteAsset()

    const isLoading = listLoading || (viewMode === 'tree' && treeLoading)

    // Filter Logic
    const filteredAssets = assets?.filter(asset => {
        const matchesSearch =
            asset.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
            asset.name_ar?.toLowerCase().includes(searchQuery.toLowerCase()) ||
            asset.code.toLowerCase().includes(searchQuery.toLowerCase())

        const matchesStatus = statusFilter === 'all' || asset.status === statusFilter

        return matchesSearch && matchesStatus
    }) || []

    // Actions Handlers
    const handleDeleteAsset = async (id: string) => {
        if (window.confirm(isRTL ? 'ظ‡ظ„ ط£ظ†طھ ظ…طھط£ظƒط¯ ظ…ظ† ط­ط°ظپ ظ‡ط°ط§ ط§ظ„ط£طµظ„طں' : 'Are you sure you want to delete this asset?')) {
            try {
                await deleteAsset.mutateAsync(id)
                toast.success(isRTL ? 'طھظ… ط­ط°ظپ ط§ظ„ط£طµظ„ ط¨ظ†ط¬ط§ط­' : 'Asset deleted successfully')
                refetchTree()
            } catch (error) {
                toast.error(isRTL ? 'ط­ط¯ط« ط®ط·ط£ ط£ط«ظ†ط§ط، ط§ظ„ط­ط°ظپ' : 'Error deleting asset')
            }
        }
    }

    const handleAddFloor = (buildingId: string, buildingName: string) => {
        setSelectedBuildingForFloor({ id: buildingId, name: buildingName })
        setIsAddFloorModalOpen(true)
    }

    const openActionModal = (assetId: string, assetName: string, currentStatus: string, actionType: 'start' | 'stop' | 'maintenance' | 'retire') => {
        setActionModalState({
            isOpen: true,
            assetId,
            assetName,
            currentStatus,
            actionType
        })
    }

    if (isLoading) {
        return (
            <div className="flex items-center justify-center min-h-[60vh]">
                <div className="flex flex-col items-center gap-4">
                    <div className="w-12 h-12 border-4 border-secondary border-t-transparent rounded-full animate-spin" />
                    <p className="text-muted">{t('common.loading')}</p>
                </div>
            </div>
        )
    }

    return (
        <div className="space-y-6">
            {/* Add Asset Modal */}
            <AddAssetModal
                isOpen={isAddAssetModalOpen}
                onClose={() => setIsAddAssetModalOpen(false)}
            />

            {/* Add Floor Modal */}
            {selectedBuildingForFloor && (
                <AddFloorModal
                    isOpen={isAddFloorModalOpen}
                    onClose={() => {
                        setIsAddFloorModalOpen(false)
                        setSelectedBuildingForFloor(null)
                    }}
                    buildingId={selectedBuildingForFloor.id}
                    buildingName={selectedBuildingForFloor.name}
                    onSuccess={() => refetchTree()}
                />
            )}

            {/* Asset Action Modal */}
            {actionModalState.isOpen && (
                <AssetActionModal
                    isOpen={actionModalState.isOpen}
                    onClose={() => setActionModalState(prev => ({ ...prev, isOpen: false }))}
                    assetId={actionModalState.assetId}
                    assetName={actionModalState.assetName}
                    currentStatus={actionModalState.currentStatus}
                    actionType={actionModalState.actionType}
                />
            )}

            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-primary font-cairo">
                        {t('assets.title')}
                    </h1>
                    <p className="text-muted font-cairo">
                        {isRTL
                            ? 'ط¥ط¯ط§ط±ط© ط§ظ„ط£طµظˆظ„ ظˆط§ظ„ظ…ط¹ط¯ط§طھ ظˆط§ظ„ظ…ظˆط§ظ‚ط¹'
                            : 'Manage assets, equipment and locations'
                        }
                    </p>
                </div>

                <div className="flex gap-2">
                    {/* View Switcher */}
                    <div className="flex bg-card border rounded-lg p-1">
                        <button
                            onClick={() => setViewMode('tree')}
                            className={cn(
                                "p-2 rounded transition-colors",
                                viewMode === 'tree' ? "bg-primary/10 text-primary" : "text-muted hover:text-primary"
                            )}
                            title={isRTL ? "ط¹ط±ط¶ ط´ط¬ط±ظٹ" : "Tree View"}
                        >
                            <FolderTree className="w-5 h-5" />
                        </button>
                        <button
                            onClick={() => setViewMode('list')}
                            className={cn(
                                "p-2 rounded transition-colors",
                                viewMode === 'list' ? "bg-primary/10 text-primary" : "text-muted hover:text-primary"
                            )}
                            title={isRTL ? "ط¹ط±ط¶ ظ‚ط§ط¦ظ…ط©" : "List View"}
                        >
                            <LayoutList className="w-5 h-5" />
                        </button>
                    </div>

                    {isAssetTrackingEnabled && canManage && (
                        <button
                            onClick={() => setIsAddAssetModalOpen(true)}
                            className="flex items-center gap-2 px-4 py-2 bg-secondary text-white rounded-lg hover:bg-secondary/90 transition-colors font-cairo"
                        >
                            <Plus className="w-5 h-5" />
                            {t('assets.addAsset')}
                        </button>
                    )}
                </div>
            </div>

            {/* Feature Disabled Warning */}
            {!isAssetTrackingEnabled && (
                <div className="flex items-center gap-3 p-4 bg-warning/10 border border-warning/20 rounded-xl text-warning">
                    <AlertCircle className="w-5 h-5 flex-shrink-0" />
                    <p className="font-cairo text-sm">
                        {isRTL
                            ? 'طھظ… طھط¹ط·ظٹظ„ ظ…ظٹط²ط© طھطھط¨ط¹ ط§ظ„ط£طµظˆظ„. ظٹط±ط¬ظ‰ ظ…ط±ط§ط¬ط¹ط© ظ…ط¯ظٹط± ط§ظ„ظ†ط¸ط§ظ… ظ„طھظپط¹ظٹظ„ظ‡ط§.'
                            : 'Asset tracking feature is disabled. Please contact admin to enable it.'}
                    </p>
                </div>
            )}

            {/* Stats Cards - only if asset tracking is enabled */}
            {stats && isAssetTrackingEnabled && (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                    <StatCard
                        title={isRTL ? 'ط¥ط¬ظ…ط§ظ„ظٹ ط§ظ„ط£طµظˆظ„' : 'Total Assets'}
                        value={stats.total}
                        icon={Box}
                        color="secondary"
                    />
                    <StatCard
                        title={isRTL ? 'طھط¹ظ…ظ„' : 'Operational'}
                        value={stats.byStatus.operational}
                        icon={CheckCircle2}
                        color="success"
                    />
                    <StatCard
                        title={isRTL ? 'طھط­طھ ط§ظ„طµظٹط§ظ†ط©' : 'Under Maintenance'}
                        value={stats.byStatus.under_maintenance}
                        icon={Wrench}
                        color="warning"
                    />
                    <StatCard
                        title={isRTL ? 'ط®ط§ط±ط¬ ط§ظ„ط®ط¯ظ…ط©' : 'Out of Service'}
                        value={stats.byStatus.out_of_service}
                        icon={XCircle}
                        color="destructive"
                    />
                </div>
            )}

            {/* Search */}
            <div className="space-y-4">
                <div className="flex flex-col sm:flex-row gap-4">
                    <div className="relative flex-1">
                        <Search className={cn(
                            'absolute top-1/2 -translate-y-1/2 w-5 h-5 text-muted',
                            isRTL ? 'right-4' : 'left-4'
                        )} />
                        <input
                            type="text"
                            placeholder={isRTL ? 'ط§ظ„ط¨ط­ط« ط¹ظ† ط£طµظ„...' : 'Search assets...'}
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className={cn(
                                'w-full py-3 bg-card border border-border rounded-xl focus:ring-2 focus:ring-secondary/20 focus:border-secondary outline-none font-cairo',
                                isRTL ? 'pr-12 pl-4' : 'pl-12 pr-4'
                            )}
                        />
                    </div>
                </div>
            </div>

            {/* Content Area */}
            {viewMode === 'list' ? (
                // --- LIST VIEW ---
                filteredAssets.length === 0 ? (
                    <EmptyState isRTL={isRTL} />
                ) : (
                    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                        {filteredAssets.map((asset) => (
                            <AssetCard
                                key={asset.id}
                                asset={asset}
                                isRTL={isRTL}
                                onDelete={() => handleDeleteAsset(asset.id)}
                                onAction={(action) => openActionModal(asset.id, isRTL ? (asset.name_ar || asset.name) : asset.name, asset.status, action)}
                                isQrEnabled={isQrCodesEnabled}
                                isHistoryEnabled={isAssetHistoryEnabled}
                                isWarrantyEnabled={isWarrantyTrackingEnabled}
                                canManage={canManage}
                            />
                        ))}
                    </div>
                )
            ) : (
                // --- TREE VIEW ---
                <div className="bg-card border rounded-xl overflow-hidden min-h-[500px]">
                    <div className="p-4 border-b bg-muted/5 font-cairo text-sm font-bold text-muted-foreground flex justify-between items-center">
                        <span>{isRTL ? 'ظ‡ظٹظƒظ„ ط§ظ„ظ…ط¨ط§ظ†ظٹ ظˆط§ظ„ط£طµظˆظ„' : 'Buildings & Assets Hierarchy'}</span>
                        <span className="text-xs font-normal bg-muted/50 px-2 py-0.5 rounded">
                            {hierarchy?.length || 0} {isRTL ? 'ظ…ظˆط§ظ‚ط¹' : 'roots'}
                        </span>
                    </div>
                    <div className="p-4">
                        {hierarchy?.length === 0 ? (
                            <EmptyState isRTL={isRTL} />
                        ) : (
                            <div className="space-y-2">
                                {hierarchy?.map(node => (
                                    <TreeNode
                                        key={node.id}
                                        node={node}
                                        isRTL={isRTL}
                                        depth={0}
                                        searchQuery={searchQuery}
                                        onDeleteAsset={handleDeleteAsset}
                                        onAddFloor={handleAddFloor}
                                        onAction={openActionModal}
                                        canManage={canManage}
                                    />
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    )
}

// Tree Node Component
function TreeNode({
    node,
    isRTL,
    depth,
    searchQuery,
    onDeleteAsset,
    onAddFloor,
    onAction,
    canManage
}: {
    node: HierarchyNode,
    isRTL: boolean,
    depth: number,
    searchQuery: string,
    onDeleteAsset: (id: string) => void,
    onAddFloor: (id: string, name: string) => void
    onAction: (id: string, name: string, status: string, action: 'start' | 'stop' | 'maintenance' | 'retire') => void
    canManage: boolean
}) {
    const [isExpanded, setIsExpanded] = useState(depth < 1)
    const [isMenuOpen, setIsMenuOpen] = useState(false)
    const menuRef = useRef<HTMLDivElement>(null)

    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
                setIsMenuOpen(false)
            }
        }
        document.addEventListener("mousedown", handleClickOutside)
        return () => document.removeEventListener("mousedown", handleClickOutside)
    }, [])

    const matchesSearch = (n: HierarchyNode): boolean => {
        if (!searchQuery) return true
        const name = (isRTL ? (n.name_ar || n.name) : n.name).toLowerCase()
        if (name.includes(searchQuery.toLowerCase())) return true
        return n.children.some(matchesSearch)
    }

    if (searchQuery && !matchesSearch(node)) return null

    let Icon = Box
    let colorClass = 'text-primary'
    if (node.type === 'building') { Icon = Building2; colorClass = 'text-blue-500' }
    else if (node.type === 'floor') { Icon = Layers; colorClass = 'text-indigo-500' }
    else if (node.type === 'asset') {
        const status = node.data?.status || 'operational'
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const conf = statusConfig[status as keyof typeof statusConfig] as any
        if (conf) {
            Icon = conf.icon
            colorClass = conf.color
        }
    }

    const hasChildren = node.children.length > 0
    const displayName = isRTL ? (node.name_ar || node.name) : node.name
    const currentStatus = node.data?.status

    return (
        <div className="select-none group">
            <div
                className={cn(
                    "flex items-center gap-2 p-2 rounded-lg hover:bg-muted/50 transition-colors relative",
                    node.type === 'asset' && "ml-4 border border-transparent hover:border-border hover:bg-card hover:shadow-sm"
                )}
                style={{ paddingInlineStart: `${depth * 1.5}rem` }}
            >
                {/* Expand Toggle */}
                <div
                    className={cn(
                        "p-1 rounded cursor-pointer hover:bg-muted text-muted-foreground transition-colors",
                        node.type === 'asset' ? "invisible" : ""
                    )}
                    onClick={(e) => {
                        e.stopPropagation()
                        if (node.type !== 'asset') setIsExpanded(!isExpanded)
                    }}
                >
                    {isExpanded ? <ChevronDown className="w-4 h-4" /> : (isRTL ? <ChevronLeft className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />)}
                </div>

                {/* Content Clickable Area */}
                <div className="flex items-center gap-2 flex-1 cursor-pointer" onClick={() => { if (node.type !== 'asset') setIsExpanded(!isExpanded) }}>
                    <Icon className={cn("w-4 h-4", colorClass)} />
                    <span className={cn(
                        "flex-1 text-sm",
                        node.type === 'building' && "font-bold text-base",
                        node.type === 'floor' && "font-medium",
                        node.type === 'asset' && "font-cairo"
                    )}>
                        {displayName}
                        {node.type === 'asset' && (
                            <span className="mx-2 text-xs text-muted-foreground font-inter">({node.data.code})</span>
                        )}
                    </span>

                    {/* Counts */}
                    {node.type !== 'asset' && (
                        <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
                            {node.children.length}
                        </span>
                    )}
                </div>

                {/* Actions Button */}
                {canManage && (node.type === 'asset' || node.type === 'building') && (
                    <div className="relative" ref={menuRef}>
                        <button
                            onClick={(e) => {
                                e.stopPropagation()
                                setIsMenuOpen(!isMenuOpen)
                            }}
                            className="p-1.5 rounded-md opacity-0 group-hover:opacity-100 peer-focus:opacity-100 hover:bg-muted text-muted-foreground transition-all"
                        >
                            <MoreVertical className="w-4 h-4" />
                        </button>

                        {/* Dropdown Menu */}
                        {isMenuOpen && (
                            <div className={cn(
                                "absolute z-50 min-w-[200px] bg-popover text-popover-foreground shadow-md rounded-md border p-1 animate-in fade-in zoom-in-95",
                                isRTL ? "left-0 origin-top-left" : "right-0 origin-top-right"
                            )}>
                                {/* Specific Asset Actions based on Status */}
                                {node.type === 'asset' && currentStatus && (
                                    <>
                                        {(currentStatus === 'operational' || currentStatus === 'retired') && (
                                            <button
                                                onClick={() => {
                                                    onAction(node.id, displayName, currentStatus, 'stop')
                                                    setIsMenuOpen(false)
                                                }}
                                                className="w-full flex items-center gap-2 px-2 py-1.5 text-sm rounded-sm hover:bg-destructive/10 hover:text-destructive cursor-pointer font-cairo"
                                            >
                                                <Power className="w-4 h-4" />
                                                {isRTL ? 'ط¥ظٹظ‚ط§ظپ / ط¥ط®ط±ط§ط¬ ط¹ظ† ط§ظ„ط®ط¯ظ…ط©' : 'Stop / Out of Service'}
                                            </button>
                                        )}

                                        {currentStatus === 'out_of_service' && (
                                            <button
                                                onClick={() => {
                                                    onAction(node.id, displayName, currentStatus, 'start')
                                                    setIsMenuOpen(false)
                                                }}
                                                className="w-full flex items-center gap-2 px-2 py-1.5 text-sm rounded-sm hover:bg-success/10 hover:text-success cursor-pointer font-cairo"
                                            >
                                                <Power className="w-4 h-4" />
                                                {isRTL ? 'طھط´ط؛ظٹظ„' : 'Start / Operational'}
                                            </button>
                                        )}

                                        {currentStatus === 'under_maintenance' && (
                                            <button
                                                onClick={() => {
                                                    onAction(node.id, displayName, currentStatus, 'start')
                                                    setIsMenuOpen(false)
                                                }}
                                                className="w-full flex items-center gap-2 px-2 py-1.5 text-sm rounded-sm hover:bg-success/10 hover:text-success cursor-pointer font-cairo"
                                            >
                                                <CheckCircle2 className="w-4 h-4" />
                                                {isRTL ? 'ط¥طھظ…ط§ظ… ط§ظ„طµظٹط§ظ†ط© (طھط´ط؛ظٹظ„)' : 'Complete Maintenance'}
                                            </button>
                                        )}

                                        {currentStatus !== 'under_maintenance' && currentStatus !== 'retired' && (
                                            <button
                                                onClick={() => {
                                                    onAction(node.id, displayName, currentStatus, 'maintenance')
                                                    setIsMenuOpen(false)
                                                }}
                                                className="w-full flex items-center gap-2 px-2 py-1.5 text-sm rounded-sm hover:bg-warning/10 hover:text-warning cursor-pointer font-cairo"
                                            >
                                                <Wrench className="w-4 h-4" />
                                                {isRTL ? 'ط¨ط¯ط، طµظٹط§ظ†ط©' : 'Start Maintenance'}
                                            </button>
                                        )}

                                        {currentStatus !== 'retired' && (
                                            <button
                                                onClick={() => {
                                                    onAction(node.id, displayName, currentStatus, 'retire')
                                                    setIsMenuOpen(false)
                                                }}
                                                className="w-full flex items-center gap-2 px-2 py-1.5 text-sm rounded-sm hover:bg-muted hover:text-muted-foreground cursor-pointer font-cairo border-b mb-1"
                                            >
                                                <Ban className="w-4 h-4" />
                                                {isRTL ? 'ط¥طھظ„ط§ظپ / طھظ‚ط§ط¹ط¯' : 'Retire Asset'}
                                            </button>
                                        )}
                                    </>
                                )}

                                {/* Standard Actions */}
                                {node.type === 'building' && (
                                    <button
                                        onClick={() => {
                                            onAddFloor(node.id, displayName)
                                            setIsMenuOpen(false)
                                        }}
                                        className="hidden"
                                    >
                                        <PlusCircle className="w-4 h-4" />
                                        {isRTL ? 'ط¥ط¶ط§ظپط© ط·ط§ط¨ظ‚' : 'Add Floor'}
                                    </button>
                                )}


                                <button
                                    onClick={() => {
                                        if (node.type === 'asset') onDeleteAsset(node.id)
                                        else toast.warning(isRTL ? "ظ„ط§ ظٹظ…ظƒظ† ط­ط°ظپ ظ‡ط°ط§ ط§ظ„ط¹ظ†طµط± ط­ط§ظ„ظٹط§ظ‹" : "Cannot delete this item yet")
                                        setIsMenuOpen(false)
                                    }}
                                    className={cn(
                                        "w-full flex items-center gap-2 px-2 py-1.5 text-sm rounded-sm hover:bg-destructive hover:text-destructive-foreground text-destructive cursor-pointer font-cairo",
                                        node.type !== 'asset' && 'hidden'
                                    )}
                                >
                                    <Trash2 className="w-4 h-4" />
                                    {isRTL ? 'ط­ط°ظپ' : 'Delete'}
                                </button>
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* Children Recursive Render */}
            {isExpanded && hasChildren && (
                <div className="border-l-2 border-muted/20 ml-4 rtl:mr-4 rtl:ml-0 rtl:border-r-2 rtl:border-l-0">
                    {node.children.map(child => (
                        <TreeNode
                            key={child.id}
                            node={child}
                            isRTL={isRTL}
                            depth={depth + 1}
                            searchQuery={searchQuery}
                            onDeleteAsset={onDeleteAsset}
                            onAddFloor={onAddFloor}
                            onAction={onAction}
                            canManage={canManage}
                        />
                    ))}
                </div>
            )}
        </div>
    )
}

function EmptyState({ isRTL }: { isRTL: boolean }) {
    return (
        <div className="flex flex-col items-center justify-center py-16 text-center">
            <Box className="w-16 h-16 text-muted/50 mb-4" />
            <h3 className="text-lg font-bold text-primary font-cairo mb-2">
                {isRTL ? 'ظ„ط§ طھظˆط¬ط¯ ط£طµظˆظ„' : 'No assets found'}
            </h3>
            <p className="text-muted font-cairo">
                {isRTL
                    ? 'ظ‚ظ… ط¨ط¥ط¶ط§ظپط© ط£طµظ„ ط¬ط¯ظٹط¯ ظ„ظ„ط¨ط¯ط،'
                    : 'Add a new asset to get started'
                }
            </p>
        </div>
    )
}

function AssetCard({ asset, isRTL, onDelete, onAction, isQrEnabled, isHistoryEnabled, isWarrantyEnabled, canManage }: {
    asset: Asset;
    isRTL: boolean,
    onDelete: () => void,
    onAction: (action: 'start' | 'stop' | 'maintenance' | 'retire') => void,
    isQrEnabled: boolean,
    isHistoryEnabled: boolean,
    isWarrantyEnabled: boolean,
    canManage: boolean
}) {
    const { t } = useTranslation()
    const status = statusConfig[asset.status]
    const criticality = criticalityConfig[asset.criticality]
    const StatusIcon = status.icon

    const displayName = isRTL ? (asset.name_ar || asset.name) : asset.name

    return (
        <div className="bg-card rounded-xl shadow-card overflow-hidden hover:shadow-lg transition-shadow cursor-pointer group relative">
            {canManage && (
                <div className="absolute top-2 left-2 rtl:right-auto rtl:left-2 opacity-0 group-hover:opacity-100 transition-opacity flex gap-1">
                    {/* Feature Actions */}
                    {isQrEnabled && (
                        <button
                            onClick={(e) => { e.stopPropagation(); toast.info("QR Code") }}
                            className="p-1 bg-white/80 hover:bg-primary hover:text-white text-primary rounded-full shadow-sm"
                            title={isRTL ? "ط±ظ…ط² QR" : "QR Code"}
                        >
                            <QrCode className="w-4 h-4" />
                        </button>
                    )}

                    {/* Quick Action Button based on status (Example: Quick toggle) */}
                    {asset.status === 'operational' && (
                        <button
                            onClick={(e) => { e.stopPropagation(); onAction('stop'); }}
                            className="p-1 bg-white/80 hover:bg-destructive hover:text-white text-destructive rounded-full shadow-sm"
                            title={isRTL ? "ط¥ظٹظ‚ط§ظپ" : "Stop"}
                        >
                            <Power className="w-4 h-4" />
                        </button>
                    )}
                    <button
                        onClick={(e) => { e.stopPropagation(); onDelete(); }}
                        className="p-1 bg-white/80 hover:bg-destructive hover:text-white text-destructive rounded-full shadow-sm"
                        title={isRTL ? "ط­ط°ظپ" : "Delete"}
                    >
                        <Trash2 className="w-4 h-4" />
                    </button>
                </div>
            )}

            {/* Header with status */}
            <div className={cn('px-4 py-2 flex items-center justify-between', status.bg)}>
                <div className="flex items-center gap-2">
                    <StatusIcon className={cn('w-4 h-4', status.color)} />
                    <span className={cn('text-sm font-medium font-cairo', status.color)}>
                        {t(`assets.${asset.status === 'under_maintenance' ? 'underMaintenance' : asset.status}`)}
                    </span>
                </div>
                <span className={cn('text-xs px-2 py-0.5 rounded-full', criticality.bg, criticality.color)}>
                    {t(`assets.${asset.criticality}`)}
                </span>
            </div>

            {/* Body */}
            <div className="p-4">
                <div className="flex items-start gap-3 mb-3">
                    <div className="p-2 bg-secondary/10 rounded-lg">
                        <Box className="w-6 h-6 text-secondary" />
                    </div>
                    <div className="flex-1 min-w-0">
                        <h3 className="font-bold text-primary font-cairo truncate">
                            {displayName}
                        </h3>
                        <p className="text-xs text-muted font-inter">{asset.code}</p>
                    </div>
                </div>

                {/* Details */}
                <div className="space-y-2 text-sm">
                    {asset.category && (
                        <div className="flex items-center gap-2 text-muted">
                            <Tag className="w-4 h-4" />
                            <span className="font-cairo truncate">
                                {isRTL ? asset.category.name_ar : asset.category.name}
                            </span>
                        </div>
                    )}
                    {asset.building && (
                        <div className="flex items-center gap-2 text-muted">
                            <Building2 className="w-4 h-4" />
                            <span className="font-cairo truncate">
                                {isRTL ? asset.building.name_ar : asset.building.name}
                            </span>
                        </div>
                    )}
                    {asset.manufacturer && (
                        <div className="flex items-center gap-2 text-muted">
                            <Wrench className="w-4 h-4" />
                            <span className="font-inter truncate">
                                {asset.manufacturer} {asset.model && `- ${asset.model}`}
                            </span>
                        </div>
                    )}

                    {/* Feature Indicators */}
                    <div className="flex gap-2 mt-2 pt-2 border-t border-border/50">
                        {isHistoryEnabled && (
                            <div className="flex items-center gap-1 text-[10px] bg-muted/20 px-1.5 py-0.5 rounded text-muted-foreground" title={isRTL ? "ط³ط¬ظ„ ط§ظ„ظ†ط´ط§ط·" : "Activity Log"}>
                                <History className="w-3 h-3" />
                                <span>{isRTL ? "ط³ط¬ظ„" : "Log"}</span>
                            </div>
                        )}
                        {isWarrantyEnabled && (
                            <div className="flex items-center gap-1 text-[10px] bg-muted/20 px-1.5 py-0.5 rounded text-muted-foreground" title={isRTL ? "ط§ظ„ط¶ظ…ط§ظ†" : "Warranty"}>
                                <ShieldCheck className="w-3 h-3" />
                                <span>{isRTL ? "ط¶ظ…ط§ظ†" : "Warranty"}</span>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    )
}

function StatCard({ title, value, icon: Icon, color }: {
    title: string
    value: number
    icon: React.ElementType
    color: string
}) {
    const colorClasses = {
        secondary: 'bg-secondary/10 text-secondary',
        success: 'bg-success/10 text-success',
        warning: 'bg-warning/10 text-warning',
        destructive: 'bg-destructive/10 text-destructive',
    }

    return (
        <div className="bg-card rounded-xl p-4 shadow-card">
            <div className="flex items-center gap-3">
                <div className={cn('p-2 rounded-lg', colorClasses[color as keyof typeof colorClasses])}>
                    <Icon className="w-5 h-5" />
                </div>
                <div>
                    <p className="text-2xl font-bold text-primary font-inter">{value}</p>
                    <p className="text-xs text-muted font-cairo">{title}</p>
                </div>
            </div>
        </div>
    )
}
