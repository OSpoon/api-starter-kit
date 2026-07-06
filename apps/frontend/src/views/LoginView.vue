<script setup lang="ts">
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'
import { toast } from 'vue-sonner'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { InputOTP, InputOTPGroup, InputOTPSlot } from '@/components/ui/input-otp'
import { useAuthStore } from '@/stores/auth'

const router = useRouter()
const route = useRoute()
const auth = useAuthStore()
const { t } = useI18n()

const email = ref('')
const password = ref('')
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
      const redirect = (route.query.redirect as string) || '/api-keys'
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

    const redirect = (route.query.redirect as string) || '/api-keys'
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
  <main class="flex min-h-svh w-full items-center justify-center p-6 md:p-10">
    <div class="w-full max-w-sm">
      <Card>
        <CardHeader>
          <CardTitle>{{ t('auth.title') }}</CardTitle>
          <CardDescription>
            {{ isTwoFactorStep ? t('auth.desc_2fa') : t('auth.desc_default') }}
          </CardDescription>
        </CardHeader>
        <CardContent>
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
                <Input
                  id="password"
                  v-model="password"
                  type="password"
                  autocomplete="current-password"
                  required
                  :disabled="auth.loading"
                />
              </Field>
            </FieldGroup>

            <FieldGroup v-else>
              <Field
                class="flex flex-col items-center justify-center space-y-2 text-center [&>*]:w-auto"
              >
                <InputOTP id="code" v-model="twoFactorCode" :maxlength="6">
                  <InputOTPGroup>
                    <InputOTPSlot :index="0" />
                    <InputOTPSlot :index="1" />
                    <InputOTPSlot :index="2" />
                    <InputOTPSlot :index="3" />
                    <InputOTPSlot :index="4" />
                    <InputOTPSlot :index="5" />
                  </InputOTPGroup>
                </InputOTP>
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
        </CardContent>
      </Card>
    </div>
  </main>
</template>
