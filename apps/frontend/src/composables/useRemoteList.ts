import type { Ref } from 'vue'
import { onMounted, watch } from 'vue'

export function useRemoteList(
  page: Ref<number>,
  load: (page: number, isCurrent: () => boolean) => Promise<void>
) {
  let latestRequestId = 0
  let pageSetByRunLoad: number | undefined

  function runLoad(nextPage = page.value) {
    if (page.value !== nextPage) {
      pageSetByRunLoad = nextPage
      page.value = nextPage
    }

    const requestId = ++latestRequestId
    return load(nextPage, () => requestId === latestRequestId && nextPage === page.value)
  }

  watch(page, (nextPage) => {
    const suppressWatch = pageSetByRunLoad === nextPage
    pageSetByRunLoad = undefined
    if (!suppressWatch) void runLoad(nextPage)
  })

  onMounted(() => void runLoad())

  return { runLoad }
}
