import { useEffect, useState } from 'react'
import { Image, KeyboardAvoidingView, Platform, ScrollView, Text, View } from 'react-native'
import { StatusBar } from 'expo-status-bar'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useForm, Controller } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { DEV_LOGIN_ENABLED, startSession, type DevUser } from '../../lib/auth'
import { api, errorMessage, statusOf } from '../../lib/api'
import { API_URL_EDITABLE, config, setApiUrl } from '../../lib/config'
import { Button, ConnectionBanner, Field, Input } from '../../components/ui'
import { colors, font, space } from '../../theme'

const schema = z.object({
  email: z.string().trim().regex(/^[^\s@]+@[^\s@]+$/, 'Enter a valid email'),
  password: z.string().min(1, 'Enter your password'),
})
type Form = z.infer<typeof schema>

export default function Login() {
  const insets = useSafeAreaInsets()
  const { control, handleSubmit, formState: { errors, isSubmitting } } = useForm<Form>({
    resolver: zodResolver(schema),
    defaultValues: { email: '', password: '' },
  })
  const [msg, setMsg] = useState<string | null>(null)

  const submit = async (f: Form) => {
    setMsg(null)
    try {
      await startSession(await api.auth.login(f.email.trim(), f.password))
    } catch (e) {
      const s = statusOf(e)
      setMsg(
        s === 401
          ? 'Email or password is incorrect'
          : s === 429
          ? 'Too many sign-in attempts. Wait a minute and try again.'
          : errorMessage(e),
      )
    }
  }

  const forgot = () =>
    setMsg('Ask your administrator to reset your password from the admin website, then sign in with the new one.')

  const passwordForm = (
    <View>
      <Controller
        control={control}
        name="email"
        render={({ field }) => (
          <Field label="Email" error={errors.email?.message}>
            <Input
              value={field.value}
              onChangeText={field.onChange}
              autoCapitalize="none"
              keyboardType="email-address"
              autoComplete="email"
              textContentType="username"
            />
          </Field>
        )}
      />
      <Controller
        control={control}
        name="password"
        render={({ field }) => (
          <Field label="Password" error={errors.password?.message}>
            <Input
              value={field.value}
              onChangeText={field.onChange}
              secureTextEntry
              autoComplete="password"
              textContentType="password"
              onSubmitEditing={() => void handleSubmit(submit)()}
            />
          </Field>
        )}
      />
      <Button
        title="Sign in"
        onPress={handleSubmit(submit)}
        loading={isSubmitting}
        style={{ marginTop: space.xs }}
      />
      <Button
        title="Forgot password?"
        variant="ghost"
        onPress={forgot}
        style={{ marginTop: space.sm }}
      />
    </View>
  )

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface }}>
      <StatusBar style="dark" />
      {/* 1. Company logo on top left */}
      <View
        style={{
          backgroundColor: '#FFFFFF',
          paddingTop: Math.max(insets.top, space.sm),
          paddingBottom: space.sm,
          paddingHorizontal: space.lg,
          borderBottomWidth: 1,
          borderBottomColor: '#E2E8F0',
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'flex-start',
        }}
      >
        <Image
          source={require('../../../assets/images/company-logo.png')}
          style={{ width: 184, height: 44 }}
          resizeMode="contain"
          accessibilityLabel="Shree Abhi Electricals & Engineering Pvt. Ltd."
        />
      </View>

      <ConnectionBanner />

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
      >
        <ScrollView
          contentContainerStyle={{ flexGrow: 1, padding: space.lg }}
          keyboardShouldPersistTaps="handled"
        >
          {/* 2. Empty round box with white image model */}
          <View style={{ alignItems: 'center', marginTop: space.md, marginBottom: space.md }}>
            <View
              style={{
                width: 96,
                height: 96,
                borderRadius: 48,
                backgroundColor: '#FFFFFF',
                borderWidth: 2,
                borderColor: '#CBD5E1',
                alignItems: 'center',
                justifyContent: 'center',
                shadowColor: '#000',
                shadowOffset: { width: 0, height: 2 },
                shadowOpacity: 0.06,
                shadowRadius: 5,
                elevation: 2,
              }}
            >
              <Image
                source={require('../../../assets/images/avatar-model.png')}
                style={{ width: 80, height: 80, borderRadius: 40 }}
                resizeMode="cover"
                accessibilityLabel="Engineer profile"
              />
            </View>
          </View>

          {/* 3. Text as engineer sign in */}
          <Text
            style={{
              fontSize: font.title,
              fontWeight: '800',
              color: colors.text,
              textAlign: 'center',
              marginBottom: space.lg,
            }}
          >
            Engineer sign in
          </Text>

          {/* Alert / information notice (e.g. forgot password instructions or error) */}
          {msg && (
            <View
              style={{
                backgroundColor: '#FEF2F2',
                borderColor: '#FECACA',
                borderWidth: 1,
                borderRadius: 10,
                padding: space.md,
                marginBottom: space.md,
              }}
            >
              <Text
                accessibilityRole="alert"
                style={{
                  color: colors.danger,
                  fontSize: font.small,
                  fontWeight: '600',
                  textAlign: 'center',
                }}
              >
                {msg}
              </Text>
            </View>
          )}

          {/* 4. Email password box with sign in and forgot password */}
          <View
            style={{
              backgroundColor: colors.bg,
              borderRadius: 14,
              padding: space.lg,
              borderWidth: 1,
              borderColor: '#E2E8F0',
              shadowColor: '#000',
              shadowOffset: { width: 0, height: 1 },
              shadowOpacity: 0.05,
              shadowRadius: 3,
              elevation: 1,
            }}
          >
            {passwordForm}
          </View>

          {/* Test builds: quick sign-in below */}
          {DEV_LOGIN_ENABLED && (
            <View style={{ marginTop: space.xl }}>
              <Text
                style={{
                  color: colors.muted,
                  fontSize: font.small,
                  textAlign: 'center',
                  marginBottom: space.md,
                }}
              >
                — or use test quick sign-in —
              </Text>
              <DevLogin onError={setMsg} />
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  )
}

