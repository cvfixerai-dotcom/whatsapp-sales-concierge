'use client';
import { useState, useEffect, useRef } from 'react';

const FLOW = [
  { sender: 'user', text: 'Hi, is the 3-bed villa in Dubai Marina still available?', delay: 0 },
  { sender: 'ai', text: 'Hello! Yes, it is — AED 3.2M. May I ask your name?', delay: 1500 },
  { sender: 'user', text: "I'm Sarah. Does it have a sea view?", delay: 2500 },
  { sender: 'ai', text: 'Nice to meet you, Sarah! 2,800 sq ft with direct sea view and private balcony. Want to schedule a viewing?', delay: 2000 },
  { sender: 'user', text: 'Yes, this weekend please.', delay: 2500 },
  { sender: 'ai', text: 'Saturday 10AM or 2PM, Sunday 11AM — which works?', delay: 1800 },
  { sender: 'user', text: 'Saturday 2 PM.', delay: 2000 },
  { sender: 'ai', text: "Booked! Saturday 2 PM confirmed. You'll get a reminder. See you there!", delay: 2000 },
];

export default function ChatDemo() {
  const [msgs, setMsgs] = useState<{id:number;text:string;sender:string}[]>([]);
  const [typing, setTyping] = useState(false);
  const [who, setWho] = useState('ai');
  const [step, setStep] = useState(0);
  const [on, setOn] = useState(false);
  const r = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!on || step >= FLOW.length) return;
    const s = FLOW[step];
    setTyping(true); setWho(s.sender);
    const t = setTimeout(() => {
      setTyping(false);
      setMsgs(p => [...p, { id: step, text: s.text, sender: s.sender }]);
      setStep(step + 1);
    }, s.delay || 1200);
    return () => clearTimeout(t);
  }, [on, step]);

  useEffect(() => { r.current?.scrollTo({ top: 9999, behavior: 'smooth' }); }, [msgs, typing]);

  return (
    <div className="w-full max-w-sm mx-auto shadow-2xl rounded-2xl overflow-hidden">
      <div className="bg-[#075E54] px-4 py-3 flex items-center gap-3">
        <div className="w-9 h-9 rounded-full bg-white/20 flex items-center justify-center text-white font-bold text-sm">AI</div>
        <div><p className="text-white font-semibold text-sm">SalesConcierge AI</p>
        <p className="text-green-200 text-xs">{typing && who==='ai' ? 'typing...' : 'online'}</p></div>
      </div>
      <div ref={r} className="bg-[#ECE5DD] h-72 overflow-y-auto p-3 space-y-2">
        {msgs.map(m => (
          <div key={m.id} className={`flex ${m.sender==='user'?'justify-end':'justify-start'}`}>
            <div className={`max-w-[80%] px-3 py-2 rounded-lg text-sm shadow ${m.sender==='user'?'bg-[#DCF8C6] text-gray-900':'bg-white text-gray-900'}`}>{m.text}</div>
          </div>
        ))}
        {typing && <div className={`flex ${who==='user'?'justify-end':'justify-start'}`}>
          <div className={`px-4 py-3 rounded-lg shadow ${who==='user'?'bg-[#DCF8C6]':'bg-white'}`}>
            <div className="flex gap-1">{[0,1,2].map(i=><span key={i} className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{animationDelay:`${i*150}ms`}}/>)}</div>
          </div>
        </div>}
      </div>
      <div className="bg-[#F0F0F0] px-4 py-3">
        {!on ? (
          <button onClick={()=>setOn(true)} className="w-full py-2 bg-[#25D366] text-white rounded-full font-semibold text-sm hover:bg-[#1da851] transition-colors">
            ▶ Watch AI Demo
          </button>
        ) : step >= FLOW.length ? (
          <a href="/auth/login" className="block w-full py-2 bg-indigo-600 text-white rounded-full font-semibold text-sm text-center hover:bg-indigo-700 transition-colors">
            Try It Live — Start Free Trial
          </a>
        ) : (
          <div className="text-center text-xs text-gray-500">Conversation in progress...</div>
        )}
      </div>
    </div>
  );
}
