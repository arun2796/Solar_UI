import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { api, errorMessage } from '../../lib/api'
import type { SurveyDetail, SiteType, SurveyVerdict } from '../../lib/types'
import { Button, Field, Input, Modal, Notice, Select, Textarea } from '../../components/ui'

interface SurveyEditModalProps {
  open: boolean
  onClose: () => void
  survey: SurveyDetail
  onUpdated?: () => void
}

type TabKey = 'customer' | 'utility' | 'roof' | 'shading' | 'electrical' | 'verdict'

const toNum = (v: string | number | null | undefined): number | null => {
  if (v === '' || v === null || v === undefined) return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

const toStr = (v: string | null | undefined): string | null => {
  if (v === null || v === undefined) return null
  const s = String(v).trim()
  return s === '' ? null : s
}

export function SurveyEditModal({ open, onClose, survey, onUpdated }: SurveyEditModalProps) {
  const qc = useQueryClient()
  const [activeTab, setActiveTab] = useState<TabKey>('customer')
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  const d = survey.data || {}
  const s0 = d.section0 || {}
  const s1 = d.section1 || {}
  const s2 = d.section2 || {}
  const s3 = d.section3 || {}
  const s4 = d.section4 || {}
  const s5 = d.section5 || {}
  const s6 = d.section6 || {}
  const s8 = d.section8 || {}
  const s9 = d.section9 || {}
  const ovr = survey.overrides || {}

  // Section 0 & 1: Customer & Site Basic
  const [customerName, setCustomerName] = useState(s0.customerName || survey.customerName || '')
  const [siteAddress, setSiteAddress] = useState(s0.siteAddress || survey.siteAddress || '')
  const [siteType, setSiteType] = useState<SiteType>(s0.siteType || survey.siteType || 'commercial')
  const [contactPerson, setContactPerson] = useState(s1.contactPerson || '')
  const [phone, setPhone] = useState(s1.phone || '')
  const [email, setEmail] = useState(s1.email || '')
  const [customerType, setCustomerType] = useState(s1.customerType || '')
  const [designation, setDesignation] = useState(s1.designation || '')

  // Section 2: Bill & Electricity
  const [ebServiceNumbers, setEbServiceNumbers] = useState<string>(
    Array.isArray(s2.ebServiceNumbers) ? s2.ebServiceNumbers.join(', ') : (s2.ebServiceNumbers || '')
  )
  const [sanctionedLoadKw, setSanctionedLoadKw] = useState(s2.sanctionedLoadKw ?? '')
  const [contractDemandKva, setContractDemandKva] = useState(s2.contractDemandKva ?? '')
  const [phaseType, setPhaseType] = useState(s2.phaseType || 'Three')
  const [monthlyBillRs, setMonthlyBillRs] = useState(s2.monthlyBillRs ?? '')
  const [tariffCategory, setTariffCategory] = useState(s2.tariffCategory || '')
  const [tariffRateRsPerUnit, setTariffRateRsPerUnit] = useState(s2.tariffRateRsPerUnit ?? '')
  const [netMeteringAvailable, setNetMeteringAvailable] = useState(s2.netMeteringAvailable || 'YES')
  const [units24Months, setUnits24Months] = useState(s2.units24Months ?? '')
  const [amountPaid24Months, setAmountPaid24Months] = useState(s2.amountPaid24Months ?? '')

  // Section 3: Roof & Structure
  const [installationType, setInstallationType] = useState(s3.installationType || 'RCC')
  const [lengthFt, setLengthFt] = useState(s3.lengthFt ?? '')
  const [widthFt, setWidthFt] = useState(s3.widthFt ?? '')
  const [availableAreaSqft, setAvailableAreaSqft] = useState(s3.availableAreaSqft ?? '')
  const [roofCondition, setRoofCondition] = useState(s3.roofCondition || 'Good')
  const [orientation, setOrientation] = useState(s3.orientation || 'South')
  const [tilt, setTilt] = useState(s3.tilt || 'Flat')
  const [tiltAngleDeg, setTiltAngleDeg] = useState(s3.tiltAngleDeg ?? '')
  const [waterproofingStatus, setWaterproofingStatus] = useState(s3.waterproofingStatus || 'Good')
  const [materialAccess, setMaterialAccess] = useState(s3.materialAccess || 'Stairs')

  // Section 4: Shading & Exposure
  const [shadowSources, setShadowSources] = useState(s4.shadowSources || '')
  const [shadowObserved, setShadowObserved] = useState(s4.shadowObserved || 'NO')
  const [shadowAreaPercent, setShadowAreaPercent] = useState(s4.shadowAreaPercent ?? '')
  const [totalShadowFreeSunHours, setTotalShadowFreeSunHours] = useState(s4.totalShadowFreeSunHours ?? 4)

  // Section 5, 6, 8: Electrical Route & Observations
  const [mdbLocation, setMdbLocation] = useState(s5.mdbLocation || '')
  const [roofToInverterDistanceM, setRoofToInverterDistanceM] = useState(s5.roofToInverterDistanceM ?? '')
  const [inverterSpaceAvailable, setInverterSpaceAvailable] = useState(s5.inverterSpaceAvailable || 'Indoor')
  const [earthingPointsAvailable, setEarthingPointsAvailable] = useState(s5.earthingPointsAvailable || 'Adequate')
  const [wifiAvailable, setWifiAvailable] = useState(s5.wifiAvailable || 'YES')
  const [acdbLocation, setAcdbLocation] = useState(s5.acdbLocation || '')
  const [mountingStructureType, setMountingStructureType] = useState(s6.mountingStructureType || 'Elevated GI')
  const [cableRouteFeasible, setCableRouteFeasible] = useState(s6.cableRouteFeasible || 'YES')
  const [structuralReinforcementNeeded, setStructuralReinforcementNeeded] = useState(s6.structuralReinforcementNeeded || 'NO')
  const [generalObservations, setGeneralObservations] = useState(s8.generalObservations || '')
  const [specialRequirements, setSpecialRequirements] = useState(s8.specialRequirements || '')
  const [risks, setRisks] = useState(s8.risks || '')
  const [customerRepName, setCustomerRepName] = useState(s8.customerRepName || survey.customerRepName || '')

  // Section 9 & Overrides
  const [verdict, setVerdict] = useState<SurveyVerdict>(s9.verdict || survey.verdict || 'FEASIBLE')
  const [recommendationNote, setRecommendationNote] = useState(s9.recommendationNote || '')
  const [conditions, setConditions] = useState(s9.conditions || '')
  const [overrideSystemSizeKw, setOverrideSystemSizeKw] = useState(ovr.overrideSystemSizeKw ?? '')
  const [overrideNumberOfPanels, setOverrideNumberOfPanels] = useState(ovr.overrideNumberOfPanels ?? '')
  const [overrideMonthlySavingsRs, setOverrideMonthlySavingsRs] = useState(ovr.overrideMonthlySavingsRs ?? '')
  const [overrideReason, setOverrideReason] = useState(ovr.overrideReason || '')

  const updateMutation = useMutation({
    mutationFn: async () => {
      setErrorMsg(null)

      const parsedEbList = ebServiceNumbers
        .split(/[,\n]/)
        .map(x => x.trim())
        .filter(Boolean)

      const updatedData = {
        ...d,
        section0: {
          ...s0,
          customerName: customerName.trim(),
          siteAddress: siteAddress.trim(),
          siteType,
        },
        section1: {
          ...s1,
          contactPerson: toStr(contactPerson),
          phone: toStr(phone),
          email: toStr(email),
          customerType: toStr(customerType),
          designation: toStr(designation),
        },
        section2: {
          ...s2,
          ebServiceNumbers: parsedEbList.length > 0 ? parsedEbList : null,
          sanctionedLoadKw: toNum(sanctionedLoadKw),
          contractDemandKva: toNum(contractDemandKva),
          phaseType: toStr(phaseType),
          monthlyBillRs: toNum(monthlyBillRs),
          tariffCategory: toStr(tariffCategory),
          tariffRateRsPerUnit: toNum(tariffRateRsPerUnit),
          netMeteringAvailable: toStr(netMeteringAvailable),
          units24Months: toNum(units24Months),
          amountPaid24Months: toNum(amountPaid24Months),
        },
        section3: {
          ...s3,
          installationType: toStr(installationType),
          lengthFt: toNum(lengthFt),
          widthFt: toNum(widthFt),
          availableAreaSqft: toNum(availableAreaSqft),
          roofCondition: toStr(roofCondition),
          orientation: toStr(orientation),
          tilt: toStr(tilt),
          tiltAngleDeg: toNum(tiltAngleDeg),
          waterproofingStatus: toStr(waterproofingStatus),
          materialAccess: toStr(materialAccess),
        },
        section4: {
          ...s4,
          shadowSources: toStr(shadowSources),
          shadowObserved: toStr(shadowObserved),
          shadowAreaPercent: toNum(shadowAreaPercent),
          totalShadowFreeSunHours: toNum(totalShadowFreeSunHours),
        },
        section5: {
          ...s5,
          mdbLocation: toStr(mdbLocation),
          roofToInverterDistanceM: toNum(roofToInverterDistanceM),
          inverterSpaceAvailable: toStr(inverterSpaceAvailable),
          earthingPointsAvailable: toStr(earthingPointsAvailable),
          wifiAvailable: toStr(wifiAvailable),
          acdbLocation: toStr(acdbLocation),
        },
        section6: {
          ...s6,
          mountingStructureType: toStr(mountingStructureType),
          cableRouteFeasible: toStr(cableRouteFeasible),
          structuralReinforcementNeeded: toStr(structuralReinforcementNeeded),
        },
        section8: {
          ...s8,
          generalObservations: toStr(generalObservations),
          specialRequirements: toStr(specialRequirements),
          risks: toStr(risks),
          customerRepName: toStr(customerRepName),
        },
        section9: {
          ...s9,
          verdict,
          recommendationNote: toStr(recommendationNote),
          conditions: toStr(conditions),
        },
      }

      const hasOverrideValues =
        toNum(overrideSystemSizeKw) !== null ||
        toNum(overrideNumberOfPanels) !== null ||
        toNum(overrideMonthlySavingsRs) !== null

      const updatedOverrides = hasOverrideValues
        ? {
            overrideSystemSizeKw: toNum(overrideSystemSizeKw),
            overrideNumberOfPanels: toNum(overrideNumberOfPanels),
            overrideMonthlySavingsRs: toNum(overrideMonthlySavingsRs),
            overrideReason: toStr(overrideReason) || 'Updated via Admin revision',
          }
        : null

      return await api.surveys.update(survey.id, {
        version: survey.version,
        data: updatedData,
        overrides: updatedOverrides,
      })
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['survey', survey.id] })
      void qc.invalidateQueries({ queryKey: ['surveys'] })
      onUpdated?.()
      onClose()
    },
    onError: err => {
      setErrorMsg(errorMessage(err))
    },
  })

  const tabs: { key: TabKey; label: string }[] = [
    { key: 'customer', label: '1. Customer & Site' },
    { key: 'utility', label: '2. Electricity & Bill' },
    { key: 'roof', label: '3. Roof & Civil' },
    { key: 'shading', label: '4. Shading & Sun' },
    { key: 'electrical', label: '5. Electrical & Route' },
    { key: 'verdict', label: '6. Sizing & Verdict' },
  ]

  return (
    <Modal
      open={open}
      title={`Edit Survey Details · ${survey.surveyRef || 'Draft'}`}
      onClose={onClose}
      wide
      closeOnBackdrop={false}
    >
      <div className="space-y-4">
        {errorMsg && <Notice tone="error">{errorMsg}</Notice>}

        {/* Tab navigation */}
        <div className="flex flex-wrap gap-1 border-b border-slate-200 pb-2">
          {tabs.map(t => (
            <button
              key={t.key}
              type="button"
              onClick={() => setActiveTab(t.key)}
              className={`rounded-md px-3 py-1.5 text-xs font-semibold transition ${
                activeTab === t.key
                  ? 'bg-sky-700 text-white shadow-sm'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Tab 1: Customer & Site */}
        {activeTab === 'customer' && (
          <div className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Customer / Company Name *">
                <Input
                  value={customerName}
                  onChange={e => setCustomerName(e.target.value)}
                  placeholder="e.g. Apollo Speciality Hospitals"
                />
              </Field>
              <Field label="Site Type *">
                <Select
                  value={siteType}
                  onChange={e => setSiteType(e.target.value as SiteType)}
                >
                  <option value="gated_community">Gated Community / Residential</option>
                  <option value="commercial">Commercial</option>
                  <option value="industrial">Industrial</option>
                  <option value="maintenance">Maintenance</option>
                </Select>
              </Field>
            </div>

            <Field label="Site Full Address *">
              <Textarea
                rows={2}
                value={siteAddress}
                onChange={e => setSiteAddress(e.target.value)}
                placeholder="Complete postal address with landmarks"
              />
            </Field>

            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Contact Person Name">
                <Input
                  value={contactPerson}
                  onChange={e => setContactPerson(e.target.value)}
                  placeholder="e.g. Dr. S. Ramanathan"
                />
              </Field>
              <Field label="Designation / Role">
                <Input
                  value={designation}
                  onChange={e => setDesignation(e.target.value)}
                  placeholder="e.g. Facility Director"
                />
              </Field>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Mobile Phone (10 Digits)">
                <Input
                  value={phone}
                  onChange={e => setPhone(e.target.value)}
                  placeholder="e.g. 9840123456"
                />
              </Field>
              <Field label="Email Address">
                <Input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="e.g. info@client.com"
                />
              </Field>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Customer Classification">
                <Input
                  value={customerType}
                  onChange={e => setCustomerType(e.target.value)}
                  placeholder="e.g. Private Limited / Trust"
                />
              </Field>
              <Field label="Customer Representative (Signee)">
                <Input
                  value={customerRepName}
                  onChange={e => setCustomerRepName(e.target.value)}
                  placeholder="Name of customer signee"
                />
              </Field>
            </div>
          </div>
        )}

        {/* Tab 2: Electricity & Bill */}
        {activeTab === 'utility' && (
          <div className="space-y-3">
            <Field label="EB Consumer / Service Numbers (comma-separated)">
              <Input
                value={ebServiceNumbers}
                onChange={e => setEbServiceNumbers(e.target.value)}
                placeholder="e.g. 01-234-567-890, 01-234-567-891"
              />
            </Field>

            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="Sanctioned Load (kW)">
                <Input
                  type="number"
                  step="0.1"
                  min="0"
                  value={sanctionedLoadKw}
                  onChange={e => setSanctionedLoadKw(e.target.value)}
                  placeholder="e.g. 50"
                />
              </Field>
              <Field label="Contract Demand (kVA)">
                <Input
                  type="number"
                  step="0.1"
                  min="0"
                  value={contractDemandKva}
                  onChange={e => setContractDemandKva(e.target.value)}
                  placeholder="e.g. 60"
                />
              </Field>
              <Field label="Phase Connection">
                <Select value={phaseType} onChange={e => setPhaseType(e.target.value)}>
                  <option value="Three">Three Phase</option>
                  <option value="Single">Single Phase</option>
                </Select>
              </Field>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="Monthly Bill Amount (₹)">
                <Input
                  type="number"
                  step="1"
                  min="0"
                  value={monthlyBillRs}
                  onChange={e => setMonthlyBillRs(e.target.value)}
                  placeholder="e.g. 45000"
                />
              </Field>
              <Field label="Tariff Rate (₹ / Unit)">
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  value={tariffRateRsPerUnit}
                  onChange={e => setTariffRateRsPerUnit(e.target.value)}
                  placeholder="e.g. 9.50"
                />
              </Field>
              <Field label="Tariff Category">
                <Input
                  value={tariffCategory}
                  onChange={e => setTariffCategory(e.target.value)}
                  placeholder="e.g. Commercial HT / LT"
                />
              </Field>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="Net Metering Available">
                <Select
                  value={netMeteringAvailable}
                  onChange={e => setNetMeteringAvailable(e.target.value)}
                >
                  <option value="YES">YES</option>
                  <option value="NO">NO</option>
                </Select>
              </Field>
              <Field label="24-Month Total Units (kWh)">
                <Input
                  type="number"
                  step="1"
                  min="0"
                  value={units24Months}
                  onChange={e => setUnits24Months(e.target.value)}
                  placeholder="e.g. 120000"
                />
              </Field>
              <Field label="24-Month Total Bill (₹)">
                <Input
                  type="number"
                  step="1"
                  min="0"
                  value={amountPaid24Months}
                  onChange={e => setAmountPaid24Months(e.target.value)}
                  placeholder="e.g. 1140000"
                />
              </Field>
            </div>
          </div>
        )}

        {/* Tab 3: Roof & Civil */}
        {activeTab === 'roof' && (
          <div className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="Installation / Roof Type">
                <Select
                  value={installationType}
                  onChange={e => setInstallationType(e.target.value)}
                >
                  <option value="RCC">RCC Concrete Roof</option>
                  <option value="sheet">Metal / Industrial Sheet</option>
                  <option value="ground">Ground Mounted</option>
                  <option value="car park">Solar Car Park / Canopy</option>
                </Select>
              </Field>
              <Field label="Roof Condition">
                <Select
                  value={roofCondition}
                  onChange={e => setRoofCondition(e.target.value)}
                >
                  <option value="Good">Good / Sound</option>
                  <option value="Moderate">Moderate</option>
                  <option value="Needs Repair">Needs Repair / Crack Repairs</option>
                </Select>
              </Field>
              <Field label="Waterproofing Status">
                <Select
                  value={waterproofingStatus}
                  onChange={e => setWaterproofingStatus(e.target.value)}
                >
                  <option value="Good">Good Condition</option>
                  <option value="Damaged">Damaged / Flaking</option>
                  <option value="None">None</option>
                </Select>
              </Field>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="Length (Feet)">
                <Input
                  type="number"
                  step="0.1"
                  min="0"
                  value={lengthFt}
                  onChange={e => setLengthFt(e.target.value)}
                  placeholder="e.g. 60"
                />
              </Field>
              <Field label="Width (Feet)">
                <Input
                  type="number"
                  step="0.1"
                  min="0"
                  value={widthFt}
                  onChange={e => setWidthFt(e.target.value)}
                  placeholder="e.g. 40"
                />
              </Field>
              <Field label="Net Available Area (Sq. Ft)">
                <Input
                  type="number"
                  step="1"
                  min="0"
                  value={availableAreaSqft}
                  onChange={e => setAvailableAreaSqft(e.target.value)}
                  placeholder="e.g. 2400"
                />
              </Field>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="Roof Orientation">
                <Select
                  value={orientation}
                  onChange={e => setOrientation(e.target.value)}
                >
                  <option value="South">True South</option>
                  <option value="South-East">South-East</option>
                  <option value="South-West">South-West</option>
                  <option value="East">East</option>
                  <option value="West">West</option>
                  <option value="North">North</option>
                </Select>
              </Field>
              <Field label="Roof Tilt Type">
                <Select value={tilt} onChange={e => setTilt(e.target.value)}>
                  <option value="Flat">Flat Roof (0° - 5°)</option>
                  <option value="Sloped">Sloped Roof</option>
                </Select>
              </Field>
              <Field label="Tilt Angle (Degrees)">
                <Input
                  type="number"
                  step="1"
                  min="0"
                  max="90"
                  value={tiltAngleDeg}
                  onChange={e => setTiltAngleDeg(e.target.value)}
                  placeholder="e.g. 11"
                />
              </Field>
            </div>

            <Field label="Material Access to Roof">
              <Select
                value={materialAccess}
                onChange={e => setMaterialAccess(e.target.value)}
              >
                <option value="Stairs">Internal / External Stairs</option>
                <option value="Lift">Goods Lift</option>
                <option value="Crane">Crane Lifting Required</option>
                <option value="Scaffolding">Scaffolding / Winch</option>
              </Select>
            </Field>
          </div>
        )}

        {/* Tab 4: Shading & Sun Hours */}
        {activeTab === 'shading' && (
          <div className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Shadow Observed on Roof">
                <Select
                  value={shadowObserved}
                  onChange={e => setShadowObserved(e.target.value)}
                >
                  <option value="NO">NO — Free of Obstacles</option>
                  <option value="YES">YES — Obstacles Present</option>
                </Select>
              </Field>
              <Field label="Shadow Area (% of Total Roof)">
                <Input
                  type="number"
                  step="1"
                  min="0"
                  max="100"
                  value={shadowAreaPercent}
                  onChange={e => setShadowAreaPercent(e.target.value)}
                  placeholder="e.g. 5"
                />
              </Field>
            </div>

            <Field label="Total Shadow-Free Sun Hours / Day">
              <Input
                type="number"
                step="0.1"
                min="0"
                max="24"
                value={totalShadowFreeSunHours}
                onChange={e => setTotalShadowFreeSunHours(e.target.value)}
                placeholder="e.g. 4.5"
              />
            </Field>

            <Field label="Shadow Sources & Obstructions Description">
              <Textarea
                rows={3}
                value={shadowSources}
                onChange={e => setShadowSources(e.target.value)}
                placeholder="e.g. Water tank on North corner (10 ft high), parapet wall 3 ft, tree branch on South-West"
              />
            </Field>
          </div>
        )}

        {/* Tab 5: Electrical Route & Notes */}
        {activeTab === 'electrical' && (
          <div className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Main Distribution Board (MDB) Location">
                <Input
                  value={mdbLocation}
                  onChange={e => setMdbLocation(e.target.value)}
                  placeholder="e.g. Ground Floor Electrical Room"
                />
              </Field>
              <Field label="Roof to Inverter Cable Distance (Meters)">
                <Input
                  type="number"
                  step="1"
                  min="0"
                  value={roofToInverterDistanceM}
                  onChange={e => setRoofToInverterDistanceM(e.target.value)}
                  placeholder="e.g. 25"
                />
              </Field>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="Inverter Space Available">
                <Select
                  value={inverterSpaceAvailable}
                  onChange={e => setInverterSpaceAvailable(e.target.value)}
                >
                  <option value="Indoor">Indoor (Well Ventilated)</option>
                  <option value="Outdoor">Outdoor / Shaded Roof</option>
                  <option value="Wall Mounted">Wall Mounted in Passage</option>
                  <option value="Not Available">Not Available</option>
                </Select>
              </Field>
              <Field label="Earthing Points Available">
                <Select
                  value={earthingPointsAvailable}
                  onChange={e => setEarthingPointsAvailable(e.target.value)}
                >
                  <option value="Adequate">Adequate Points Exist</option>
                  <option value="New Required">New Earth Pits Required</option>
                  <option value="None">None</option>
                </Select>
              </Field>
              <Field label="WiFi / Monitoring Internet Available">
                <Select
                  value={wifiAvailable}
                  onChange={e => setWifiAvailable(e.target.value)}
                >
                  <option value="YES">YES</option>
                  <option value="NO">NO</option>
                </Select>
              </Field>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="ACDB Location">
                <Input
                  value={acdbLocation}
                  onChange={e => setAcdbLocation(e.target.value)}
                  placeholder="e.g. Beside Inverter / Panel"
                />
              </Field>
              <Field label="Cable Route Feasible">
                <Select
                  value={cableRouteFeasible}
                  onChange={e => setCableRouteFeasible(e.target.value)}
                >
                  <option value="YES">YES</option>
                  <option value="NO">NO</option>
                </Select>
              </Field>
              <Field label="Structural Reinforcement Needed">
                <Select
                  value={structuralReinforcementNeeded}
                  onChange={e => setStructuralReinforcementNeeded(e.target.value)}
                >
                  <option value="NO">NO</option>
                  <option value="YES">YES</option>
                </Select>
              </Field>
            </div>

            <Field label="Mounting Structure Type">
              <Input
                value={mountingStructureType}
                onChange={e => setMountingStructureType(e.target.value)}
                placeholder="e.g. Elevated Hot Dip GI Structure (8 ft clearance)"
              />
            </Field>

            <Field label="General Observations">
              <Textarea
                rows={2}
                value={generalObservations}
                onChange={e => setGeneralObservations(e.target.value)}
                placeholder="Any key findings or site observations"
              />
            </Field>

            <Field label="Special Requirements">
              <Input
                value={specialRequirements}
                onChange={e => setSpecialRequirements(e.target.value)}
                placeholder="e.g. DG synchronization required, zero-export device needed"
              />
            </Field>

            <Field label="Risks & Special Constraints">
              <Input
                value={risks}
                onChange={e => setRisks(e.target.value)}
                placeholder="e.g. High wind zone; crane permission needed from society"
              />
            </Field>
          </div>
        )}

        {/* Tab 6: Verdict & Overrides */}
        {activeTab === 'verdict' && (
          <div className="space-y-3">
            <Field label="Overall Site Feasibility Verdict *">
              <Select
                value={verdict}
                onChange={e => setVerdict(e.target.value as SurveyVerdict)}
              >
                <option value="FEASIBLE">FEASIBLE — Recommended for Solar PV</option>
                <option value="CONDITIONAL">CONDITIONAL — Feasible with Pre-requisites</option>
                <option value="NOT_FEASIBLE">NOT FEASIBLE — Site Unsuitable</option>
              </Select>
            </Field>

            <Field label="Engineer Recommendation Notes">
              <Textarea
                rows={2}
                value={recommendationNote}
                onChange={e => setRecommendationNote(e.target.value)}
                placeholder="Summary recommendation for the client"
              />
            </Field>

            <Field label="Pre-requisite Conditions (if Conditional)">
              <Input
                value={conditions}
                onChange={e => setConditions(e.target.value)}
                placeholder="e.g. Water tank parapet must be waterproofed before mounting"
              />
            </Field>

            {/* Manual Calculation Overrides */}
            <div className="rounded-lg border border-amber-200 bg-amber-50/50 p-4 space-y-3">
              <div className="font-semibold text-amber-900 text-sm">
                Manual Calculation Overrides (Optional)
              </div>
              <p className="text-xs text-amber-700">
                Leave blank to let the system automatically compute values from roof area and bill. Fill in values below to override the automated recommendation.
              </p>

              <div className="grid gap-3 sm:grid-cols-3">
                <Field label="Override Capacity (kW)">
                  <Input
                    type="number"
                    step="0.1"
                    min="0"
                    value={overrideSystemSizeKw}
                    onChange={e => setOverrideSystemSizeKw(e.target.value)}
                    placeholder="Auto"
                  />
                </Field>
                <Field label="Override Panels Count">
                  <Input
                    type="number"
                    step="1"
                    min="0"
                    value={overrideNumberOfPanels}
                    onChange={e => setOverrideNumberOfPanels(e.target.value)}
                    placeholder="Auto"
                  />
                </Field>
                <Field label="Override Monthly Savings (₹)">
                  <Input
                    type="number"
                    step="100"
                    min="0"
                    value={overrideMonthlySavingsRs}
                    onChange={e => setOverrideMonthlySavingsRs(e.target.value)}
                    placeholder="Auto"
                  />
                </Field>
              </div>

              {(overrideSystemSizeKw || overrideNumberOfPanels || overrideMonthlySavingsRs) && (
                <Field label="Reason for Override *">
                  <Input
                    value={overrideReason}
                    onChange={e => setOverrideReason(e.target.value)}
                    placeholder="e.g. Client requested exact 25kW capacity for budget constraints"
                  />
                </Field>
              )}
            </div>
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex justify-between items-center pt-3 border-t border-slate-200">
          <span className="text-xs text-slate-500">
            Changes will update calculations, audit history, and regenerate the official PDF.
          </span>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={onClose} disabled={updateMutation.isPending}>
              Cancel
            </Button>
            <Button
              loading={updateMutation.isPending}
              onClick={() => updateMutation.mutate()}
            >
              Save Survey Changes
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  )
}
