import { useEffect, useRef } from 'react';
import { Mic, MicOff } from 'lucide-react';
import { useVoiceAdapter } from '../lib/voice';

type Props = {
  onTranscript: (text: string) => void;
};

/** Explicit push-to-talk control. Captured text is emitted only after the browser closes
 * the microphone, so the composer never changes underneath a person who is still speaking. */
export function AssistantVoiceButton({ onTranscript }: Props) {
  const voice = useVoiceAdapter();
  const wasCapturing = useRef(false);

  useEffect(() => {
    const capturing = voice.state === 'starting' || voice.state === 'open';
    if (capturing) {
      wasCapturing.current = true;
      return;
    }
    if (wasCapturing.current && voice.state === 'off' && voice.transcript.trim()) {
      onTranscript(voice.transcript.trim());
    }
    wasCapturing.current = false;
  }, [voice.state, voice.transcript, onTranscript]);

  const listening = voice.state === 'starting' || voice.state === 'open';
  const label = listening ? 'Stop voice input' : 'Use voice input';

  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={listening}
      title={voice.failureSentence ?? label}
      onClick={listening ? voice.stop : voice.start}
      className="as-voice"
    >
      {listening ? <MicOff size={16} aria-hidden="true" /> : <Mic size={16} aria-hidden="true" />}
    </button>
  );
}
