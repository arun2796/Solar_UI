import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, errorMessage } from '../../lib/api'
import type { SiteType, SurveyTaskCreate } from '../../lib/types'
import { Button, Field, Input, Modal, Notice, Select, Textarea } from '../../components/ui'
import { canAssign, PERM } from '../../lib/roles'

interface NewAssignedSurveyModalProps {
  open: boolean
  onClose: () => void
  onCreated?: (surveyId: string) => void
}

export function NewAssignedSurveyModal({ open, onClose, onCreated }: NewAssignedSurveyModalProps) {
  const qc = useQueryClient()

  // Form State
  const [customerType, setCustomerType] = useState<'Commercial' | 'Individual'>('Commercial')
  const [companyName, setCompanyName] = useState('')
  const [contactPerson, setContactPerson] = useState('')
  const [contactPhone, setContactPhone] = useState('')
  const [siteAddress, setSiteAddress] = useState('')
  const [cityArea, setCityArea] = useState('')
  const [googleMapsUrl, setGoogleMapsUrl] = useState('')
  const [gpsLatitude, setGpsLatitude] = useState<string>('')
  const [gpsLongitude, setGpsLongitude] = useState<string>('')
  const [siteType, setSiteType] = useState<SiteType>('commercial')
  const [plannedVisitDate, setPlannedVisitDate] = useState(new Date().toISOString().slice(0, 10))
  const [assignmentNotes, setAssignmentNotes] = useState('')
  const [engineerId, setEngineerId] = useState('')

  // Validation errors
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [serverError, setServerError] = useState<string | null>(null)

  // Fetch active engineers only
  const engineersQuery = useQuery({
    queryKey: ['engineers', 'active'],
    queryFn: () => api.engineers.list(true),
    enabled: open,
  })
  // only people allowed to do site surveys (Settings > Roles & permissions, or their own exception)
  const activeEngineers = engineersQuery.data?.filter(e => e.isActive && canAssign(e, PERM.surveysWork)) ?? []

  const resetForm = () => {
    setCustomerType('Commercial')
    setCompanyName('')
    setContactPerson('')
    setContactPhone('')
    setSiteAddress('')
    setCityArea('')
    setGoogleMapsUrl('')
    setGpsLatitude('')
    setGpsLongitude('')
    setSiteType('commercial')
    setPlannedVisitDate(new Date().toISOString().slice(0, 10))
    setAssignmentNotes('')
    setEngineerId('')
    setErrors({})
    setServerError(null)
  }

  const validate = (): boolean => {
    const errs: Record<string, string> = {}

    if (customerType === 'Commercial' && !companyName.trim()) {
      errs.companyName = 'Company name is required for commercial surveys'
    }

    if (!contactPerson.trim()) {
      errs.contactPerson = 'Contact person name is required'
    }

    const cleanPhone = contactPhone.trim().replace(/\s+/g, '').replace(/^\+91/, '')
    if (!cleanPhone) {
      errs.contactPhone = 'Contact mobile number is required'
    } else if (!/^[6-9]\d{9}$/.test(cleanPhone)) {
      errs.contactPhone = 'Mobile number must be exactly 10 digits starting with 6-9'
    }

    if (!siteAddress.trim()) {
      errs.siteAddress = 'Site address is required'
    }

    if (!engineerId) {
      errs.engineerId = 'Please select an assigned engineer'
    }

    setErrors(errs)
    return Object.keys(errs).length === 0
  }

  const createMutation = useMutation({
    mutationFn: (payload: SurveyTaskCreate) => api.surveys.createTask(payload),
    onSuccess: (survey) => {
      void qc.invalidateQueries({ queryKey: ['surveys'] })
      resetForm()
      onClose()
      onCreated?.(survey.id)
    },
    onError: (err: any) => {
      const resp = err?.response?.data
      if (resp?.errors && typeof resp.errors === 'object') {
        const fieldErrors: Record<string, string> = {}
        for (const [k, v] of Object.entries(resp.errors)) {
          const key = k.charAt(0).toLowerCase() + k.slice(1)
          fieldErrors[key] = Array.isArray(v) ? v[0] : String(v)
        }
        setErrors(fieldErrors)
        setServerError('Please correct the validation errors below.')
      } else {
        setServerError(errorMessage(err))
      }
    },
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setServerError(null)
    if (!validate()) return

    const lat = gpsLatitude.trim() ? Number(gpsLatitude) : null
    const lng = gpsLongitude.trim() ? Number(gpsLongitude) : null

    const payload: SurveyTaskCreate = {
      customerType,
      companyName: customerType === 'Commercial' ? companyName.trim() : null,
      contactPerson: contactPerson.trim(),
      contactPhone: contactPhone.trim().replace(/\s+/g, '').replace(/^\+91/, ''),
      siteAddress: siteAddress.trim(),
      cityArea: cityArea.trim() || null,
      googleMapsUrl: googleMapsUrl.trim() || null,
      gpsLatitude: Number.isFinite(lat) ? lat : null,
      gpsLongitude: Number.isFinite(lng) ? lng : null,
      siteType,
      plannedVisitDate: plannedVisitDate || null,
      assignmentNotes: assignmentNotes.trim() || null,
      engineerId,
    }

    createMutation.mutate(payload)
  }

  return (
    <Modal open={open} title="New Assigned Survey Task" onClose={onClose} wide closeOnBackdrop={false}>
      <form onSubmit={handleSubmit} className="space-y-4">
        {serverError && <Notice tone="error">{serverError}</Notice>}

        {/* Customer Type Radio Selection */}
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">Customer Type *</label>
          <div className="flex items-center gap-6 rounded-md border border-slate-200 bg-slate-50 p-2.5">
            <label className="flex cursor-pointer items-center gap-2 text-sm font-medium text-slate-800">
              <input
                type="radio"
                name="customerType"
                value="Commercial"
                checked={customerType === 'Commercial'}
                onChange={() => {
                  setCustomerType('Commercial')
                  setSiteType('commercial')
                  setErrors(prev => {
                    const next = { ...prev }
                    delete next.companyName
                    return next
                  })
                }}
                className="h-4 w-4 text-sky-600 focus:ring-sky-500"
              />
              Commercial
            </label>
            <label className="flex cursor-pointer items-center gap-2 text-sm font-medium text-slate-800">
              <input
                type="radio"
                name="customerType"
                value="Individual"
                checked={customerType === 'Individual'}
                onChange={() => {
                  setCustomerType('Individual')
                  setSiteType('gated_community')
                  setErrors(prev => {
                    const next = { ...prev }
                    delete next.companyName
                    return next
                  })
                }}
                className="h-4 w-4 text-sky-600 focus:ring-sky-500"
              />
              Individual / Residential
            </label>
          </div>
        </div>

        {/* Customer Details */}
        <div className="grid gap-3 sm:grid-cols-2">
          {customerType === 'Commercial' && (
            <Field label="Company Name *" error={errors.companyName}>
              <Input
                placeholder="e.g. Apex Industries Pvt Ltd"
                value={companyName}
                onChange={e => setCompanyName(e.target.value)}
              />
            </Field>
          )}

          <Field
            label="Contact Person Name *"
            error={errors.contactPerson}
            className={customerType === 'Individual' ? 'sm:col-span-2' : ''}
          >
            <Input
              placeholder="e.g. Rajesh Kumar"
              value={contactPerson}
              onChange={e => setContactPerson(e.target.value)}
            />
          </Field>

          <Field label="Contact Mobile Number *" error={errors.contactPhone} hint="10 digits starting with 6-9">
            <Input
              type="tel"
              placeholder="e.g. 9876543210"
              value={contactPhone}
              onChange={e => setContactPhone(e.target.value)}
              maxLength={15}
            />
          </Field>

          <Field label="City / Area (Optional)" error={errors.cityArea}>
            <Input
              placeholder="e.g. Guindy, Chennai"
              value={cityArea}
              onChange={e => setCityArea(e.target.value)}
            />
          </Field>
        </div>

        {/* Site Address */}
        <Field label="Site Address *" error={errors.siteAddress}>
          <Textarea
            rows={2}
            placeholder="Full site street address, landmarks, premises info"
            value={siteAddress}
            onChange={e => setSiteAddress(e.target.value)}
          />
        </Field>

        {/* Maps URL & GPS */}
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Google Maps Link (Optional)" className="sm:col-span-3" error={errors.googleMapsUrl}>
            <Input
              type="url"
              placeholder="https://maps.google.com/?q=..."
              value={googleMapsUrl}
              onChange={e => setGoogleMapsUrl(e.target.value)}
            />
          </Field>
          <Field label="GPS Latitude (Optional)" error={errors.gpsLatitude}>
            <Input
              type="number"
              step="any"
              placeholder="13.0827"
              value={gpsLatitude}
              onChange={e => setGpsLatitude(e.target.value)}
            />
          </Field>
          <Field label="GPS Longitude (Optional)" error={errors.gpsLongitude}>
            <Input
              type="number"
              step="any"
              placeholder="80.2707"
              value={gpsLongitude}
              onChange={e => setGpsLongitude(e.target.value)}
            />
          </Field>
          <Field label="Site Type *" error={errors.siteType}>
            <Select value={siteType} onChange={e => setSiteType(e.target.value as SiteType)}>
              <option value="commercial">Commercial</option>
              <option value="gated_community">Gated Community / Residential</option>
              <option value="industrial">Industrial</option>
              <option value="maintenance">Maintenance</option>
            </Select>
          </Field>
        </div>

        {/* Engineer Assignment & Planned Date */}
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Assign to Survey Engineer *" error={errors.engineerId}>
            <Select
              value={engineerId}
              onChange={e => setEngineerId(e.target.value)}
              disabled={engineersQuery.isLoading}
            >
              <option value="">-- Select Active Engineer --</option>
              {activeEngineers.map(eng => (
                <option key={eng.id} value={eng.id}>
                  {eng.name} ({eng.email})
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Planned Visit Date" error={errors.plannedVisitDate}>
            <Input
              type="date"
              value={plannedVisitDate}
              onChange={e => setPlannedVisitDate(e.target.value)}
            />
          </Field>
        </div>

        {/* Notes for Engineer */}
        <Field label="Notes / Special Instructions for Engineer (Optional)" error={errors.assignmentNotes}>
          <Textarea
            rows={2}
            placeholder="e.g. Call before reaching gate, bring safety harness for high roof inspection"
            value={assignmentNotes}
            onChange={e => setAssignmentNotes(e.target.value)}
          />
        </Field>

        {/* Actions */}
        <div className="mt-6 flex justify-end gap-2 border-t border-slate-200 pt-3">
          <Button variant="secondary" onClick={onClose} disabled={createMutation.isPending}>
            Cancel
          </Button>
          <Button type="submit" loading={createMutation.isPending}>
            Create &amp; Assign Survey
          </Button>
        </div>
      </form>
    </Modal>
  )
}
