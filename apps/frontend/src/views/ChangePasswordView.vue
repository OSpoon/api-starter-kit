<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'
import { toast } from 'vue-sonner'

import PasswordStrength from '@/components/PasswordStrength.vue'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { validatePasswordChange } from '@/lib/change-password-form'
import { passwordContext } from '@/lib/password'
import { useAuthStore } from '@/stores/auth'

const router = useRouter()
const route = useRoute()
const auth = useAuthStore()
const { t } = useI18n()

const currentPassword = ref('')
const newPassword = ref('')
const confirmPassword = ref('')
const saving = ref(false)

const isExpired = computed(() => route.query.reason === 'expired')
const passwordUserInputs = computed(() =>
  passwordContext([auth.user?.email, auth.user?.fullName, 'admin'])
)

async function handleSubmit() {
  const validationError = validatePasswordChange({
    currentPassword: currentPassword.value,
    newPassword: newPassword.value,
    confirmPassword: confirmPassword.value,
    userInputs: passwordUserInputs.value,
  })

  if (validationError === 'fill_all') {
    toast.error(t('change_password.fill_all'))
    return
  }

  if (validationError === 'password_mismatch') {
    toast.error(t('profile.password_mismatch'))
    return
  }

  if (validationError === 'password_weak') {
    toast.error(t('profile.password_weak'))
    return
  }

  saving.value = true
  try {
    await auth.changePassword(currentPassword.value, newPassword.value)
    toast.success(t('profile.password_success'))
    await router.push('/api-keys')
  } catch (error) {
    toast.error(error instanceof Error ? error.message : t('profile.password_failed'))
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <main class="flex min-h-svh items-center justify-center bg-muted p-6">
    <Card class="w-full max-w-md">
      <CardHeader>
        <CardTitle>{{ t('change_password.title') }}</CardTitle>
        <CardDescription v-if="isExpired" class="text-destructive">
          {{ t('change_password.expired_desc') }}
        </CardDescription>
        <CardDescription v-else>
          {{ t('change_password.desc') }}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form @submit.prevent="handleSubmit">
          <FieldGroup>
            <Field>
              <FieldLabel for="currentPassword">{{ t('profile.current_password') }}</FieldLabel>
              <Input
                id="currentPassword"
                v-model="currentPassword"
                type="password"
                required
                :disabled="saving"
              />
            </Field>
            <Field>
              <FieldLabel for="newPassword">{{ t('profile.new_password') }}</FieldLabel>
              <Input
                id="newPassword"
                v-model="newPassword"
                type="password"
                required
                :disabled="saving"
              />
              <PasswordStrength :password="newPassword" :user-inputs="passwordUserInputs" />
            </Field>
            <Field>
              <FieldLabel for="confirmPassword">{{ t('profile.confirm_password') }}</FieldLabel>
              <Input
                id="confirmPassword"
                v-model="confirmPassword"
                type="password"
                required
                :disabled="saving"
              />
            </Field>
            <Field>
              <Button type="submit" class="w-full" :disabled="saving">
                {{ saving ? t('common.saving') : t('profile.change_password') }}
              </Button>
            </Field>
          </FieldGroup>
        </form>
      </CardContent>
    </Card>
  </main>
</template>
