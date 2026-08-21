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

const repositoryUrl = 'https://github.com/OSpoon/api-starter-kit'
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

function openRepository() {
  window.open(repositoryUrl, '_blank', 'noopener,noreferrer')
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
          <DropdownMenuItem @click="openRepository">
            <svg
              aria-hidden="true"
              class="size-4 fill-current"
              viewBox="0 0 24 24"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                d="M12 .297a12 12 0 0 0-3.79 23.385c.6.113.82-.258.82-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.084-.729.084-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.108-.775.418-1.305.762-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.221-.124-.303-.535-1.523.117-3.176 0 0 1.008-.322 3.301 1.23a11.5 11.5 0 0 1 3.003-.404c1.018.005 2.044.137 3.003.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.873.118 3.176.77.841 1.233 1.911 1.233 3.221 0 4.61-2.805 5.625-5.476 5.921.43.372.823 1.103.823 2.222v3.293c0 .322.216.694.825.576A12 12 0 0 0 12 .297"
              />
            </svg>
            {{ t('nav.github_repository') }}
          </DropdownMenuItem>
          <DropdownMenuItem @click="handleLogout">
            <LogOut />
            {{ t('auth.logout') }}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </SidebarMenuItem>
  </SidebarMenu>
</template>
