import { refDebounced } from '@vueuse/core'
import type { Ref } from 'vue'
import { onMounted, ref, watch } from 'vue'

export function useRemoteListSearch(
  page: Ref<number>,
  load: (page: number, search: string, isCurrent: () => boolean) => Promise<void>,
  delay = 300
) {
  const search = ref('')
  const debouncedSearch = refDebounced(search, delay)
  let latestRequestId = 0
  let pageSetByRunLoad: number | undefined

  function runLoad(nextPage = page.value, nextSearch = debouncedSearch.value) {
    if (page.value !== nextPage) {
      pageSetByRunLoad = nextPage
      page.value = nextPage
    }

    const requestId = ++latestRequestId
    return load(nextPage, nextSearch, () => {
      const normalizedSearch = debouncedSearch.value.trim()
      return (
        requestId === latestRequestId &&
        nextPage === page.value &&
        nextSearch.trim() === normalizedSearch &&
        search.value.trim() === normalizedSearch
      )
    })
  }

  watch(page, (nextPage) => {
    const suppressWatch = pageSetByRunLoad === nextPage
    pageSetByRunLoad = undefined
    if (suppressWatch) {
      return
    }
    void runLoad(nextPage)
  })

  watch(debouncedSearch, (nextSearch) => {
    if (page.value === 1) {
      void runLoad(1, nextSearch)
      return
    }
    page.value = 1
  })

  onMounted(() => {
    void runLoad()
  })

  return { search, debouncedSearch, runLoad }
}
