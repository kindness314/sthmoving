import { login, updateProfile } from '../../services/auth'
import {
  chooseProfileAvatar,
  deleteProfileAvatar,
  resolveProfileAvatar,
  uploadProfileAvatar,
} from '../../services/profile-avatar'
import {
  applyNavigationTheme,
  getThemeStyle,
  storeTheme,
  themeOptions,
} from '../../services/theme'
import type { TextEntryModalInstance } from '../../components/text-entry-modal/types'
import type { User, UserGender, UserRole, UserTheme } from '../../types/domain'

const genderOptions: readonly UserGender[] = ['UNKNOWN', 'FEMALE', 'MALE']
const genderLabels = ['未知', '女', '男']
const avatarColors = ['#17365d', '#0f766e', '#9f1239', '#7c3aed', '#b45309', '#0369a1']

Page({
  data: {
    themeStyle: getThemeStyle(),
    themes: themeOptions,
    selectedTheme: 'NAVY' as UserTheme,
    loading: true,
    saving: false,
    savingNickname: false,
    uploadingAvatar: false,
    errorMessage: '',
    userId: '',
    displayNameInput: '',
    avatarFileId: '',
    avatarDisplayUrl: '',
    avatarColor: avatarColors[0]!,
    avatarText: '微',
    genderLabels,
    genderIndex: 0,
    roleText: '',
    statusText: '',
    joinedAtText: '—',
  },

  onShow() {
    if (!this.data.userId) {
      void this.loadProfile()
    }
  },

  async loadProfile() {
    this.setData({ loading: true, errorMessage: '' })
    try {
      const session = await login()
      if (session.accessState !== 'APPROVED') {
        await wx.reLaunch({ url: '/pages/access-pending/index' })
        return
      }
      getApp<IAppOption>().globalData.currentUser = session.user
      storeTheme(session.user.theme)
      await applyNavigationTheme(session.user.theme)
      const avatarDisplayUrl = await resolveProfileAvatar(session.user.avatarUrl)
      this.applyUser(session.user, avatarDisplayUrl)
    } catch (error) {
      this.setData({ errorMessage: getErrorMessage(error, '个人资料加载失败') })
    } finally {
      this.setData({ loading: false })
    }
  },

  async handleEditDisplayName() {
    if (this.data.savingNickname || this.data.saving || this.data.uploadingAvatar) {
      return
    }
    const modal = this.selectComponent(
      '#nicknameModal',
    ) as unknown as TextEntryModalInstance | null
    if (!modal) {
      return
    }
    const displayName = await modal.open({
      title: '更改昵称',
      value: this.data.displayNameInput,
      placeholder: '请输入 1～40 个字符',
      confirmText: '保存',
      maxLength: 40,
    })
    if (displayName === null || displayName === this.data.displayNameInput) {
      return
    }
    this.setData({ savingNickname: true, errorMessage: '' })
    try {
      const user = await updateProfile({ displayName })
      getApp<IAppOption>().globalData.currentUser = user
      this.setData({
        displayNameInput: user.displayName,
        avatarText: getAvatarText(user.displayName),
      })
      await wx.showToast({ title: '昵称已更新', icon: 'success' })
    } catch (error) {
      this.setData({ errorMessage: getErrorMessage(error, '昵称更新失败') })
    } finally {
      this.setData({ savingNickname: false })
    }
  },

  handleGenderChange(event: WechatMiniprogram.PickerChange) {
    this.setData({ genderIndex: Number(event.detail.value), errorMessage: '' })
  },

  handleThemeChange(event: WechatMiniprogram.BaseEvent) {
    const theme = event.currentTarget.dataset['theme'] as UserTheme | undefined
    if (!theme || !themeOptions.some(({ key }) => key === theme)) {
      return
    }
    this.setData({
      selectedTheme: theme,
      themeStyle: getThemeStyle(theme),
      errorMessage: '',
    })
  },

  async handleAvatarChange() {
    if (this.data.uploadingAvatar || this.data.savingNickname || this.data.saving) {
      return
    }
    let uploadedFileId = ''
    this.setData({ uploadingAvatar: true, errorMessage: '' })
    try {
      const filePath = await chooseProfileAvatar()
      uploadedFileId = await uploadProfileAvatar(filePath)
      const previousFileId = this.data.avatarFileId
      const user = await updateProfile({ avatarUrl: uploadedFileId })
      getApp<IAppOption>().globalData.currentUser = user
      this.setData({
        avatarFileId: uploadedFileId,
        avatarDisplayUrl: filePath,
      })
      await deleteProfileAvatar(previousFileId)
      await wx.showToast({ title: '头像已更新', icon: 'success' })
    } catch (error) {
      if (uploadedFileId) {
        await deleteProfileAvatar(uploadedFileId)
      }
      if (!isUserCancellation(error)) {
        this.setData({ errorMessage: getErrorMessage(error, '头像更新失败') })
      }
    } finally {
      this.setData({ uploadingAvatar: false })
    }
  },

  async handleSave() {
    if (this.data.saving || this.data.savingNickname || this.data.uploadingAvatar) {
      return
    }
    const displayName = this.data.displayNameInput.trim()
    if (!displayName || displayName.length > 40) {
      this.setData({ errorMessage: '昵称长度应为 1～40 个字符' })
      return
    }
    const gender = genderOptions[this.data.genderIndex] ?? 'UNKNOWN'
    this.setData({ saving: true, errorMessage: '' })
    try {
      const user = await updateProfile({
        displayName,
        gender,
        theme: this.data.selectedTheme,
      })
      getApp<IAppOption>().globalData.currentUser = user
      storeTheme(user.theme)
      await applyNavigationTheme(user.theme)
      this.applyUser(user, this.data.avatarDisplayUrl)
      await wx.showToast({ title: '个人资料已保存', icon: 'success' })
    } catch (error) {
      this.setData({ errorMessage: getErrorMessage(error, '个人资料保存失败') })
    } finally {
      this.setData({ saving: false })
    }
  },

  applyUser(user: User, avatarDisplayUrl: string) {
    const genderIndex = Math.max(0, genderOptions.indexOf(user.gender))
    this.setData({
      themeStyle: getThemeStyle(user.theme),
      selectedTheme: user.theme,
      userId: user.id,
      displayNameInput: user.displayName,
      avatarFileId: user.avatarUrl ?? '',
      avatarDisplayUrl,
      avatarColor: getAvatarColor(user.id),
      avatarText: getAvatarText(user.displayName),
      genderIndex,
      roleText: getRoleText(user.role),
      statusText: user.status === 'APPROVED' ? '已加入' : '未加入',
      joinedAtText: user.joinedAt ? formatDateTime(user.joinedAt) : '—',
    })
  },
})

function getRoleText(role: UserRole): string {
  return {
    OWNER: '所有者',
    MANAGER: '实际管理者',
    ADMIN: '管理员',
    MEMBER: '普通成员',
  }[role]
}

function getAvatarColor(userId: string): string {
  let hash = 0
  for (const character of userId) {
    hash = (hash * 31 + character.charCodeAt(0)) >>> 0
  }
  return avatarColors[hash % avatarColors.length] ?? avatarColors[0]!
}

function getAvatarText(displayName: string): string {
  return Array.from(displayName.trim())[0] ?? '微'
}

function formatDateTime(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return value
  }
  const pad = (part: number) => part.toString().padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function getErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error) {
    return error.message
  }
  if (typeof error === 'object' && error !== null && 'errMsg' in error && typeof error.errMsg === 'string') {
    return error.errMsg
  }
  return fallback
}

function isUserCancellation(error: unknown): boolean {
  return getErrorMessage(error, '').toLowerCase().includes('cancel')
}
