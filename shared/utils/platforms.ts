export const PLATFORMS = {
  facebook: { label: 'Facebook', short: 'FB', unit: '粉專' },
  instagram: { label: 'Instagram', short: 'IG', unit: '帳號' },
  threads: { label: 'Threads', short: 'Threads', unit: '帳號' },
  youtube: { label: 'YouTube', short: 'YouTube', unit: '頻道' },
} as const
export type Platform = keyof typeof PLATFORMS
export const PLATFORM_KEYS = Object.keys(PLATFORMS) as Platform[]
export const isPlatform = (v: unknown): v is Platform => typeof v === 'string' && v in PLATFORMS

// 專案標籤的顏色（底色／文字，對比都在 4.5:1 以上）
export const PROJECT_COLORS = {
  green: { bg: '#E8EEE6', fg: '#3E5346', label: '綠' },
  olive: { bg: '#F3ECDC', fg: '#6B5A1E', label: '橄欖' },
  blue: { bg: '#E6EDFA', fg: '#1F4FA3', label: '藍' },
  orange: { bg: '#FCEBD3', fg: '#7A4300', label: '橘' },
  teal: { bg: '#DDF1EE', fg: '#0F5C55', label: '青' },
  purple: { bg: '#ECE6FA', fg: '#4B2FA3', label: '紫' },
  pink: { bg: '#FBE3EE', fg: '#8A1F52', label: '粉' },
  gray: { bg: '#EDEEF1', fg: '#3A3D42', label: '灰' },
} as const
export type ProjectColor = keyof typeof PROJECT_COLORS
export const isProjectColor = (v: unknown): v is ProjectColor => typeof v === 'string' && v in PROJECT_COLORS
