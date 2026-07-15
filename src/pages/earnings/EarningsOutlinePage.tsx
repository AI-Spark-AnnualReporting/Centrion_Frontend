import { useParams, useNavigate } from 'react-router-dom';
import { INK, MUTED } from '@/components/earnings/tokens';

// Placeholder for the Part-3 "Outline" screen. Exists so the extract screen's
// Continue navigates to a real route (no 404). Part 3 replaces this.
export default function EarningsOutlinePage() {
  const { reportId } = useParams<{ reportId: string }>();
  const navigate = useNavigate();
  return (
    <div>
      <div style={{ marginBottom: 14 }}>
        <h1 style={{ fontSize: 20, fontWeight: 800, color: INK, margin: '0 0 4px' }}>
          Earnings — Outline
        </h1>
        <p style={{ margin: 0, fontSize: 12, color: MUTED }}>Report ID: {reportId}</p>
      </div>
      <div className="card" style={{ padding: '40px 22px', textAlign: 'center', color: MUTED, fontSize: 13 }}>
        The outline step is coming in Part 3.
        <div style={{ marginTop: 16 }}>
          <button className="btn bs" type="button" onClick={() => navigate(`/earnings/${reportId}/extract`)}>
            ← Back to extract
          </button>
        </div>
      </div>
    </div>
  );
}
