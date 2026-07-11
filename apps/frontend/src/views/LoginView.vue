<script setup lang="ts">
import { Eye, EyeOff } from '@lucide/vue'
import { toast } from 'vue-sonner'

import CardPageShell from '@/components/common/CardPageShell.vue'
import SegmentedCodeInput from '@/components/common/SegmentedCodeInput.vue'
import { Button } from '@/components/ui/button'
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { useAuthStore } from '@/stores/auth'

const router = useRouter()
const route = useRoute()
const auth = useAuthStore()
const { t } = useI18n()

const email = ref('')
const password = ref('')
const passwordVisible = ref(false)
const isTwoFactorStep = ref(false)
const twoFactorCode = ref('')
const tempToken = ref('')
const pendingPasswordChange = ref(false)

async function handleSubmit() {
  if (isTwoFactorStep.value) {
    if (!twoFactorCode.value) {
      toast.error(t('auth.enter_code'))
      return
    }

    try {
      await auth.verify2fa(tempToken.value, twoFactorCode.value)
      toast.success(t('auth.login_success'))
      if (pendingPasswordChange.value) {
        toast.warning(t('auth.password_expired'))
        await router.push('/change-password?reason=expired')
        return
      }
      const redirect = (route.query.redirect as string) || '/dashboard'
      await router.push(redirect)
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : t('auth.login_failed'))
    }
    return
  }

  try {
    const result = await auth.login({
      email: email.value,
      password: password.value,
    })

    if (result.kind === 'two_factor') {
      isTwoFactorStep.value = true
      tempToken.value = result.tempToken
      pendingPasswordChange.value = Boolean(result.requiresPasswordChange)
      toast.info(t('auth.enter_code'))
      return
    }

    toast.success(t('auth.login_success'))
    if (result.requiresPasswordChange) {
      toast.warning(t('auth.password_expired'))
      await router.push('/change-password?reason=expired')
      return
    }

    const redirect = (route.query.redirect as string) || '/dashboard'
    await router.push(redirect)
  } catch (cause) {
    toast.error(cause instanceof Error ? cause.message : t('auth.login_failed'))
  }
}

function backToLogin() {
  isTwoFactorStep.value = false
  twoFactorCode.value = ''
  tempToken.value = ''
  pendingPasswordChange.value = false
}
</script>

<template>
  <CardPageShell
    :title="t('auth.title')"
    :description="isTwoFactorStep ? t('auth.desc_2fa') : t('auth.desc_default')"
    max-width-class="max-w-sm"
  >
    <form @submit.prevent="handleSubmit">
      <FieldGroup v-if="!isTwoFactorStep">
        <Field>
          <FieldLabel for="email">{{ t('auth.email') }}</FieldLabel>
          <Input
            id="email"
            v-model="email"
            type="email"
            placeholder="m@example.com"
            autocomplete="email"
            required
            :disabled="auth.loading"
          />
        </Field>
        <Field>
          <FieldLabel for="password">{{ t('auth.password') }}</FieldLabel>
          <div class="relative">
            <Input
              id="password"
              v-model="password"
              :type="passwordVisible ? 'text' : 'password'"
              class="pr-10"
              autocomplete="current-password"
              required
              :disabled="auth.loading"
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              class="absolute top-1/2 right-1 size-8 -translate-y-1/2 text-muted-foreground"
              :aria-label="passwordVisible ? t('auth.hide_password') : t('auth.show_password')"
              :title="passwordVisible ? t('auth.hide_password') : t('auth.show_password')"
              :disabled="auth.loading"
              @click="passwordVisible = !passwordVisible"
            >
              <EyeOff v-if="passwordVisible" class="size-4" />
              <Eye v-else class="size-4" />
            </Button>
          </div>
        </Field>
      </FieldGroup>

      <FieldGroup v-else>
        <Field class="
          flex flex-col items-center justify-center space-y-2 text-center
          *:w-auto
        ">
          <SegmentedCodeInput id="code" v-model="twoFactorCode" />
        </Field>
      </FieldGroup>

      <div class="mt-4">
        <Button type="submit" class="w-full" :disabled="auth.loading">
          {{
            auth.loading
              ? t('auth.logging_in')
              : isTwoFactorStep
                ? t('auth.verify')
                : t('auth.login')
          }}
        </Button>
      </div>

      <div v-if="isTwoFactorStep" class="mt-4 text-center">
        <Button type="button" variant="link" size="sm" @click="backToLogin">
          {{ t('auth.back_to_login') }}
        </Button>
      </div>
    </form>
  </CardPageShell>
</template>
