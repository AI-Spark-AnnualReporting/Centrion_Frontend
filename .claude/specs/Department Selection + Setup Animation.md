# Part 6 — Department Selection + Setup Animation
## Centriton Frontend Spec for Claude Code

---

### Scope

Add a new step to the onboarding flow where admin picks which default
departments to create. Pre-checked: all 10. Minimum required: 3.

After admin clicks "Complete Setup", show an engaging multi-stage loading
animation while the backend creates departments and generates LLM prompts
(takes 30-60 seconds for 10 departments).

---

### Flow

```
Existing onboarding form (company details)
    ↓
NEW: Department selection screen (10 cards, all pre-checked)
    ↓
NEW: Setup in progress animation (engaging multi-stage loader)
    ↓
Redirect to dashboard
```

---

### Changes

---

#### 1 — API additions in `src/lib/api.ts`

```ts
export const onboarding = {
  // Existing
  complete: (payload) => 
    request("/api/v1/auth/onboarding", { method: "POST", body: payload }),
  
  // NEW
  getDepartmentOptions: () =>
    request<{ departments: DepartmentOption[] }>(
      "/api/v1/auth/onboarding/department-options"
    ),
}
```

```ts
export interface DepartmentOption {
  code:        string
  name:        string
  description: string
  category:    "leadership" | "core" | "commercial" | "support"
}
```

---

#### 2 — Onboarding Flow Routing

**File:** `src/pages/onboarding/OnboardingPage.tsx`

Change from single-page form to multi-step flow:

```tsx
const [step, setStep] = useState<"details" | "departments" | "setup">("details")
const [formData, setFormData] = useState<OnboardingFormData>({})
const [selectedDeptCodes, setSelectedDeptCodes] = useState<string[]>([])

return (
  <div className="onboarding-container">
    {step === "details" && (
      <CompanyDetailsStep
        data={formData}
        onSubmit={(data) => {
          setFormData(data)
          setStep("departments")
        }}
      />
    )}
    
    {step === "departments" && (
      <DepartmentSelectionStep
        formData={formData}
        selectedCodes={selectedDeptCodes}
        onSelect={setSelectedDeptCodes}
        onBack={() => setStep("details")}
        onSubmit={() => setStep("setup")}
      />
    )}
    
    {step === "setup" && (
      <SetupInProgressAnimation
        formData={formData}
        selectedCodes={selectedDeptCodes}
      />
    )}
  </div>
)
```

---

#### 3 — Department Selection Step

**File:** `src/pages/onboarding/DepartmentSelectionStep.tsx` (new)

**Layout:**

```
┌─────────────────────────────────────────────────────────┐
│  ← Back                              Step 2 of 2        │
│                                                          │
│  Select Your Departments                                │
│  Choose which departments to set up. Each one gets its  │
│  own AI agent trained on your company context. You can  │
│  add more later.                                         │
│                                                          │
│  [10 / 10 selected]            [Select all] [Clear]    │
│                                                          │
│  ── LEADERSHIP ─────────────────────────────────────    │
│  [✓] Executive Management                                │
│      Strategic direction, governance, executive...      │
│                                                          │
│  ── CORE OPERATIONS ────────────────────────────────    │
│  [✓] Finance & Accounting   [✓] Human Resources         │
│  [✓] Legal & Compliance     [✓] Operations              │
│                                                          │
│  ── COMMERCIAL ─────────────────────────────────────    │
│  [✓] Sales                  [✓] Marketing               │
│                                                          │
│  ── SUPPORT ────────────────────────────────────────    │
│  [✓] Information Technology [✓] Customer Service        │
│  [✓] Procurement / Administration                       │
│                                                          │
│                                                          │
│  ℹ️  Minimum 3 departments required.                    │
│                                                          │
│                    [Back]    [Complete Setup →]         │
└─────────────────────────────────────────────────────────┘
```

**Implementation:**

