import { useParams, useNavigate } from 'react-router-dom';
import { INK, MUTED } from '@/components/earnings/tokens';

// Placeholder for the Part-2 "Extract" screen. Exists so the setup screen's
// Continue navigates to a real route (no 404). Part 2 replaces this.
export default function EarningsExtractPage() {
  const { reportId } = useParams<{ reportId: string }>();
  const navigate = useNavigate();
  return (
    <div>
      <div style={{ marginBottom: 14 }}>
        <h1 style={{ fontSize: 20, fontWeight: 800, color: INK, margin: '0 0 4px' }}>
          Earnings — Extract
        </h1>
        <p style={{ margin: 0, fontSize: 12, color: MUTED }}>Report ID: {reportId}</p>
      </div>
      <div
        className="card"
        style={{ padding: '40px 22px', textAlign: 'center', color: MUTED, fontSize: 13 }}
      >
        The extract step is coming in Part 2.
        <div style={{ marginTop: 16 }}>
          <button className="btn bs" type="button" onClick={() => navigate('/earnings/setup')}>
            ← Back to setup
          </button>
        </div>
      </div>
    </div>
  );
}
