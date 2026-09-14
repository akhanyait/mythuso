/* A made-up voice, for designing the sphere's reaction to one. Development only.

   Imported solely from inside an `import.meta.env.DEV` block in features/Assistant.tsx, so a
   production build contains neither this module nor the switch that loads it; the report that
   landed this proves it by searching the built files. It reads no microphone and opens no audio
   context. It is arithmetic on the clock.

   The shape is speech rather than noise, because a sphere tuned against a sine wave reacts like a
   metronome. Phrases of about two and a quarter seconds are separated by silences of about a
   second. Inside a phrase, syllables arrive at a little over four a second, their rate wandering
   the way a speaker's does. Loudness rises and falls across the phrase, with a faster flutter on
   top, and each phrase fades in and out rather than switching. Everything is a function of the
   time it is given, so the same moment always produces the same level. */
const PHRASE = 3.4;
const SPOKEN = 2.3;

export function syntheticLevel(now: number): number {
 const t = now / 1000;
 const into = t % PHRASE;
 if (into > SPOKEN) return 0;
 const fadeIn = Math.min(1, into / 0.12);
 const fadeOut = Math.min(1, (SPOKEN - into) / 0.2);
 const syllable = Math.max(0, Math.sin(2 * Math.PI * 4.2 * t + Math.sin(2 * Math.PI * 0.7 * t) * 1.3));
 const stress = 0.55 + 0.3 * Math.sin(2 * Math.PI * 1.1 * t + 0.6) + 0.15 * Math.sin(2 * Math.PI * 7.9 * t);
 return Math.max(0, Math.min(1, Math.pow(syllable, 0.7) * stress * fadeIn * fadeOut));
}