```tsx
export const DepartmentSelectionStep: React.FC<Props> = ({
  formData, selectedCodes, onSelect, onBack, onSubmit
}) => {
  const [options, setOptions] = useState<DepartmentOption[]>([])
  const [loading, setLoading] = useState(true)
  
  useEffect(() => {
    onboarding.getDepartmentOptions()
      .then(data => {
        setOptions(data.departments)
        // Pre-select all 10 on first load
        if (selectedCodes.length === 0) {
          onSelect(data.departments.map(d => d.code))
        }
      })
      .finally(() => setLoading(false))
  }, [])
  
  const toggleDept = (code: string) => {
    onSelect(
      selectedCodes.includes(code)
        ? selectedCodes.filter(c => c !== code)
        : [...selectedCodes, code]
    )
  }
  
  const groupedByCategory = useMemo(() => {
    const groups: Record<string, DepartmentOption[]> = {
      leadership: [],
      core:       [],
      commercial: [],
      support:    [],
    }
    options.forEach(d => groups[d.category]?.push(d))
    return groups
  }, [options])
  
  const canSubmit = selectedCodes.length >= 3
  
  return (
    <div className="card onboarding-step">
      {/* Header with step indicator */}
      <div className="step-header">
        <button onClick={onBack} className="back-btn">← Back</button>
        <span className="step-indicator">Step 2 of 2</span>
      </div>
      
      <h1>Select Your Departments</h1>
      <p className="subtitle">
        Choose which departments to set up. Each one gets its own AI
        agent trained on your company context. You can add more later.
      </p>
      
      <div className="selection-summary">
        <span className="count">
          {selectedCodes.length} / {options.length} selected
        </span>
        <div className="actions">
          <button onClick={() => onSelect(options.map(d => d.code))}>
            Select all
          </button>
          <button onClick={() => onSelect([])}>
            Clear
          </button>
        </div>
      </div>
      
      {/* Department groups */}
      <DepartmentGroup
        title="LEADERSHIP"
        depts={groupedByCategory.leadership}
        selectedCodes={selectedCodes}
        onToggle={toggleDept}
        fullWidth
      />
      <DepartmentGroup
        title="CORE OPERATIONS"
        depts={groupedByCategory.core}
        selectedCodes={selectedCodes}
        onToggle={toggleDept}
      />
      <DepartmentGroup
        title="COMMERCIAL"
        depts={groupedByCategory.commercial}
        selectedCodes={selectedCodes}
        onToggle={toggleDept}
      />
      <DepartmentGroup
        title="SUPPORT"
        depts={groupedByCategory.support}
        selectedCodes={selectedCodes}
        onToggle={toggleDept}
      />
      
      <div className="validation-note">
        ℹ️ Minimum 3 departments required.
      </div>
      
      <div className="form-footer">
        <button onClick={onBack} className="btn bs">
          Back
        </button>
        <button
          onClick={onSubmit}
          className="btn bp"
          disabled={!canSubmit}
        >
          Complete Setup →
        </button>
      </div>
    </div>
  )
}
```

**Department card component:**

```tsx
const DepartmentCard: React.FC<{
  dept: DepartmentOption
  selected: boolean
  onToggle: () => void
}> = ({ dept, selected, onToggle }) => (
  <div
    className={`dept-card ${selected ? "selected" : ""}`}
    onClick={onToggle}
  >
    <div className="checkbox-wrapper">
      <input
        type="checkbox"
        checked={selected}
        onChange={() => {}}
        className="dept-checkbox"
      />
    </div>
    <div className="dept-info">
      <div className="dept-code">{dept.code}</div>
      <div className="dept-name">{dept.name}</div>
      <div className="dept-description">{dept.description}</div>
    </div>
  </div>
)
```

**CSS for cards (in `index.css`):**

