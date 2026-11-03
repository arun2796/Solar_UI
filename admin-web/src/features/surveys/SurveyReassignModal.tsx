import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, errorMessage } from '../../lib/api'
import type { SurveyDetail } from '../../lib/types'
import { Button, Field, Modal, Notice, Select, Textarea } from '../../components/ui'

interface SurveyReassignModalProps {
  open: boolean
  onClose: () => void
  survey: SurveyDetail
  onReassigned?: () => void
}

export function SurveyReassignModal({ open, onClose, survey, onReassigned }: SurveyReassignModalProps) {
  const qc = useQueryClient()
  const [engineerId, setEngineerId] = useState(survey.assignedEngineerId || survey.engineerId || '')
  const [reason, setReason] = useState('')
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  const engineersQuery = useQuery({
    queryKey: ['engineers', 'active'],
    queryFn: () => api.engineers.list(true),
    enabled: open,
  })
  const activeEngineers = engineersQuery.data?.filter(e => e.isActive) ?? []

  const reassignMutation = useMutation({
    mutationFn: () => api.surveys.reassign(survey.id, { engineerId, reason: reason.trim() || null }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['surveys'] })
      void qc.invalidateQueries({ queryKey: ['surveys', survey.id] })
      void qc.invalidateQueries({ queryKey: ['audit'] })
      onClose()
      onReassigned?.()
    },
    onError: (err) => setErrorMsg(errorMessage(err)),
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setErrorMsg(null)
    if (!engineerId) {
      setErrorMsg('Please select a target engineer.')
      return
    }
    reassignMutation.mutate()
  }

  return (
    <Modal open={open} title="Reassign Survey Task" onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        {errorMsg && <Notice tone="error">{errorMsg}</Notice>}

        <p className="text-sm text-slate-600">
          Reassign survey <span className="font-semibold text-slate-900">{survey.surveyRef || survey.id}</span> ({survey.customerName}) to another sales or field engineer.
        </p>

        <Field label="New Assigned Engineer *">
          <Select
            value={engineerId}
            onChange={e => setEngineerId(e.target.value)}
            disabled={engineersQuery.isLoading || reassignMutation.isPending}
          >
            <option value="">-- Select Active Engineer --</option>
            {activeEngineers.map(eng => (
              <option key={eng.id} value={eng.id}>
                {eng.name} ({eng.email})
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Reason for Reassignment (Optional - recorded in audit log)">
          <Textarea
            rows={2}
            placeholder="e.g. Schedule balancing, illness, site proximity"
            value={reason}
            onChange={e => setReason(e.target.value)}
          />
        </Field>

        <div className="mt-6 flex justify-end gap-2 border-t border-slate-200 pt-3">
          <Button variant="secondary" onClick={onClose} disabled={reassignMutation.isPending}>
            Cancel
          </Button>
          <Button type="submit" loading={reassignMutation.isPending}>
            Confirm Reassign
          </Button>
        </div>
      </form>
    </Modal>
  )
}