function DevLogin({ onError }: { onError: (m: string | null) => void }) {
  const [users, setUsers] = useState<DevUser[] | null>(null)
  const [state, setState] = useState<'loading' | 'ok' | 'unavailable'>('loading')
  const [busy, setBusy] = useState<string | null>(null)

  const load = () => {
    setState('loading')
    api.dev
      .users()
      .then((u) => {
        setUsers(u)
        setState('ok')
      })
      .catch(() => setState('unavailable'))
  }

  useEffect(load, [])

  const login = async (u: DevUser) => {
    onError(null)
    setBusy(u.userId)
    try {
      await startSession(await api.dev.login(u.userId), true)
    } catch (e) {
      onError(`Dev login failed: ${errorMessage(e)}`)
    } finally {
      setBusy(null)
    }
  }

  const [server, setServer] = useState(config.apiUrl)
  const saveServer = () => {
    setServer(setApiUrl(server))
    load()
  }

  return (
    <View
      style={{
        padding: space.md,
        borderWidth: 2,
        borderColor: colors.primary,
        borderRadius: 14,
        backgroundColor: colors.primarySoft,
      }}
    >
      <Text
        style={{
          fontWeight: '800',
          color: colors.primaryDark,
          fontSize: font.large,
          marginBottom: space.sm,
        }}
      >
        ⚡ Quick sign-in (test build)
      </Text>
      {API_URL_EDITABLE && (
        <Field
          label="Server address"
          hint={`Your PC's Wi-Fi address and port (ipconfig shows it), e.g. <PC address>:5000. Leave empty for ${config.builtApiUrl}.`}
        >
          <View style={{ flexDirection: 'row', gap: space.sm }}>
            <Input
              value={server}
              onChangeText={setServer}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
              style={{ flex: 1 }}
              onSubmitEditing={saveServer}
              accessibilityLabel="Server address"
            />
            <Button title="Use" variant="secondary" onPress={saveServer} style={{ minWidth: 76 }} />
          </View>
        </Field>
      )}
      {state === 'loading' && <Text style={{ color: colors.muted }}>Loading engineers from {config.apiUrl}…</Text>}
      {state === 'unavailable' && (
        <>
          <Text style={{ color: colors.muted, marginBottom: space.sm }}>
            Not available. The API at {config.apiUrl} must run in Development with DevAuth enabled, and this phone must
            reach it.
          </Text>
          <Button title="Retry" variant="secondary" onPress={load} />
        </>
      )}
      {state === 'ok' &&
        (users?.length ? (
          users.map((u) => (
            <Button
              key={u.userId}
              title={`Sign in as ${u.engineerName ?? u.email ?? 'engineer'}`}
              variant="primary"
              loading={busy === u.userId}
              onPress={() => login(u)}
              style={{ marginBottom: space.sm }}
            />
          ))
        ) : (
          <Text style={{ color: colors.muted }}>No active engineers in the database.</Text>
        ))}
    </View>
  )
}
