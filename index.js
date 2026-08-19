/**
 * SillyTavern extension entry point for IndexTTS (CosyVoice-compatible).
 * Registers a new TTS provider named "IndexTTS (CosyVoice)" with the built-in
 * TTS extension. Requires the "tts" extension to be present (it is built-in).
 */
import { registerTtsProvider } from '../tts/index.js';
import { IndexTTSCosyVoiceProvider } from './indextts-cosyvoice.js';

export function init() {
    registerTtsProvider('IndexTTS (CosyVoice)', IndexTTSCosyVoiceProvider);
}
