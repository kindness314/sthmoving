import type { TextEntryModalOptions } from './types'

type ResolveTextEntry = (value: string | null) => void

let resolvePending: ResolveTextEntry | null = null

Component({
  data: {
    visible: false,
    title: '',
    inputValue: '',
    placeholder: '',
    confirmText: '确定',
    confirmColor: '#0f766e',
    maxLength: 250,
    allowEmpty: false,
    canConfirm: false,
    errorMessage: '',
  },

  methods: {
    open(options: TextEntryModalOptions): Promise<string | null> {
      if (resolvePending) {
        resolvePending(null)
      }
      return new Promise<string | null>((resolve) => {
        resolvePending = resolve
        const value = options.value ?? ''
        this.setData({
          visible: true,
          title: options.title,
          inputValue: value,
          placeholder: options.placeholder ?? '请输入内容',
          confirmText: options.confirmText ?? '确定',
          confirmColor: options.confirmColor ?? '#0f766e',
          maxLength: options.maxLength ?? 250,
          allowEmpty: options.allowEmpty ?? false,
          canConfirm: options.allowEmpty ?? Boolean(value.trim()),
          errorMessage: '',
        })
      })
    },

    handleInput(event: WechatMiniprogram.Input) {
      const inputValue = event.detail.value
      this.setData({
        inputValue,
        canConfirm: this.data.allowEmpty || Boolean(inputValue.trim()),
        errorMessage: '',
      })
    },

    handleCancel() {
      this.finish(null)
    },

    handleConfirm() {
      const value = this.data.inputValue.trim()
      if (!value && !this.data.allowEmpty) {
        this.setData({
          canConfirm: false,
          errorMessage: '请输入内容后再提交',
        })
        return
      }
      this.finish(value)
    },

    stopPropagation() {
      // catchtap prevents clicks inside the card from closing the modal.
    },

    finish(value: string | null) {
      const resolve = resolvePending
      resolvePending = null
      this.setData({ visible: false, errorMessage: '' })
      resolve?.(value)
    },
  },
})
