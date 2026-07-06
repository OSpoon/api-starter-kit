import { toast } from 'vue-sonner'

export function useAsyncToast() {
  function runWithToast<T>(
    promise: Promise<T>,
    messages: {
      loading: string
      success: string
      error: string
    }
  ) {
    return toast.promise(promise, messages)
  }

  return { runWithToast }
}