```css
.dept-card {
  display: flex;
  gap: 12px;
  padding: 16px;
  border: 2px solid #E2E4F0;
  border-radius: 10px;
  cursor: pointer;
  transition: all 0.15s ease;
  background: #FFFFFF;
}

.dept-card:hover {
  border-color: #4040C8;
  background: #FAFAFE;
}

.dept-card.selected {
  border-color: #4040C8;
  background: #F0F1FF;
}

.dept-card .dept-code {
  font-size: 11px;
  font-weight: 600;
  color: #4040C8;
  background: #E5E7FF;
  padding: 2px 6px;
  border-radius: 4px;
  display: inline-block;
  margin-bottom: 6px;
}

.dept-card .dept-name {
  font-size: 14px;
  font-weight: 600;
  color: #1A1D2E;
  margin-bottom: 4px;
}

.dept-card .dept-description {
  font-size: 12px;
  color: #5A6080;
  line-height: 1.5;
}
```

---

#### 4 — Setup In Progress Animation

**File:** `src/pages/onboarding/SetupInProgressAnimation.tsx` (new)

The star of this spec. Engaging multi-stage loader that holds attention
during the 30-60 second backend processing. Uses progressive disclosure —
each stage feels like real work is happening.

**Stages (synthetic, displayed sequentially):**

```
Stage 1 (3s) — "Setting up your company workspace..."
Stage 2 (5s) — "Configuring your reporting frameworks..."
Stage 3 (8s) — "Creating AI agents for {N} departments..."
Stage 4 (variable) — "Training {currentDept} agent on company context..."
                     (cycles through each selected dept name)
Stage 5 (3s) — "Finalizing your dashboard..."
Stage 6 — Complete
```

**Layout:**

```
┌─────────────────────────────────────────────────────────┐
│                                                          │
│                                                          │
│              [Animated checkmark/loader]                 │
│                                                          │
│         Setting up your AI-powered platform              │
│                                                          │
│   ┌───────────────────────────────────────────────┐    │
│   │  ✓ Workspace created                          │    │
│   │  ✓ Reporting frameworks configured            │    │
│   │  ⊙ Creating Finance & Accounting agent...     │    │
│   │  ○ Pending: 4 more departments                │    │
│   │  ○ Finalizing dashboard                       │    │
│   └───────────────────────────────────────────────┘    │
│                                                          │
│              [Progress bar — 47% complete]               │
│                                                          │
│   💡 Did you know? Your agents will use GRI, IFRS,     │
│      and SAMA frameworks to generate questions          │
│      tailored to your sector.                            │
│                                                          │
└─────────────────────────────────────────────────────────┘
```

**Implementation:**

