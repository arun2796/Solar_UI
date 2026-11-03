import * as ImageManipulator from 'expo-image-manipulator'
import * as ImagePicker from 'expo-image-picker'
import * as Location from 'expo-location'
import { File, Paths } from 'expo-file-system'
import { generateUuid } from './types'
import type { SurveyPhotoLocal } from './surveyTypes'

export async function getCurrentGps(): Promise<{ lat: number; lng: number } | null> {
  try {
    const { status } = await Location.requestForegroundPermissionsAsync()
    if (status !== 'granted') return null

    // A recent last-known position is instant; only without one wait (briefly) for a fresh fix, so a weak GPS
    // signal on a rooftop never holds up attaching a photo.
    const recent = await Location.getLastKnownPositionAsync({ maxAge: 10 * 60_000, requiredAccuracy: 200 }).catch(() => null)
    const loc = recent ?? await Promise.race([
      Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      }),
      new Promise<null>(resolve => setTimeout(() => resolve(null), 5000)),
    ])

    if (loc && 'coords' in loc) {
      return {
        lat: Math.round(loc.coords.latitude * 1000000) / 1000000,
        lng: Math.round(loc.coords.longitude * 1000000) / 1000000,
      }
    }
    return null
  } catch {
    return null
  }
}

export async function captureOrPickPhoto({
  source,
  section,
  surveyNumber,
  gps,
}: {
  source: 'camera' | 'library'
  section: string
  surveyNumber?: string | null
  gps?: { lat: number; lng: number } | null
}): Promise<SurveyPhotoLocal | null> {
  let pickerResult: ImagePicker.ImagePickerResult

  if (source === 'camera') {
    const perm = await ImagePicker.requestCameraPermissionsAsync()
    if (!perm.granted) {
      throw new Error('Camera permission is required to capture site survey photos.')
    }
    pickerResult = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images'],
      quality: 0.85,
    })
  } else {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync()
    if (!perm.granted) {
      throw new Error('Gallery permission is required to select photos.')
    }
    pickerResult = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.85,
    })
  }

  if (pickerResult.canceled || !pickerResult.assets?.[0]?.uri) {
    return null
  }

  const rawUri = pickerResult.assets[0].uri

  // Try to acquire fresh GPS if not provided
  let photoGps = gps
  if (!photoGps) {
    photoGps = await getCurrentGps()
  }

  // Compress & resize to width 1280 (keeps file around ~250-350 KB, suitable for cellular networks & storage)
  const manipulated = await ImageManipulator.manipulateAsync(
    rawUri,
    [{ resize: { width: 1280 } }],
    { compress: 0.65, format: ImageManipulator.SaveFormat.JPEG }
  )

  // Persist permanently in App Document storage
  const photoId = generateUuid()
  const fileName = `survey-photo-${photoId}.jpg`
  const targetFile = new File(Paths.document, fileName)

  // Copy or read manipulated file to permanent document directory
  const manipulatedFile = new File(manipulated.uri)
  const base64 = await manipulatedFile.base64()
  targetFile.create()
  await targetFile.write(base64, { encoding: 'base64' })

  // Clean up temporary manipulated file
  try {
    if (manipulatedFile.exists) manipulatedFile.delete()
  } catch {
    // ignore
  }

  const timestamp = new Date().toISOString()
  const captionParts: string[] = []
  if (surveyNumber) captionParts.push(surveyNumber)
  captionParts.push(new Date(timestamp).toLocaleString('en-IN'))
  if (photoGps) captionParts.push(`GPS: ${photoGps.lat}, ${photoGps.lng}`)

  return {
    id: photoId,
    localUri: targetFile.uri,
    section,
    caption: captionParts.join(' | '),
    latitude: photoGps?.lat ?? null,
    longitude: photoGps?.lng ?? null,
    capturedAt: timestamp,
    pending: 1,
  }
}
