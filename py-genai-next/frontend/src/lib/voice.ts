/**
 * B11 — voice in/out via the Web Speech API.
 *
 * Dictation (SpeechRecognition) requires a **secure context**, so on
 * `http://<LAN-IP>` it is unavailable and `dictationSupported()` returns false —
 * the mic button hides itself rather than failing silently. It works on
 * localhost today, and everywhere once TLS lands (backlog B15).
 *
 * Read-aloud (speechSynthesis) has no secure-context requirement.
 */

type SR = any;
const SRClass: SR =
  typeof window !== "undefined" ? (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition : undefined;

/** The browser ships the API at all (Chrome/Safari do; Firefox does not). */
export const dictationAvailable = () => !!SRClass;
/** …and we're in a secure context, without which it silently never fires. */
export const dictationSupported = () => !!SRClass && window.isSecureContext;
export const speechSupported = () => typeof window !== "undefined" && "speechSynthesis" in window;

/** Start dictation. Calls `onText` with the transcript so far; returns a stopper. */
export function startDictation(onText: (text: string, final: boolean) => void, onEnd?: () => void) {
  if (!SRClass) return () => {};
  const rec = new SRClass();
  rec.continuous = true;
  rec.interimResults = true;
  rec.lang = navigator.language || "en-US";
  rec.onresult = (e: any) => {
    let text = "";
    let final = false;
    for (let i = e.resultIndex; i < e.results.length; i++) {
      text += e.results[i][0].transcript;
      if (e.results[i].isFinal) final = true;
    }
    onText(text, final);
  };
  rec.onend = () => onEnd?.();
  rec.onerror = () => onEnd?.();
  try { rec.start(); } catch { /* already running */ }
  return () => { try { rec.stop(); } catch { /* not running */ } };
}

/** Speak text aloud; calling again cancels the previous utterance. */
export function speak(text: string, onEnd?: () => void) {
  if (!speechSupported()) return;
  window.speechSynthesis.cancel();
  // Strip code fences and markdown noise — reading punctuation aloud is grating.
  const clean = text
    .replace(/```[\s\S]*?```/g, " code block ")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/[*_#>|]/g, "")
    .slice(0, 4000);
  const u = new SpeechSynthesisUtterance(clean);
  u.lang = navigator.language || "en-US";
  u.onend = () => onEnd?.();
  u.onerror = () => onEnd?.();
  window.speechSynthesis.speak(u);
}

export function stopSpeaking() {
  if (speechSupported()) window.speechSynthesis.cancel();
}
