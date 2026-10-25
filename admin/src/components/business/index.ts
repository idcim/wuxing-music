import type { App } from 'vue';
import BusinessPage from './BusinessPage.vue';
import BusinessCard from './BusinessCard.vue';
import BusinessTable from './BusinessTable.vue';
import BusinessForm from './BusinessForm.vue';
import BusinessModal from './BusinessModal.vue';
import BusinessDrawer from './BusinessDrawer.vue';
import BusinessPagination from './BusinessPagination.vue';

export function installBusinessComponents(app: App) {
  Object.entries({ BusinessPage, BusinessCard, BusinessTable, BusinessForm, BusinessModal, BusinessDrawer, BusinessPagination })
    .forEach(([name, component]) => app.component(name, component));
}
