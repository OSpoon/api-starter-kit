export interface Translation {
  [key: string]: string
}

export function useTranslation(): Translation {
  const { t } = useI18n()
  return new Proxy({} as Translation, {
    get(_, key: string) {
      return t(`json_schema.${key}`)
    },
  })
}
