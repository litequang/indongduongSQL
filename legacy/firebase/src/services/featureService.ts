export type FeatureModule = 
  | 'production'
  | 'finishing'
  | 'customer'
  | 'salesOrder'
  | 'warehouseDispatch'
  | 'shipping';

export interface ModuleDefinition {
  id: FeatureModule;
  name: string;
  description: string;
  required: FeatureModule[]; // Dependencies
  core?: boolean; // Cannot be disabled safely from normal UI
}

export const MODULE_REGISTRY: Record<FeatureModule, ModuleDefinition> = {
  production: {
    id: 'production',
    name: 'Sản xuất',
    description: 'Chức năng cốt lõi của hệ thống (Tạo lệnh, In, Gia công).',
    required: [],
    core: true,
  },
  finishing: {
    id: 'finishing',
    name: 'Gia công',
    description: 'Chức năng gia công (Dán, Cắt, Bế...).',
    required: ['production'],
    core: true,
  },
  customer: {
    id: 'customer',
    name: 'Khách hàng',
    description: 'Quản lý thông tin và lịch sử khách hàng.',
    required: [],
  },
  salesOrder: {
    id: 'salesOrder',
    name: 'Quản lý đơn hàng',
    description: 'Quản lý đơn hàng từ Sale đến sản xuất.',
    required: ['customer'],
  },
  warehouseDispatch: {
    id: 'warehouseDispatch',
    name: 'Xuất kho',
    description: 'Quản lý thành phẩm và xác nhận xuất khỏi xưởng.',
    required: ['salesOrder'],
  },
  shipping: {
    id: 'shipping',
    name: 'Giao hàng',
    description: 'Quản lý giao hàng và vận đơn.',
    required: ['salesOrder', 'warehouseDispatch'],
  },
};

export const featureService = {
  getDependencies(feature: FeatureModule): FeatureModule[] {
    return MODULE_REGISTRY[feature]?.required || [];
  },

  getDependents(feature: FeatureModule): FeatureModule[] {
    return (Object.keys(MODULE_REGISTRY) as FeatureModule[]).filter((key) => {
      return MODULE_REGISTRY[key].required.includes(feature);
    });
  },

  checkEnableDependencies(
    feature: FeatureModule,
    currentFeatures: Record<string, boolean>
  ): { canEnable: boolean; missingDependencies: FeatureModule[] } {
    const required = this.getDependencies(feature);
    const missing = required.filter((req) => !currentFeatures[req]);
    
    return {
      canEnable: missing.length === 0,
      missingDependencies: missing,
    };
  },

  checkDisableDependencies(
    feature: FeatureModule,
    currentFeatures: Record<string, boolean>
  ): { canDisable: boolean; activeDependents: FeatureModule[] } {
    if (MODULE_REGISTRY[feature]?.core) {
      return { canDisable: false, activeDependents: [] };
    }

    const dependents = this.getDependents(feature);
    const activeDependents = dependents.filter((dep) => currentFeatures[dep]);

    return {
      canDisable: activeDependents.length === 0,
      activeDependents: activeDependents,
    };
  },
};
