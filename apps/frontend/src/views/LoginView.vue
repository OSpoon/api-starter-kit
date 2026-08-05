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

function githubLoginUrl() {
  return `${import.meta.env.VITE_API_URL ?? ''}/api/v1/auth/github`
}

async function completeGithubLogin() {
  const callbackCode = typeof route.query.github_code === 'string' ? route.query.github_code : null
  const code = callbackCode?.split('?')[0] ?? null
  const error = typeof route.query.github_error === 'string' ? route.query.github_error : null
  const redirect = typeof route.query.redirect === 'string' ? route.query.redirect : '/dashboard'
  if (!code && !error) {
    return
  }

  await router.replace({ name: 'login', query: redirect === '/dashboard' ? {} : { redirect } })
  if (error) {
    toast.error(
      error === 'E_GITHUB_OAUTH_ACCOUNT_NOT_LINKED'
        ? t('auth.github_not_bound')
        : t('auth.github_login_failed')
    )
    return
  }

  try {
    const result = await auth.exchangeGithubLogin(code!)
    if (result.kind === 'two_factor') {
      isTwoFactorStep.value = true
      tempToken.value = result.tempToken
      pendingPasswordChange.value = Boolean(result.requiresPasswordChange)
      toast.info(t('auth.enter_code'))
      return
    }
    toast.success(t('auth.login_success'))
    await router.push(redirect)
  } catch (cause) {
    toast.error(cause instanceof Error ? cause.message : t('auth.github_login_failed'))
  }
}

onMounted(() => void completeGithubLogin())

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
              size="icon-sm"
              class="absolute top-1/2 right-1 -translate-y-1/2 text-muted-foreground"
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
        <Field class="flex flex-col items-center justify-center space-y-2 text-center *:w-auto">
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

      <template v-if="!isTwoFactorStep">
        <div class="my-4 flex items-center gap-3 text-xs text-muted-foreground">
          <span class="h-px flex-1 bg-border" />
          {{ t('auth.or_continue_with') }}
          <span class="h-px flex-1 bg-border" />
        </div>
        <Button as-child type="button" variant="outline" class="w-full" :disabled="auth.loading">
          <a :href="githubLoginUrl()">
            <svg
              aria-hidden="true"
              class="size-4 fill-current"
              viewBox="0 0 24 24"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                d="M12 .3a12 12 0 0 0-3.8 23.4c.6.1.8-.3.8-.6v-2.2c-3.3.7-4-1.4-4-1.4-.5-1.4-1.3-1.8-1.3-1.8-1.1-.7.1-.7.1-.7 1.2.1 1.8 1.2 1.8 1.2 1.1 1.8 2.8 1.3 3.5 1 .1-.8.4-1.3.8-1.6-2.6-.3-5.3-1.3-5.3-5.8 0-1.3.5-2.3 1.2-3.1-.1-.3-.5-1.5.1-3.1 0 0 1-.3 3.2 1.2a11 11 0 0 1 5.8 0c2.2-1.5 3.2-1.2 3.2-1.2.6 1.6.2 2.8.1 3.1.8.8 1.2 1.8 1.2 3.1 0 4.5-2.7 5.5-5.3 5.8.4.4.8 1.1.8 2.2v3.3c0 .3.2.7.8.6A12 12 0 0 0 12 .3Z"
              />
            </svg>
            {{ t('auth.continue_with_github') }}
          </a>
        </Button>
      </template>

      <div v-if="isTwoFactorStep" class="mt-4 text-center">
        <Button type="button" variant="link" size="sm" @click="backToLogin">
          {{ t('auth.back_to_login') }}
        </Button>
      </div>
    </form>
  </CardPageShell>
</template>
