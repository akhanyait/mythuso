import { useState } from 'react';
import { Mic, MicOff } from 'lucide-react';
import { startVoiceCapture } from '../lib/voice';

type Props = {
  onTranscript: (text: string) => void;
};

export function AssistantVoiceButton({ onTranscript }: Props) {
  const [state, setState] = useState<'idle' | 'listening' | 'error'>('idle');

  const handleClick = () => {
    const result = startVoiceCapture(
      (transcript) => {
        onTranscript(transcript);
        setState('idle');
      },
      (reason) => {
        console.warn(reason);
        setState('error');
      }
    );

    if (result) {
      setState('listening');
    }
  };

  return (
    <button
      type="button"
      aria-label="Use voice input"
      onClick={handleClick}
      disabled={state === 'listening'}
      className="as-voice"
    >
      {state === 'listening' ? <MicOff size={16} /> : <Mic size={16} />}
    </button>
  );
}
