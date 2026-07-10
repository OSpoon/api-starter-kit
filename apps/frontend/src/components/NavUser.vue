<script setup lang="ts">
import {
  BadgeCheck,
  BookOpenText,
  Check,
  ChevronsUpDown,
  CircleHelp,
  FileJson,
  Languages,
  LogOut,
} from '@lucide/vue'
import { ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'
import { toast } from 'vue-sonner'

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
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
  window.location.assign('/api-docs')
}

function handleLogout() {
  menuOpen.value = false
  emit('logout')
  toast.success(t('auth.logout_success'))
}

function setLocale(newLocale: string) {
  locale.value = newLocale
  localStorage.setItem('locale', newLocale)
  toast.success(t('nav.language_switched'))
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
            <Avatar class="h-8 w-8 rounded-lg">
              <AvatarImage v-if="user.avatar" :src="user.avatar" :alt="user.name" />
              <AvatarFallback class="rounded-lg">
                {{ user.name.slice(0, 2).toUpperCase() }}
              </AvatarFallback>
            </Avatar>
            <div class="grid flex-1 text-left text-sm leading-tight">
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
              <Avatar class="h-8 w-8 rounded-lg">
                <AvatarImage v-if="user.avatar" :src="user.avatar" :alt="user.name" />
                <AvatarFallback class="rounded-lg">
                  {{ user.name.slice(0, 2).toUpperCase() }}
                </AvatarFallback>
              </Avatar>
              <div class="grid flex-1 text-left text-sm leading-tight">
                <span class="truncate font-semibold">{{ user.name }}</span>
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
                <DropdownMenuItem @click="openApiDocs">
                  <BookOpenText />
                  {{ t('nav.api_docs') }}
                </DropdownMenuItem>
                <DropdownMenuItem @click="navigateTo('/schema-builder')">
                  <FileJson />
                  {{ t('nav.schema_builder') }}
                </DropdownMenuItem>
              </DropdownMenuSubContent>
            </DropdownMenuSub>
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>
                <Languages />
                <span>{{ t('nav.language') }}</span>
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent>
                <DropdownMenuItem class="cursor-pointer gap-2" @click="setLocale('en')">
                  <span>English</span>
                  <Check v-if="locale === 'en'" class="ml-auto h-4 w-4" />
                </DropdownMenuItem>
                <DropdownMenuItem class="cursor-pointer gap-2" @click="setLocale('zh-CN')">
                  <span>中文 (简体)</span>
                  <Check v-if="locale === 'zh-CN'" class="ml-auto h-4 w-4" />
                </DropdownMenuItem>
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
