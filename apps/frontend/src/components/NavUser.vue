<script setup lang="ts">
import {
  BadgeCheck,
  BookOpenText,
  Check,
  ChevronsUpDown,
  CircleHelp,
  FileCode2,
  FileJson,
  Languages,
  LogOut,
  Monitor,
  Moon,
  SquareCode,
  Sun,
} from '@lucide/vue'
import { toast } from 'vue-sonner'

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from '@/components/ui/sidebar'
import { loadLocaleMessages } from '@/i18n'
import { setStoredLocale } from '@/lib/browser-preferences'
import { modalLayerVersion } from '@/lib/focus'

defineProps<{
  user: {
    name: string
    email: string
    avatar?: string
  }
}>()

const emit = defineEmits<{
  logout: []
}>()

const { isMobile } = useSidebar()
const router = useRouter()
const route = useRoute()
const { t, locale } = useI18n()
const menuOpen = ref(false)
const colorMode = useColorMode({ attribute: 'class' })
const apiDocsUrl = import.meta.env.VITE_API_DOCS_URL || ''

watch(
  () => route.path,
  () => {
    menuOpen.value = false
  }
)

watch(
  modalLayerVersion,
  () => {
    menuOpen.value = false
  },
  { flush: 'sync' }
)

function navigateTo(path: string) {
  menuOpen.value = false
  window.setTimeout(() => {
    void router.push(path)
  }, 0)
}

function openApiDocs() {
  menuOpen.value = false
  // API docs are served directly by the backend, not proxied through the
  // frontend. Open in a new tab to avoid leaving the SPA.
  const docsUrl = import.meta.env.VITE_API_DOCS_URL
  if (docsUrl) {
    window.open(docsUrl, '_blank', 'noopener,noreferrer')
  }
}

function handleLogout() {
  menuOpen.value = false
  emit('logout')
  toast.success(t('auth.logout_success'))
}

async function setLocale(newLocale: string) {
  await loadLocaleMessages(newLocale)
  locale.value = newLocale
  setStoredLocale(newLocale)
  toast.success(t('nav.language_switched'))
}

function setTheme(mode: 'light' | 'dark' | 'auto') {
  colorMode.value = mode
}
</script>

<template>
  <SidebarMenu>
    <SidebarMenuItem>
      <DropdownMenu v-model:open="menuOpen">
        <DropdownMenuTrigger as-child>
          <SidebarMenuButton
            size="lg"
            class="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
          >
            <Avatar class="size-8 rounded-lg">
              <AvatarImage v-if="user.avatar" :src="user.avatar" :alt="user.name" />
              <AvatarFallback class="rounded-lg">
                {{ user.name.slice(0, 2).toUpperCase() }}
              </AvatarFallback>
            </Avatar>
            <div class="grid flex-1 text-left text-sm/tight">
              <span class="truncate font-medium">{{ user.name }}</span>
              <span class="truncate text-xs text-muted-foreground">{{ user.email }}</span>
            </div>
            <ChevronsUpDown class="ml-auto size-4 opacity-50" />
          </SidebarMenuButton>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          class="w-(--reka-dropdown-menu-trigger-width) min-w-56 rounded-lg"
          :side="isMobile ? 'bottom' : 'right'"
          align="end"
          :side-offset="4"
        >
          <DropdownMenuLabel class="p-0 font-normal">
            <div class="flex items-center gap-2 px-1 py-1.5 text-left text-sm">
              <Avatar class="size-8 rounded-lg">
                <AvatarImage v-if="user.avatar" :src="user.avatar" :alt="user.name" />
                <AvatarFallback class="rounded-lg">
                  {{ user.name.slice(0, 2).toUpperCase() }}
                </AvatarFallback>
              </Avatar>
              <div class="grid flex-1 text-left text-sm/tight">
                <span class="truncate font-medium">{{ user.name }}</span>
                <span class="truncate text-xs text-muted-foreground">{{ user.email }}</span>
              </div>
            </div>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuGroup>
            <DropdownMenuItem @click="navigateTo('/profile')">
              <BadgeCheck />
              {{ t('nav.account') }}
            </DropdownMenuItem>
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>
                <CircleHelp />
                <span>{{ t('nav.help') }}</span>
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent>
                <DropdownMenuItem v-if="apiDocsUrl" @click="openApiDocs">
                  <BookOpenText />
                  {{ t('nav.api_docs') }}
                </DropdownMenuItem>
                <DropdownMenuItem @click="navigateTo('/schema-builder')">
                  <FileJson />
                  {{ t('nav.schema_builder') }}
                </DropdownMenuItem>
                <DropdownMenuItem @click="navigateTo('/sql-editor')">
                  <SquareCode />
                  {{ t('nav.sql_editor') }}
                </DropdownMenuItem>
                <DropdownMenuItem @click="navigateTo('/sql-workspace')">
                  <FileCode2 />
                  {{ t('nav.sql_workspace') }}
                </DropdownMenuItem>
              </DropdownMenuSubContent>
            </DropdownMenuSub>
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>
                <Languages />
                <span>{{ t('nav.language') }}</span>
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent>
                <DropdownMenuRadioGroup
                  :model-value="locale"
                  @update:model-value="(value) => setLocale(String(value))"
                >
                  <DropdownMenuRadioItem value="en">
                    <template #indicator-icon><Check class="size-4" /></template>
                    <span>English</span>
                  </DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="zh-CN">
                    <template #indicator-icon><Check class="size-4" /></template>
                    <span>中文 (简体)</span>
                  </DropdownMenuRadioItem>
                </DropdownMenuRadioGroup>
              </DropdownMenuSubContent>
            </DropdownMenuSub>
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>
                <Sun />
                <span>{{ t('nav.theme') }}</span>
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent>
                <DropdownMenuRadioGroup
                  :model-value="colorMode"
                  @update:model-value="(value) => setTheme(value as 'light' | 'dark' | 'auto')"
                >
                  <DropdownMenuRadioItem value="light">
                    <template #indicator-icon><Check class="size-4" /></template>
                    <Sun />
                    <span>{{ t('nav.theme_light') }}</span>
                  </DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="dark">
                    <template #indicator-icon><Check class="size-4" /></template>
                    <Moon />
                    <span>{{ t('nav.theme_dark') }}</span>
                  </DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="auto">
                    <template #indicator-icon><Check class="size-4" /></template>
                    <Monitor />
                    <span>{{ t('nav.theme_system') }}</span>
                  </DropdownMenuRadioItem>
                </DropdownMenuRadioGroup>
              </DropdownMenuSubContent>
            </DropdownMenuSub>
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <DropdownMenuItem @click="handleLogout">
            <LogOut />
            {{ t('auth.logout') }}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </SidebarMenuItem>
  </SidebarMenu>
</template>
