import { listMemberCandidates } from '../../services/auth'
import type { MemberCandidate } from '../../services/auth'

type ResolvePick = (value: MemberCandidate | null) => void

const SEARCH_DEBOUNCE_MS = 300

let resolvePending: ResolvePick | null = null

Component({
  data: {
    visible: false,
    title: '',
    placeholder: '搜索成员昵称',
    keyword: '',
    candidates: [] as MemberCandidate[],
    loading: false,
    errorMessage: '',
    searchSeq: 0,
  },

  methods: {
    open(options: {
      title: string
      placeholder?: string
    }): Promise<MemberCandidate | null> {
      if (resolvePending) {
        resolvePending(null)
      }
      return new Promise<MemberCandidate | null>((resolve) => {
        resolvePending = resolve
        this.setData({
          visible: true,
          title: options.title,
          placeholder: options.placeholder ?? '搜索成员昵称',
          keyword: '',
          candidates: [],
          loading: true,
          errorMessage: '',
        })
        void this.search('', 0)
      })
    },

    handleInput(event: WechatMiniprogram.Input) {
      const keyword = event.detail.value
      const searchSeq = this.data.searchSeq + 1
      this.setData({ keyword, searchSeq })
      setTimeout(() => {
        if (searchSeq === this.data.searchSeq) {
          void this.search(keyword, searchSeq)
        }
      }, SEARCH_DEBOUNCE_MS)
    },

    async search(keyword: string, searchSeq: number) {
      if (searchSeq === this.data.searchSeq) {
        this.setData({ loading: true, errorMessage: '' })
      }
      try {
        const candidates = await listMemberCandidates(keyword || undefined)
        if (searchSeq !== this.data.searchSeq) {
          return
        }
        this.setData({ candidates, loading: false })
      } catch (error) {
        if (searchSeq !== this.data.searchSeq) {
          return
        }
        this.setData({
          candidates: [],
          loading: false,
          errorMessage:
            error instanceof Error ? error.message : '成员查询失败，请重试',
        })
      }
    },

    handleSelect(event: WechatMiniprogram.TouchEvent) {
      const index = Number(event.currentTarget.dataset.index)
      const candidate = this.data.candidates[index]
      if (candidate) {
        this.finish(candidate)
      }
    },

    handleRetry() {
      void this.search(this.data.keyword, this.data.searchSeq)
    },

    handleCancel() {
      this.finish(null)
    },

    stopPropagation() {
      // catchtap prevents clicks inside the card from closing the modal.
    },

    finish(value: MemberCandidate | null) {
      const resolve = resolvePending
      resolvePending = null
      this.setData({
        visible: false,
        errorMessage: '',
        searchSeq: this.data.searchSeq + 1,
      })
      resolve?.(value)
    },
  },
})
