<script setup lang="ts">
import { KeyRound } from '@lucide/vue'
import { useI18n } from 'vue-i18n'

import { Alert, AlertDescription } from '@/components/ui/alert'
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { Spinner } from '@/components/ui/spinner'
import type { AccountNotice } from '../composables/useAuthenticator'
import type { TotpAccount } from '../services/totp'

defineProps<{ account: TotpAccount | undefined; busy: boolean; notice: AccountNotice }>()
const emit = defineEmits<{ confirm: [] }>()
const open = defineModel<boolean>('open', { required: true })
const { t } = useI18n()
</script>

<template>
  <AlertDialog v-model:open="open">
    <AlertDialogContent>
      <AlertDialogHeader>
        <Avatar class="mb-1 size-10 rounded-xl border bg-secondary"
          ><AvatarFallback><KeyRound :size="20" /></AvatarFallback
        ></Avatar>
        <AlertDialogTitle>{{ t('deleteTitle') }}</AlertDialogTitle>
        <AlertDialogDescription>
          {{ account?.issuer }} · {{ account?.name }}<br />{{ t('deleteDescription') }}
        </AlertDialogDescription>
      </AlertDialogHeader>
      <Alert
        v-if="notice?.tone === 'error'"
        variant="destructive"
        role="status"
        aria-live="polite"
        class="py-2.5"
      >
        <AlertDescription>{{ t(notice.key) }}</AlertDescription>
      </Alert>
      <Separator />
      <AlertDialogFooter>
        <AlertDialogCancel as-child
          ><Button variant="outline" type="button" :disabled="busy">{{
            t('cancel')
          }}</Button></AlertDialogCancel
        >
        <Button variant="destructive" type="button" :disabled="busy" @click="emit('confirm')"
          ><Spinner v-if="busy" />{{ busy ? t('loading') : t('confirmDelete') }}</Button
        >
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
</template>
