import React, { useState, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { HelpCircle } from 'lucide-react';

interface TooltipProps {
  text: string;
  className?: string;
}

export const Tooltip: React.FC<TooltipProps> = ({ text, className }) => {
  const [visible, setVisible] = useState(false);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const iconRef = useRef<HTMLSpanElement>(null);

  const show = useCallback(() => {
    if (!iconRef.current) return;
    const rect = iconRef.current.getBoundingClientRect();
    setPos({
      x: rect.left + rect.width / 2,
      y: rect.top,
    });
    setVisible(true);
  }, []);

  const hide = useCallback(() => setVisible(false), []);

  return (
    <>
      <span
        ref={iconRef}
        className={`inline-flex items-center cursor-help ${className ?? ''}`}
        onMouseEnter={show}
        onMouseLeave={hide}
      >
        <HelpCircle className="h-3 w-3 text-slate-400 dark:text-slate-500/50" />
      </span>
      {visible && createPortal(
        <div
          className="fixed z-[9999] pointer-events-none"
          style={{
            left: pos.x,
            top: pos.y,
            transform: 'translate(-50%, -100%)',
          }}
        >
          <div className="mb-2 px-3 py-2 rounded-lg text-[11px] leading-relaxed font-sans font-normal normal-case tracking-normal bg-slate-800 dark:bg-slate-700 text-white shadow-xl max-w-[240px] w-max animate-[fade-in_0.15s_ease-out]">
            {text}
            <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-slate-800 dark:border-t-slate-700" />
          </div>
        </div>,
        document.body
      )}
    </>
  );
};
