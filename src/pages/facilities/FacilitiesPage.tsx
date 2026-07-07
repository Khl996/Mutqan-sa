import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'
import { useBuildings, useDepartments, useFloors, Building, Department } from '@/hooks/useFacilities'
import { useFeatureEnabled } from '@/hooks/useFeatureEnabled'
import { usePermission } from '@/hooks/usePermission'
import AddBuildingModal from '@/components/facilities/AddBuildingModal'
import AddFloorModal from '@/components/facilities/AddFloorModal'
import DepartmentModal from '@/components/facilities/DepartmentModal'
import {
    Building2,
    MapPin,
    Pencil,
    Plus,
    Search,
    ChevronDown,
    ChevronUp,
    CheckCircle2,
    XCircle,
    AlertCircle,
} from 'lucide-react'

export default function FacilitiesPage() {
    const { t, i18n } = useTranslation()
    const isRTL = i18n.language === 'ar'

    // Check facility features
    const { can } = usePermission()
    const isBuildingsEnabled = useFeatureEnabled('facilities', 'buildings')
    const canManage = can('facilities.manage')
    const isFloorsEnabled = useFeatureEnabled('facilities', 'floors')
    const isDepartmentsEnabled = useFeatureEnabled('facilities', 'departments')

    const [searchQuery, setSearchQuery] = useState('')
    const [expandedBuilding, setExpandedBuilding] = useState<string | null>(null)
    const [isAddModalOpen, setIsAddModalOpen] = useState(false)

    // Floor Modal State
    const [isFloorModalOpen, setIsFloorModalOpen] = useState(false)
    const [selectedBuildingId, setSelectedBuildingId] = useState<string | null>(null)
    const [selectedBuildingName, setSelectedBuildingName] = useState('')

    // Department (location) Modal State
    const [isDepartmentModalOpen, setIsDepartmentModalOpen] = useState(false)
    const [editingDepartment, setEditingDepartment] = useState<Department | null>(null)

    // Fetch buildings from Supabase
    const { data: buildings, isLoading, error } = useBuildings()
    const { data: departments } = useDepartments()

    // Group departments by building for hierarchy display
    const departmentGroups = useMemo(() => {
        const groups = new Map<string, { label: string; items: Department[] }>()
        for (const department of departments ?? []) {
            const key = department.building?.id ?? ''
            const label = department.building
                ? (isRTL
                    ? (department.building.name_ar || department.building.name)
                    : department.building.name)
                : (isRTL ? 'بدون مبنى' : 'No building')
            const group = groups.get(key) ?? { label, items: [] }
            group.items.push(department)
            groups.set(key, group)
        }
        return Array.from(groups.values())
    }, [departments, isRTL])

    // Filter buildings based on search
    const filteredBuildings = buildings?.filter(building =>
        building.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        building.name_ar?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        building.code.toLowerCase().includes(searchQuery.toLowerCase())
    ) || []

    const toggleBuilding = (id: string) => {
        setExpandedBuilding(expandedBuilding === id ? null : id)
    }

    const openAddFloorModal = (buildingId: string, buildingName: string) => {
        setSelectedBuildingId(buildingId)
        setSelectedBuildingName(buildingName)
        setIsFloorModalOpen(true)
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

    if (error) {
        return (
            <div className="flex items-center justify-center min-h-[60vh]">
                <div className="text-center">
                    <XCircle className="w-16 h-16 text-destructive mx-auto mb-4" />
                    <h2 className="text-xl font-bold text-primary mb-2">
                        {isRTL ? 'حدث خطأ' : 'An error occurred'}
                    </h2>
                    <p className="text-muted">{error.message}</p>
                </div>
            </div>
        )
    }

    return (
        <div className="space-y-6">
            {/* Add Building Modal */}
            <AddBuildingModal
                isOpen={isAddModalOpen}
                onClose={() => setIsAddModalOpen(false)}
            />

            {/* Add Floor Modal */}
            <AddFloorModal
                isOpen={isFloorModalOpen}
                onClose={() => setIsFloorModalOpen(false)}
                buildingId={selectedBuildingId}
                buildingName={selectedBuildingName}
            />

            {/* Add/Edit Department (Location) Modal */}
            <DepartmentModal
                isOpen={isDepartmentModalOpen}
                onClose={() => {
                    setIsDepartmentModalOpen(false)
                    setEditingDepartment(null)
                }}
                department={editingDepartment}
            />

            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-primary font-cairo">
                        {t('facilities.title')}
                    </h1>
                    <p className="text-muted font-cairo">
                        {isRTL
                            ? `إدارة المباني والطوابق - ${filteredBuildings.length} مبنى`
                            : `Manage buildings and floors - ${filteredBuildings.length} buildings`
                        }
                    </p>
                </div>

                {/* Add Building Button - only if buildings feature is enabled and user has permission */}
                {isBuildingsEnabled && canManage && (
                    <button
                        onClick={() => setIsAddModalOpen(true)}
                        className="flex items-center gap-2 px-4 py-2 bg-secondary text-white rounded-lg hover:bg-secondary/90 transition-colors font-cairo"
                    >
                        <Plus className="w-5 h-5" />
                        {t('facilities.addBuilding')}
                    </button>
                )}
            </div>

            {/* Feature Disabled Warning */}
            {!isBuildingsEnabled && (
                <div className="flex items-center gap-3 p-4 bg-warning/10 border border-warning/20 rounded-xl text-warning">
                    <AlertCircle className="w-5 h-5 flex-shrink-0" />
                    <p className="font-cairo text-sm">
                        {isRTL
                            ? 'تم تعطيل ميزة إدارة المباني. يرجى مراجعة مدير النظام لتفعيلها.'
                            : 'Buildings management feature is disabled. Please contact admin to enable it.'}
                    </p>
                </div>
            )}

            {/* Search */}
            <div className="relative">
                <Search className={cn(
                    'absolute top-1/2 -translate-y-1/2 w-5 h-5 text-muted',
                    isRTL ? 'right-4' : 'left-4'
                )} />
                <input
                    type="text"
                    placeholder={isRTL ? 'البحث عن مبنى...' : 'Search buildings...'}
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className={cn(
                        'w-full py-3 bg-card border border-border rounded-xl focus:ring-2 focus:ring-secondary/20 focus:border-secondary outline-none font-cairo',
                        isRTL ? 'pr-12 pl-4' : 'pl-12 pr-4'
                    )}
                />
            </div>

            {/* Buildings Grid */}
            {filteredBuildings.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-center">
                    <Building2 className="w-16 h-16 text-muted/50 mb-4" />
                    <h3 className="text-lg font-bold text-primary font-cairo mb-2">
                        {isRTL ? 'لا توجد مباني' : 'No buildings found'}
                    </h3>
                    <p className="text-muted font-cairo">
                        {isRTL
                            ? 'قم بإضافة مبنى جديد للبدء'
                            : 'Add a new building to get started'
                        }
                    </p>
                </div>
            ) : (
                <div className="grid gap-4">
                    {filteredBuildings.map((building) => (
                        <BuildingCard
                            key={building.id}
                            building={building}
                            isExpanded={expandedBuilding === building.id}
                            onToggle={() => toggleBuilding(building.id)}
                            onAddFloor={() => openAddFloorModal(building.id, isRTL ? (building.name_ar || building.name) : building.name)}
                            isRTL={isRTL}
                            isFloorsEnabled={isFloorsEnabled}
                            canManage={canManage}
                        />
                    ))}
                </div>
            )}

            {/* Locations (Departments) */}
            {isDepartmentsEnabled && (
                <div className="bg-card rounded-xl shadow-card p-5 space-y-4">
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                        <div>
                            <h2 className="text-lg font-bold text-primary font-cairo flex items-center gap-2">
                                <MapPin className="w-5 h-5 text-secondary" />
                                {isRTL ? 'المواقع' : 'Locations'}
                            </h2>
                            <p className="text-sm text-muted font-cairo">
                                {isRTL
                                    ? `مواقع الجولات وأوامر العمل - ${departments?.length ?? 0} موقع`
                                    : `Locations used by rounds and work orders - ${departments?.length ?? 0} locations`}
                            </p>
                        </div>
                        {canManage && (
                            <button
                                onClick={() => {
                                    setEditingDepartment(null)
                                    setIsDepartmentModalOpen(true)
                                }}
                                className="flex items-center gap-2 px-4 py-2 bg-secondary text-white rounded-lg hover:bg-secondary/90 transition-colors font-cairo"
                            >
                                <Plus className="w-5 h-5" />
                                {isRTL ? 'إضافة موقع' : 'Add Location'}
                            </button>
                        )}
                    </div>

                    {departmentGroups.length === 0 ? (
                        <div className="text-center py-8 text-muted font-cairo">
                            {isRTL ? 'لا توجد مواقع مسجلة' : 'No locations registered'}
                        </div>
                    ) : (
                        departmentGroups.map((group) => (
                            <div key={group.label} className="space-y-2">
                                <h3 className="text-sm font-bold text-muted font-cairo flex items-center gap-1.5">
                                    <Building2 className="w-4 h-4" />
                                    {group.label}
                                </h3>
                                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                                    {group.items.map((department) => (
                                        <div
                                            key={department.id}
                                            className="flex items-center justify-between gap-2 p-3 bg-background rounded-lg border border-border hover:border-secondary/50 transition-colors"
                                        >
                                            <div className="min-w-0">
                                                <p className="font-medium text-primary font-cairo truncate">
                                                    {isRTL ? (department.name_ar || department.name) : department.name}
                                                </p>
                                                <div className="flex items-center gap-2 mt-0.5">
                                                    <span className="text-xs text-muted font-inter">{department.code}</span>
                                                    {!department.is_active && (
                                                        <span className="px-1.5 py-0.5 text-[10px] bg-destructive/10 text-destructive rounded-full font-cairo">
                                                            {isRTL ? 'غير نشط' : 'Inactive'}
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                            {canManage && (
                                                <button
                                                    onClick={() => {
                                                        setEditingDepartment(department)
                                                        setIsDepartmentModalOpen(true)
                                                    }}
                                                    className="p-2 text-muted hover:text-secondary hover:bg-secondary/10 rounded-lg transition-colors shrink-0"
                                                    aria-label={isRTL ? 'تعديل الموقع' : 'Edit location'}
                                                >
                                                    <Pencil className="w-4 h-4" />
                                                </button>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ))
                    )}
                </div>
            )}
        </div>
    )
}

// Building Card Component
interface BuildingCardProps {
    building: Building
    isExpanded: boolean
    onToggle: () => void
    onAddFloor: () => void
    isRTL: boolean
    isFloorsEnabled: boolean
    canManage: boolean
}

function BuildingCard({ building, isExpanded, onToggle, onAddFloor, isRTL, isFloorsEnabled, canManage }: BuildingCardProps) {
    const { t } = useTranslation()
    const { data: floors, isLoading: floorsLoading } = useFloors(isExpanded && isFloorsEnabled ? building.id : '')

    const displayName = isRTL ? (building.name_ar || building.name) : building.name

    return (
        <div className="bg-card rounded-xl shadow-card overflow-hidden">
            {/* Building Header */}
            <div
                className="p-5 cursor-pointer hover:bg-muted/5 transition-colors"
                onClick={onToggle}
            >
                <div className="flex items-start justify-between">
                    <div className="flex items-start gap-4">
                        <div className="p-3 bg-secondary/10 rounded-xl">
                            <Building2 className="w-6 h-6 text-secondary" />
                        </div>
                        <div>
                            <div className="flex items-center gap-2 flex-wrap">
                                <h3 className="text-lg font-bold text-primary font-cairo">
                                    {displayName}
                                </h3>
                                <span className="px-2 py-0.5 text-xs bg-muted/20 rounded-full font-inter">
                                    {building.code}
                                </span>
                                {building.is_active ? (
                                    <span className="flex items-center gap-1 px-2 py-0.5 text-xs bg-success/10 text-success rounded-full">
                                        <CheckCircle2 className="w-3 h-3" />
                                        {isRTL ? 'نشط' : 'Active'}
                                    </span>
                                ) : (
                                    <span className="flex items-center gap-1 px-2 py-0.5 text-xs bg-destructive/10 text-destructive rounded-full">
                                        <XCircle className="w-3 h-3" />
                                        {isRTL ? 'غير نشط' : 'Inactive'}
                                    </span>
                                )}
                            </div>

                            <div className="flex flex-wrap items-center gap-4 mt-2 text-sm text-muted">
                                {building.address && (
                                    <div className="flex items-center gap-1">
                                        <MapPin className="w-4 h-4" />
                                        <span className="font-cairo">{building.address}</span>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>

                    <button className="p-2 hover:bg-muted/10 rounded-lg transition-colors">
                        {isExpanded ? (
                            <ChevronUp className="w-5 h-5 text-muted" />
                        ) : (
                            <ChevronDown className="w-5 h-5 text-muted" />
                        )}
                    </button>
                </div>
            </div>

            {/* Expanded Floors - only if floors feature is enabled */}
            {isExpanded && isFloorsEnabled && (
                <div className="border-t border-border p-5 bg-muted/5">
                    <div className="flex items-center justify-between mb-4">
                        <h4 className="font-bold text-primary font-cairo">
                            {t('facilities.floors')}
                        </h4>
                        {canManage && (
                            <button
                                onClick={(e) => {
                                    e.stopPropagation()
                                    onAddFloor()
                                }}
                                className="flex items-center gap-1 text-sm text-secondary hover:underline font-cairo"
                            >
                                <Plus className="w-4 h-4" />
                                {t('facilities.addFloor')}
                            </button>
                        )}
                    </div>

                    {floorsLoading ? (
                        <div className="flex items-center justify-center py-8">
                            <div className="w-8 h-8 border-4 border-secondary border-t-transparent rounded-full animate-spin" />
                        </div>
                    ) : floors && floors.length > 0 ? (
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                            {floors.map((floor) => (
                                <div
                                    key={floor.id}
                                    className="flex items-center gap-3 p-3 bg-card rounded-lg border border-border hover:border-secondary/50 transition-colors cursor-pointer"
                                >
                                    <div className="flex items-center justify-center w-10 h-10 bg-info/10 rounded-lg">
                                        <span className="font-bold text-info font-inter">
                                            {floor.level}
                                        </span>
                                    </div>
                                    <div>
                                        <p className="font-medium text-primary font-cairo">
                                            {isRTL
                                                ? (floor.name_ar || `الطابق ${floor.level}`)
                                                : (floor.name || `Floor ${floor.level}`)
                                            }
                                        </p>
                                        <p className="text-xs text-muted font-inter">
                                            {floor.code}
                                        </p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="text-center py-8 text-muted font-cairo">
                            {isRTL ? 'لا توجد طوابق مسجلة' : 'No floors registered'}
                        </div>
                    )}
                </div>
            )}
        </div>
    )
}
