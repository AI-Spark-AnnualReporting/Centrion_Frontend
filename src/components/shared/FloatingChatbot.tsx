import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

export function FloatingChatbot() {
  const navigate = useNavigate();

  const handleClick = () => {
    navigate('/ai');
  };

  return (
    <button className="bot-fab" onClick={handleClick}>
      <div className="bot-fab-ico">
        <svg viewBox="0 0 13 13" fill="none"><path d="M6.5 1C3.5 1 1 3.2 1 5.8c0 1.3.6 2.5 1.5 3.4L2 11l2.6-1.2c.6.2 1.2.3 1.9.3C9.5 10.1 12 7.9 12 5.3S9.5 1 6.5 1z" fill="white" /></svg>
      </div>
      <span className="bot-fab-lbl">Ask Centriyon</span>
      <div className="bot-fab-pulse" />
    </button>
  );
}
