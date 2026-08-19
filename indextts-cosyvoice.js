import { saveTtsProviderSettings } from '../tts/index.js';

export { IndexTTSCosyVoiceProvider };

/**
 * IndexTTS provider that speaks the CosyVoice-compatible API:
 *   GET  <endpoint>/speakers  -> [{name, voice_id}]
 *   POST <endpoint>/          -> audio/wav   body {text, speaker, emotion?}
 *
 * Emotion: append a "_<emotion>" suffix to the message text (e.g. "你好_開心")
 * and it will be stripped and sent as the `emotion` field, mapping to an
 * emotion reference wav named  emo_<emotion>.wav  on the server.
 */
class IndexTTSCosyVoiceProvider {
    //########//
    // Config //
    //########//

    settings;
    ready = false;
    voices = [];
    separator = '. ';
    audioElement = document.createElement('audio');

    processText(text) {
        return text;
    }

    audioFormats = ['wav', 'ogg', 'silk', 'mp3', 'flac'];

    languageLabels = {
        'Auto': 'auto',
    };

    langKey2LangCode = {
        'zh': 'zh-CN',
        'en': 'en-US',
        'ja': 'ja-JP',
        'ko': 'ko-KR',
    };

    modelTypes = {
        IndexTTS: 'IndexTTS',
    };

    defaultSettings = {
        provider_endpoint: 'http://localhost:8080',
        format: 'wav',
        lang: 'auto',
        streaming: false,
    };

    get settingsHtml() {
        let html = `
        <label for="tts_indextts_endpoint">IndexTTS (CosyVoice) Endpoint:</label>
        <input id="tts_indextts_endpoint" type="text" class="text_pole" maxlength="250" value="${this.defaultSettings.provider_endpoint}"/>
        <span>Point to a server exposing the CosyVoice API (GET /speakers, POST /).</span><br/>
        <span>Emotion: type a message ending in <code>_情感名</code> (e.g. <code>你好_開心</code>) to use an emotion reference <code>emo_情感名.wav</code>.</span><br/>
        <br/>
        `;
        return html;
    }

    onSettingsChange() {
        this.settings.provider_endpoint = $('#tts_indextts_endpoint').val();
        saveTtsProviderSettings();
        this.changeTTSSettings();
    }

    async loadSettings(settings) {
        if (Object.keys(settings).length == 0) {
            console.info('Using default IndexTTS (CosyVoice) provider settings');
        }
        // Only accept keys defined in defaultSettings
        this.settings = { ...this.defaultSettings };
        for (const key in settings) {
            if (key in this.settings) {
                this.settings[key] = settings[key];
            } else {
                console.debug(`Ignoring non-user-configurable setting: ${key}`);
            }
        }

        $('#tts_indextts_endpoint')
            .val(this.settings.provider_endpoint)
            .on('change', this.onSettingsChange.bind(this));

        await this.checkReady();
        console.info('IndexTTS (CosyVoice): Settings loaded');
    }

    async checkReady() {
        await Promise.allSettled([this.fetchTtsVoiceObjects(), this.changeTTSSettings()]);
    }

    async onRefreshClick() {
        return await this.checkReady();
    }

    //#################//
    //  TTS Interfaces //
    //#################//

    async getVoice(voiceName) {
        if (this.voices.length == 0) {
            this.voices = await this.fetchTtsVoiceObjects();
        }
        const match = this.voices.filter(v => v.name == voiceName)[0];
        if (!match) {
            throw `TTS Voice name ${voiceName} not found`;
        }
        return match;
    }

    async generateTts(text, voiceId) {
        const response = await this.fetchTtsGeneration(text, voiceId);
        return response;
    }

    //###########//
    // API CALLS //
    //###########//

    async fetchTtsVoiceObjects() {
        const response = await fetch(`${this.settings.provider_endpoint}/speakers`);
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${await response.text()}`);
        }
        const responseJson = await response.json();
        this.voices = responseJson;
        return responseJson;
    }

    async changeTTSSettings() {
    }

    async fetchTtsGeneration(inputText, voiceId, lang = null, forceNoStreaming = false) {
        console.info(`Generating IndexTTS (CosyVoice) for voice_id ${voiceId}`);

        const streaming = this.settings.streaming;

        // Detect an emotion suffix of the form  _<emotion>  at the end of the text.
        let processedText = inputText;
        let emotion = null;
        const emotionRegex = /_([^_]+)$/;
        const emotionMatch = inputText.match(emotionRegex);
        if (emotionMatch) {
            emotion = emotionMatch[1];
            processedText = inputText.replace(emotionRegex, '');
            console.info(`Emotion suffix detected: ${emotion}; text: ${processedText}`);
        }

        const params = {
            text: processedText,
            speaker: voiceId,
        };

        if (emotion) {
            params.emotion = emotion;
        }
        if (streaming) {
            params.streaming = 1;
        }

        const url = `${this.settings.provider_endpoint}/`;
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(params),
        });
        if (!response.ok) {
            toastr.error(response.statusText, 'IndexTTS Generation Failed');
            throw new Error(`HTTP ${response.status}: ${await response.text()}`);
        }
        return response;
    }

    // Interface not used
    async fetchTtsFromHistory(history_item_id) {
        return Promise.resolve(history_item_id);
    }
}
