export interface Translation {
  [key: string]: string
}

export function useTranslation(): Translation {
  const { t } = useI18n()
  return new Proxy({} as Translation, {
    get(_, key: string) {
      if (
        key.startsWith('__v_is') ||
        key === '__v_isRef' ||
        key === '__v_isReadonly' ||
        key === '__v_isShallow' ||
        key === '__v_isProxy'
      ) {
        return false
      }
      return t(`json_schema.${key}`)
    },
  })
}