```tsx
interface Props {
  formData: OnboardingFormData
  selectedCodes: string[]
}

const STAGE_DEFINITIONS = [
  { id: "workspace",  label: "Setting up your company workspace",       duration: 3000 },
  { id: "frameworks", label: "Configuring your reporting frameworks",   duration: 5000 },
  { id: "agents",     label: "Creating AI agents for your departments", duration: 8000 },
  // dept-specific stages added dynamically
  { id: "finalize",   label: "Finalizing your dashboard",               duration: 3000 },
]

const TIPS = [
  "Your agents will use GRI, IFRS, and SAMA frameworks to generate questions tailored to your sector.",
  "Each department gets its own AI agent trained on your company's context.",
  "Annual reporting cycles can be activated once your team is set up.",
  "ESG metrics and financial KPIs are automatically tracked across reports.",
  "You can invite team members and assign them to departments anytime.",
]

export const SetupInProgressAnimation: React.FC<Props> = ({
  formData, selectedCodes
}) => {
  const [stages, setStages]               = useState<StageState[]>([])
  const [currentStageIdx, setCurrentIdx]  = useState(0)
  const [progress, setProgress]           = useState(0)
  const [currentTip, setCurrentTip]       = useState(0)
  const [apiComplete, setApiComplete]     = useState(false)
  const [apiError, setApiError]           = useState<string | null>(null)
  const navigate = useNavigate()
  const { refreshUser } = useAuth()
  
  // Build dynamic stages including one per selected department
  const allStages = useMemo(() => {
    const result: { id: string; label: string; duration: number }[] = [
      STAGE_DEFINITIONS[0],
      STAGE_DEFINITIONS[1],
      STAGE_DEFINITIONS[2],
    ]
    
    selectedCodes.forEach(code => {
      result.push({
        id: `dept-${code}`,
        label: `Training ${getDeptName(code)} agent on company context`,
        duration: 2500,
      })
    })
    
    result.push(STAGE_DEFINITIONS[3])  // finalize
    return result
  }, [selectedCodes])
  
  // Fire the actual API call
  useEffect(() => {
    onboarding.complete({
      ...formData,
      selected_department_codes: selectedCodes,
    })
      .then(() => setApiComplete(true))
      .catch(err => setApiError(err.message ?? "Setup failed"))
  }, [])
  
  // Stage progression
  useEffect(() => {
    if (apiError) return
    
    let cancelled = false
    let stageStart = Date.now()
    
    const tick = () => {
      if (cancelled) return
      
      const stage = allStages[currentStageIdx]
      const elapsed = Date.now() - stageStart
      const stageProgress = Math.min(elapsed / stage.duration, 1)
      const overallProgress = (currentStageIdx + stageProgress) / allStages.length
      setProgress(overallProgress * 100)
      
      if (stageProgress >= 1) {
        // If API not done and this is the last stage, hold here
        if (currentStageIdx === allStages.length - 1 && !apiComplete) {
          return // wait for API
        }
        
        if (currentStageIdx < allStages.length - 1) {
          setCurrentIdx(idx => idx + 1)
          stageStart = Date.now()
        }
      }
      
      requestAnimationFrame(tick)
    }
    
    requestAnimationFrame(tick)
    return () => { cancelled = true }
  }, [currentStageIdx, apiComplete, apiError])
  
  // Rotate tips every 8s
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTip(t => (t + 1) % TIPS.length)
    }, 8000)
    return () => clearInterval(interval)
  }, [])
  
  // Once API completes AND all stages shown, navigate
  useEffect(() => {
    if (apiComplete && currentStageIdx === allStages.length - 1 && progress >= 99) {
      setTimeout(async () => {
        await refreshUser()  // gets fresh JWT with onboarding_completed=true
        navigate("/dashboard", { replace: true })
      }, 1500)
    }
  }, [apiComplete, currentStageIdx, progress])
  
  if (apiError) {
    return (
      <div className="setup-error">
        <h2>Setup encountered an issue</h2>
        <p>{apiError}</p>
        <button onClick={() => window.location.reload()}>
          Try again
        </button>
      </div>
    )
  }
  
  return (
    <div className="setup-animation">
      <AnimatedLoader />
      
      <h1>Setting up your AI-powered platform</h1>
      
      <div className="stages-list">
        {allStages.map((stage, idx) => (
          <StageRow
            key={stage.id}
            label={stage.label}
            status={
              idx < currentStageIdx ? "complete" :
              idx === currentStageIdx ? "active" :
              "pending"
            }
          />
        ))}
      </div>
      
      <div className="progress-bar-wrapper">
        <div 
          className="progress-bar" 
          style={{ width: `${progress}%` }}
        />
        <span className="progress-text">{Math.round(progress)}% complete</span>
      </div>
      
      <div className="tip-card">
        <span className="tip-icon">💡</span>
        <span className="tip-text">Did you know? {TIPS[currentTip]}</span>
      </div>
    </div>
  )
}
```

**Animated loader component:**

```tsx
const AnimatedLoader: React.FC = () => (
  <div className="animated-loader">
    <svg width="80" height="80" viewBox="0 0 80 80">
      <circle 
        cx="40" cy="40" r="35"
        fill="none"
        stroke="#E2E4F0"
        strokeWidth="4"
      />
      <circle 
        cx="40" cy="40" r="35"
        fill="none"
        stroke="#4040C8"
        strokeWidth="4"
        strokeLinecap="round"
        strokeDasharray="55 220"
        transform="rotate(-90 40 40)"
      >
        <animateTransform
          attributeName="transform"
          type="rotate"
          from="-90 40 40"
          to="270 40 40"
          dur="1.5s"
          repeatCount="indefinite"
        />
      </circle>
      <text 
        x="40" y="48" 
        textAnchor="middle" 
        fontSize="24" 
        fontWeight="600" 
        fill="#4040C8"
      >
        AI
      </text>
    </svg>
  </div>
)
```

