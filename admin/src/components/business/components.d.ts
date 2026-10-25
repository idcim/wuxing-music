export {};
declare module 'vue' {
  export interface GlobalComponents {
    BusinessPage: typeof import('./BusinessPage.vue')['default'];
    BusinessCard: typeof import('./BusinessCard.vue')['default'];
    BusinessTable: typeof import('./BusinessTable.vue')['default'];
    BusinessForm: typeof import('./BusinessForm.vue')['default'];
    BusinessModal: typeof import('./BusinessModal.vue')['default'];
    BusinessDrawer: typeof import('./BusinessDrawer.vue')['default'];
    BusinessPagination: typeof import('./BusinessPagination.vue')['default'];
  }
}
