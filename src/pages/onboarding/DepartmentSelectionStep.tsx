import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { ChevronDown, KeyRound } from 'lucide-react';
import { Spinner } from '@/components/shared/Spinner';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Switch } from '@/components/ui/switch';
import { auth, sparkInternal, type SparkLeadEmail } from '@/lib/api';
import { colorFor } from '@/lib/departmentColors';
import { SPARK_TEMP_PASSWORD } from '@/lib/sparkLogins';
import type { DepartmentCategory, DepartmentOption } from '@/types/auth';

const PRIMARY = '#4040C8';
const MIN_REQUIRED = 3;

// The grid is shorter while the lead-logins card shows, so the step keeps the
// same total height and the wizard never gets a second scrollbar (ui.md §2).
const GRID_MAX_HEIGHT = 340;
const GRID_MAX_HEIGHT_WITH_LEADS_CARD = 288;

/**
 * Spark-only "Create department lead logins" choice on this step.
 * Left undefined for every other role, so their screen is exactly today's.
 */
export interface LeadLoginsOption {
  enabled: boolean;
  onChange: (enabled: boolean) => void;
  // The company being set up, captured once when the wizard opened.
  companyId: string;
}

/** A selected department as the popover needs it: the code for the badge, the
 *  name for the email (`<department name>-<company name>@hod.com`). */
interface SelectedDepartment {
  code: string;
  name: string;
}

/** One department code as a small coloured badge (the same look as the cards). */
function DepartmentCodeBadge({ code }: { code: string }) {
  const c = colorFor(code);
  return (
    <span
      style={{
        display: 'inline-block',
        minWidth: 44,
        textAlign: 'center',
        flexShrink: 0,
        fontSize: 10.5,
        fontWeight: 800,
        fontFamily: "'DM Mono', monospace",
        letterSpacing: '.5px',
        color: c,
        background: `${c}1A`,
        padding: '3px 8px',
        borderRadius: 5,
      }}
    >
      {code}
    </span>
  );
}

type LeadEmailsState =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; emails: SparkLeadEmail[] };

/**
 * The "View N logins" popover. It asks the server for the emails each time it
 * opens, so the preview is exactly what the server will create.
 */
function LeadEmailsPopover({
  companyId,
  selectedDepartments,
}: {
  companyId: string;
  selectedDepartments: SelectedDepartment[];
}) {
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<LeadEmailsState>({ status: 'loading' });
  // Counts requests so a slow answer for an old selection can't overwrite a newer one.
  const requestNumberRef = useRef(0);

  const count = selectedDepartments.length;

  // The server answers by name; the badge shows the code.
  const codeByName = new Map<string, string>();
  for (const department of selectedDepartments) {
    codeByName.set(department.name.trim(), department.code);
  }

  /** Fetch the preview emails for the currently selected departments. */
  const loadEmails = () => {
    requestNumberRef.current += 1;
    const thisRequest = requestNumberRef.current;
    setState({ status: 'loading' });
    sparkInternal
      .leadEmails(companyId, selectedDepartments.map((department) => department.name))
      .then((data) => {
        if (thisRequest !== requestNumberRef.current) return;
        setState({ status: 'ready', emails: data.emails ?? [] });
      })
      .catch(() => {
        if (thisRequest !== requestNumberRef.current) return;
        setState({ status: 'error' });
      });
  };

  /** Open or close the popover; opening always reloads the list. */
  const handleOpenChange = (nextOpen: boolean) => {
    setOpen(nextOpen);
    if (nextOpen) loadEmails();
  };

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={`View ${count} lead logins`}
          style={{
            marginLeft: 'auto',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 4,
            background: 'transparent',
            border: 'none',
            cursor: 'pointer',
            color: PRIMARY,
            fontSize: 12,
            fontWeight: 700,
            padding: 0,
            whiteSpace: 'nowrap',
          }}
        >
          View {count} logins
          <ChevronDown
            size={10}
            strokeWidth={3}
            aria-hidden="true"
            style={{ transition: 'transform .15s', transform: open ? 'rotate(180deg)' : 'none' }}
          />
        </button>
      </PopoverTrigger>
      {/* z-[10002]: the wizard is position:fixed at z-index 100, and the
          default z-50 would put this popover behind it (ui.md §0.1). */}
      <PopoverContent
        data-testid="leads-popover"
        align="end"
        side="bottom"
        sideOffset={6}
        collisionPadding={12}
        className="z-[10002] w-[340px] p-0 rounded-[12px] border-[#E2E4F0] bg-white shadow-[0_18px_48px_rgba(26,29,46,.18)] motion-reduce:animate-none"
      >
        <div
          style={{
            padding: '10px 14px',
            borderBottom: '1px solid #F1F2F6',
            fontSize: 11,
            fontWeight: 800,
            textTransform: 'uppercase',
            letterSpacing: '.6px',
            color: '#1A1D2E',
          }}
        >
          {count} lead logins
        </div>

        {state.status === 'loading' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '14px', fontSize: 12, color: '#5A6080' }}>
            <span style={{ width: 14, flexShrink: 0 }}><Spinner size={14} pad={0} /></span> Loading emails…
          </div>
        )}

        {state.status === 'error' && (
          <div style={{ padding: '12px 14px', fontSize: 12, color: '#DC2626', fontWeight: 600 }}>
            Couldn't load the emails.{' '}
            <button
              type="button"
              onClick={loadEmails}
              style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: PRIMARY, fontSize: 12, fontWeight: 700, padding: 0 }}
            >
              Retry
            </button>
          </div>
        )}

        {state.status === 'ready' && (
          <div role="list" tabIndex={0} style={{ maxHeight: 240, overflowY: 'auto', padding: '4px 0', outline: 'none' }}>
            {state.emails.map((item) => (
              <div
                role="listitem"
                key={item.email}
                style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '6px 14px' }}
              >
                <DepartmentCodeBadge
                  code={codeByName.get(item.department_name ?? '') ?? item.department_code ?? ''}
                />
                <span
                  title={item.email}
                  style={{
                    fontFamily: "'DM Mono', monospace",
                    fontSize: 11.5,
                    color: '#1A1D2E',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    minWidth: 0,
                  }}
                >
                  {item.email}
                </span>
              </div>
            ))}
          </div>
        )}

        <div style={{ padding: '10px 14px', borderTop: '1px solid #F1F2F6', fontSize: 11, color: '#5A6080', lineHeight: 1.5 }}>
          <div>
            Temporary password:{' '}
            <span style={{ fontFamily: "'DM Mono', monospace", fontWeight: 700, color: '#1A1D2E' }}>
              {SPARK_TEMP_PASSWORD}
            </span>
          </div>
          <div>If an address is already used, a number is added.</div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