**Stage row component:**

```tsx
const StageRow: React.FC<{
  label: string
  status: "complete" | "active" | "pending"
}> = ({ label, status }) => (
  <div className={`stage-row ${status}`}>
    <span className="stage-icon">
      {status === "complete" && "✓"}
      {status === "active" && <span className="dot-pulse">⊙</span>}
      {status === "pending" && "○"}
    </span>
    <span className="stage-label">
      {label}
      {status === "active" && "..."}
    </span>
  </div>
)
```

**CSS for animation (in `index.css`):**

```css
.setup-animation {
  max-width: 540px;
  margin: 80px auto;
  text-align: center;
  padding: 40px;
}

.setup-animation h1 {
  font-size: 24px;
  font-weight: 700;
  margin: 24px 0 32px;
  color: #1A1D2E;
}

.stages-list {
  background: #F5F6FA;
  border-radius: 12px;
  padding: 20px 24px;
  margin: 24px 0;
  text-align: left;
}

.stage-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 0;
  font-size: 14px;
  transition: all 0.3s ease;
}

.stage-row.pending {
  color: #9BA3C4;
}

.stage-row.active {
  color: #1A1D2E;
  font-weight: 500;
}

.stage-row.complete {
  color: #10B981;
}

.stage-icon {
  width: 20px;
  height: 20px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-weight: 600;
}

.dot-pulse {
  animation: pulse 1.2s ease-in-out infinite;
}

@keyframes pulse {
  0%, 100% { opacity: 0.4; transform: scale(0.95); }
  50%      { opacity: 1;   transform: scale(1.1); }
}

.progress-bar-wrapper {
  position: relative;
  height: 8px;
  background: #E2E4F0;
  border-radius: 8px;
  overflow: hidden;
  margin: 24px 0 16px;
}

.progress-bar {
  height: 100%;
  background: linear-gradient(90deg, #4040C8, #5BC9E2);
  transition: width 0.3s ease;
  border-radius: 8px;
}

.progress-text {
  position: absolute;
  top: 16px;
  right: 0;
  font-size: 12px;
  color: #5A6080;
}

.tip-card {
  margin-top: 32px;
  padding: 16px 20px;
  background: #FAFAFE;
  border: 1px solid #E5E7FF;
  border-radius: 10px;
  display: flex;
  gap: 12px;
  text-align: left;
  font-size: 13px;
  color: #5A6080;
  line-height: 1.5;
  animation: fadeIn 0.5s ease;
}

@keyframes fadeIn {
  from { opacity: 0; transform: translateY(8px); }
  to   { opacity: 1; transform: translateY(0); }
}
```

---

### Done Criteria

1. Onboarding now has 2 steps: Company Details → Department Selection
2. Department selection screen fetches options from `GET /auth/onboarding/department-options`
3. All 10 departments are pre-checked on initial load
4. Cards are grouped by category (Leadership / Core / Commercial / Support)
5. Toggle a card to add/remove from selection
6. "Select all" and "Clear" buttons work
7. Submit button is disabled when fewer than 3 departments selected
8. Minimum 3 validation note shown below the grid
9. Clicking "Complete Setup" fires API call AND transitions to animation screen
10. Animation shows synthetic stages with progress bar
11. Each selected department gets its own training stage
12. Tips rotate every 8 seconds
13. Animated AI loader rotates continuously
14. When API completes and stages finish, redirect to /dashboard after brief delay
15. If API fails, show error state with retry button
16. Fresh JWT with `onboarding_completed=true` is loaded before dashboard redirect