import './assets/main.css'

import { createPinia } from 'pinia'

import App from './App.vue'
import { permissionDirective } from './directives/permission'
import i18n from './i18n'
import router from './router'

const app = createApp(App)

app.use(createPinia())
app.use(i18n)
app.use(router)
app.directive('permission', permissionDirective)

app.mount('#app')