/** The one-line Spark card: key icon, title, subtitle, "View N logins" and the switch. */
function LeadLoginsCard({
  option,
  selectedDepartments,
}: {
  option: LeadLoginsOption;
  selectedDepartments: SelectedDepartment[];
}) {
  const subtitleId = useId();
  const showViewLink = option.enabled && selectedDepartments.length > 0;

  return (
    <div
      data-testid="leads-card"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '8px 12px',
        border: `1px solid ${option.enabled ? '#C7CBF0' : '#E8EAF3'}`,
        borderRadius: 12,
        background: option.enabled ? '#F4F5FF' : '#FAFBFE',
        margin: '0 0 12px',
        transition: 'border-color .15s, background .15s',
      }}
    >
      <span
        style={{
          width: 24,
          height: 24,
          borderRadius: 7,
          background: '#EEEEFF',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}
      >
        <KeyRound size={13} color={PRIMARY} aria-hidden="true" />
      </span>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 12.5, fontWeight: 700, color: '#1A1D2E', lineHeight: 1.3 }}>
          Create department lead logins
        </div>
        <div id={subtitleId} style={{ fontSize: 11, color: '#9BA3C4', lineHeight: 1.3 }}>
          One login per selected department
        </div>
      </div>
      {showViewLink && (
        <LeadEmailsPopover
          companyId={option.companyId}
          selectedDepartments={selectedDepartments}
        />
      )}
      <Switch
        checked={option.enabled}
        onCheckedChange={option.onChange}
        aria-label="Create department lead logins"
        aria-describedby={subtitleId}
        className="data-[state=checked]:bg-[#4040C8] data-[state=unchecked]:bg-[#D8DBEA]"
        // With no link beside it, the switch pushes itself to the right end.
        style={{ marginLeft: showViewLink ? 0 : 'auto' }}
      />
    </div>
  );
}

const CATEGORY_ORDER: { key: DepartmentCategory; label: string; fullWidth?: boolean }[] = [
  { key: 'leadership', label: 'Leadership', fullWidth: true },
  { key: 'core', label: 'Core Operations' },
  { key: 'commercial', label: 'Commercial' },
  { key: 'support', label: 'Support' },
];

