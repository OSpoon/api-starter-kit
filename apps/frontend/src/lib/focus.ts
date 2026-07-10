export const modalLayerVersion = ref(0)

export function blurActiveElement() {
  if (typeof document === 'undefined') {
    return
  }

  const active = document.activeElement
  if (active instanceof HTMLElement) {
    active.blur()
  }
}

export function focusElement(element: EventTarget | null | undefined) {
  if (element instanceof HTMLElement) {
    element.focus({ preventScroll: true })
  }
}

export function prepareForModalLayer() {
  blurActiveElement()
  modalLayerVersion.value++
}
