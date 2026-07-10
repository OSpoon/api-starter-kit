<script setup lang="ts">
import { toTypedSchema } from '@vee-validate/zod'
import { useForm } from 'vee-validate'
import type { Composer } from 'vue-i18n'
import { toast } from 'vue-sonner'
import { z } from 'zod'

import FormDialogFooter from '@/components/common/FormDialogFooter.vue'
import { Button } from '@/components/ui/button'
import {
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { firstFormError } from '@/lib/form-validation'

const props = defineProps<{
  open?: boolean
  creating?: boolean
}>()

const emit = defineEmits<{
  success: [values: { name: string; expiresIn: string }]
  cancel: []
}>()

const { t } = useI18n()

function createApiKeySchema(translate: Composer['t']) {
  return z.object({
    name: z
      .string()
      .trim()
      .min(1, translate('api_keys.validation.name_required'))
      .max(120, translate('api_keys.validation.name_max')),
    expiresIn: z.enum(['30d', '90d', '180d', 'long']),
  })
}

const apiKeySchema = computed(() => toTypedSchema(createApiKeySchema(t)))

const form = useForm({
  validationSchema: apiKeySchema,
  initialValues: {
    name: '',
    expiresIn: '90d' as '30d' | '90d' | '180d' | 'long',
  },
})

watch(
  () => props.open,
  (isOpen) => {
    if (isOpen) {
      form.resetForm({
        values: {
          name: '',
          expiresIn: '90d',
        },
      })
    }
  }
)

function onInvalidSubmit({ errors }: { errors: Record<string, string | undefined> }) {
  toast.error(firstFormError(errors, t('common.form_check_errors')))
}

const onSubmit = form.handleSubmit((values) => {
  emit('success', values)
}, onInvalidSubmit)
</script>

<template>
  <form class="flex flex-col" novalidate @submit="onSubmit">
    <div class="space-y-4 px-6 pb-6">
      <FormField v-slot="{ componentField }" name="name" :validate-on-blur="false">
        <FormItem>
          <FormLabel>{{ t('api_keys.name') }}</FormLabel>
          <FormControl>
            <Input v-bind="componentField" :placeholder="t('api_keys.key_name_placeholder')" />
          </FormControl>
          <FormMessage />
        </FormItem>
      </FormField>

      <FormField v-slot="{ componentField }" name="expiresIn" :validate-on-blur="false">
        <FormItem>
          <FormLabel>{{ t('api_keys.expiration') }}</FormLabel>
          <Select v-bind="componentField">
            <FormControl>
              <SelectTrigger class="w-full">
                <SelectValue :placeholder="t('api_keys.select_validity')" />
              </SelectTrigger>
            </FormControl>
            <SelectContent>
              <SelectItem value="30d">{{ t('api_keys.days', { count: 30 }) }}</SelectItem>
              <SelectItem value="90d">{{ t('api_keys.days', { count: 90 }) }}</SelectItem>
              <SelectItem value="180d">{{ t('api_keys.days', { count: 180 }) }}</SelectItem>
              <SelectItem value="long">{{ t('api_keys.expiration_long') }}</SelectItem>
            </SelectContent>
          </Select>
          <FormDescription>{{ t('api_keys.expiration_hint') }}</FormDescription>
          <FormMessage />
        </FormItem>
      </FormField>
    </div>

    <FormDialogFooter>
      <Button type="button" variant="outline" :disabled="creating" @click="emit('cancel')">
        {{ t('common.cancel') }}
      </Button>
      <Button type="submit" :disabled="creating">
        {{ creating ? t('api_keys.generating') : t('api_keys.generate_new') }}
      </Button>
    </FormDialogFooter>
  </form>
</template>