function DepartmentCard({
  dept,
  selected,
  onToggle,
}: {
  dept: DepartmentOption;
  selected: boolean;
  onToggle: () => void;
}) {
  const c = colorFor(dept.code);
  return (
    <button
      type="button"
      onClick={onToggle}
      style={{
        position: 'relative',
        display: 'block',
        padding: '16px 18px',
        border: `1.5px solid ${selected ? c : '#E8EAF3'}`,
        borderRadius: 12,
        background: selected ? `${c}0D` : '#fff',
        cursor: 'pointer',
        textAlign: 'left',
        width: '100%',
        transition: 'border-color .15s, background .15s',
      }}
    >
      {/* check circle, top-right */}
      <span
        style={{
          position: 'absolute',
          top: 14,
          right: 14,
          width: 22,
          height: 22,
          borderRadius: '50%',
          flexShrink: 0,
          border: selected ? 'none' : '1.5px solid #D2D6E6',
          background: selected ? c : '#fff',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {selected && (
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <path d="M2.5 6.2l2.2 2.2L9.5 3.6" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </span>

      <span
        style={{
          display: 'inline-block',
          fontSize: 10.5,
          fontWeight: 800,
          fontFamily: "'DM Mono', monospace",
          letterSpacing: '.5px',
          color: c,
          background: `${c}1A`,
          padding: '3px 8px',
          borderRadius: 5,
          marginBottom: 10,
        }}
      >
        {dept.code}
      </span>
      <span style={{ display: 'block', fontSize: 15, fontWeight: 800, color: '#1A1D2E', paddingRight: 28 }}>
        {dept.name}
      </span>
      <span style={{ display: 'block', fontSize: 12.5, color: '#5A6080', lineHeight: 1.5, marginTop: 4 }}>
        {dept.description}
      </span>
    </button>
  );
}

export default function DepartmentSelectionStep({
  selectedCodes,
  onSelect,
  onBack,
  onSubmit,
  onOptionsLoaded,
  leadLogins,
}: {
  selectedCodes: string[];
  onSelect: (codes: string[]) => void;
  onBack: () => void;
  onSubmit: () => void;
  onOptionsLoaded: (options: DepartmentOption[]) => void;
  // Spark staff only. Undefined for everyone else, who get today's screen.
  leadLogins?: LeadLoginsOption;
}) {
  const [options, setOptions] = useState<DepartmentOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    setError(null);
    auth
      .onboardingDepartmentOptions()
      .then((data) => {
        const opts = data.departments ?? [];
        setOptions(opts);
        onOptionsLoaded(opts);
        if (selectedCodes.length === 0) onSelect(opts.map((d) => d.code));
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load departments.'))
      .finally(() => setLoading(false));
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(load, []);

  const grouped = useMemo(() => {
    const g: Record<DepartmentCategory, DepartmentOption[]> = {
      leadership: [], core: [], commercial: [], support: [],
    };
    options.forEach((d) => g[d.category]?.push(d));
    return g;
  }, [options]);

  const toggle = (code: string) =>
    onSelect(
      selectedCodes.includes(code)
        ? selectedCodes.filter((c) => c !== code)
        : [...selectedCodes, code],
    );

  const canSubmit = selectedCodes.length >= MIN_REQUIRED;
  const showLeadsCard = leadLogins !== undefined;

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
        <h2 style={{ marginBottom: 4 }}>Select Your Departments</h2>
        {!loading && !error && (
          <div style={{ display: 'flex', gap: 14, paddingTop: 6 }}>
            <button type="button" onClick={() => onSelect(options.map((d) => d.code))}
              style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: PRIMARY, fontSize: 12.5, fontWeight: 700, padding: 0 }}>
              Select all
            </button>
            <span style={{ color: '#C9CDE4' }}>·</span>
            <button type="button" onClick={() => onSelect([])}
              style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: PRIMARY, fontSize: 12.5, fontWeight: 700, padding: 0 }}>
              Clear
            </button>
          </div>
        )}
      </div>
      <p>Each gets its own AI agent trained on your context. Add more later.</p>

      {loading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 8 }}>
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="skel" style={{ height: 92, borderRadius: 12 }} />
          ))}
        </div>
      ) : error ? (
        <div style={{ marginTop: 8, textAlign: 'center', padding: '24px 12px' }}>
          <div style={{ fontSize: 12, color: '#DC2626', fontWeight: 600, marginBottom: 10 }}>{error}</div>
          <button type="button" className="btn bs" onClick={load}>Retry</button>
        </div>
      ) : (
        <>
          <div style={{ fontSize: 13, fontWeight: 700, color: PRIMARY, margin: showLeadsCard ? '2px 0 10px' : '2px 0 14px' }}>
            {selectedCodes.length} / {options.length} selected
          </div>

          {leadLogins && (
            <LeadLoginsCard
              option={leadLogins}
              selectedDepartments={options
                .filter((d) => selectedCodes.includes(d.code))
                .map((d) => ({ code: d.code, name: d.name }))}
            />
          )}

          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 18,
              maxHeight: showLeadsCard ? GRID_MAX_HEIGHT_WITH_LEADS_CARD : GRID_MAX_HEIGHT,
              overflowY: 'auto',
              paddingRight: 6,
            }}
          >
            {CATEGORY_ORDER.map(({ key, label, fullWidth }) => {
              const depts = grouped[key];
              if (!depts || depts.length === 0) return null;
              return (
                <div key={key}>
                  <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '.7px', textTransform: 'uppercase', color: '#9BA3C4', marginBottom: 9 }}>
                    {label}
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: fullWidth ? '1fr' : 'repeat(2, 1fr)', gap: 12 }}>
                    {depts.map((d) => (
                      <DepartmentCard key={d.code} dept={d} selected={selectedCodes.includes(d.code)} onToggle={() => toggle(d.code)} />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>

          <div style={{ fontSize: 11.5, color: canSubmit ? '#9BA3C4' : '#B45309', marginTop: 14, fontWeight: 600 }}>
            ℹ️ Minimum {MIN_REQUIRED} departments required.
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginTop: 18 }}>
            <button type="button" className="btn bs" onClick={onBack}>Back</button>
            <button type="button" className="btn bp" onClick={onSubmit} disabled={!canSubmit}>Continue →</button>
          </div>
        </>
      )}
    </>
  );
}
