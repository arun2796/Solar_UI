// Sky-blue, high-contrast light theme for outdoor use: white on primary ≈ 5.9:1 (bold 18px+ text), selected toggle text ≥ 7:1 on its tint.
// Large type, 52 dp touch targets.
export const colors = {
  bg: '#FFFFFF', surface: '#F8FAFC', border: '#94A3B8', text: '#0F172A', muted: '#334155',
  primary: '#0369A1', primaryDark: '#075985', primarySoft: '#E0F2FE', onPrimary: '#FFFFFF', sky: '#0EA5E9',
  good: '#14532D', goodSoft: '#DCFCE7', defect: '#7F1D1D', defectSoft: '#FEE2E2',
  info: '#1E3A8A', infoSoft: '#DBEAFE', warn: '#78350F', warnSoft: '#FEF3C7', danger: '#991B1B',
}
export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24 }
export const font = { base: 18, small: 15, large: 21, title: 25 }
export const touch = 52

/** Shared navigation header: sky-blue bar, white title and back arrow. */
export const headerOptions = {
  headerStyle: { backgroundColor: colors.primary },
  headerTintColor: colors.onPrimary,
  headerTitleStyle: { fontWeight: '800' as const, color: colors.onPrimary },
  headerShadowVisible: false,
}
