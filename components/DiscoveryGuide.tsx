'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { ArrowRight, BookOpen } from 'lucide-react';

type Props = {
  items: { title: string; body: string }[];
  onOpen?: () => void;
  onOutcome: (result: 'completed' | 'skipped') => void;
};

export default function DiscoveryGuide({ items, onOpen, onOutcome }: Props) {
  const [step, setStep] = useState<number | null>(null);
  const guideId = useId();
  const start = useRef<HTMLButtonElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);

  const index = Math.min(step ?? 0, items.length - 1);
  const lesson = items[index];

  useEffect(() => {
    if (step !== null && lesson) heading.current?.focus({ preventScroll: true });
  }, [step, lesson]);

  function open(next: number) {
    setStep(next);

  }

  function close(outcome: 'completed' | 'skipped') {
    setStep(null);
    requestAnimationFrame(() => start.current?.focus({ preventScroll: true }));
    onOutcome(outcome);
  }

  return (
    <section aria-label="Beginner guide" className="discovery-guide">
      {step === null ? (
        <button type="button" className="button button-outline" aria-expanded={false}
          ref={start} onClick={() => { onOpen?.(); open(0); }}>
          <BookOpen size={16} aria-hidden="true" /> Beginner guide
        </button>
      ) : !lesson ? (
        <div><p role="status">Loading guide&hellip;</p><button type="button" className="text-link" onClick={() => close('skipped')}>Skip guide</button></div>
      ) : (
        <article aria-labelledby={guideId}>
          <p>Beginner guide &middot; {index + 1} of {items.length}</p>
          <h3 id={guideId} tabIndex={-1} ref={heading}>{lesson.title}</h3>
          <p>{lesson.body}</p>
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '.65rem' }}>
            {index > 0 && <button type="button" className="button button-outline"
              onClick={() => open(index - 1)}>Back</button>}
            <button type="button" className="button button-lime"
              onClick={() => index + 1 === items.length ? close('completed') : open(index + 1)}>
              {index + 1 === items.length ? 'Finish guide' : 'Next'} <ArrowRight size={15} aria-hidden="true" />
            </button>
            <button type="button" className="text-link" onClick={() => close('skipped')}>Skip guide</button>
          </div>
        </article>
      )}
    </section>
  );
}
