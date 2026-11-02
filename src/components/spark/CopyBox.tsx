// A long value (license key, unlock code, Server ID) shown once with a Copy
// button, so Spark staff can send it to the client without retyping it.

import { useState } from 'react';

export function CopyBox({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard blocked (e.g. not https): the value is still selectable below.
    }
  };

  return (
    <div style={{ marginTop: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: '#5A6080' }}>{label}</span>
        <button type="button" className="btn bs bsm" onClick={copy}>
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <textarea
        readOnly
        value={value}
        rows={value.length > 80 ? 4 : 1}
        onFocus={(e) => e.currentTarget.select()}
        className="inp"
        style={{ width: '100%', fontFamily: "'DM Mono', monospace", fontSize: 11, resize: 'vertical' }}
      />
    </div>
  );
}
