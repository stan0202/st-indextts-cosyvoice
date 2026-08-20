import { saveTtsProviderSettings } from '../../tts/index.js';

export { IndexTTSCosyVoiceProvider };

/**
 * IndexTTS provider that speaks the CosyVoice-compatible API (extended):
 *   GET  <endpoint>/speakers  -> [{name, voice_id}]
 *   POST <endpoint>/          -> audio/wav   body {text, speaker, ...}
 *
 * Options (all in the provider settings UI):
 *   - use_emo_text : auto-detect emotion from the spoken text
 *   - emo_text     : explicit emotion description (overrides use_emo_text)
 *   - emo_alpha    : emotion strength 0..1
 *   - speed        : speech speed (>1 = faster)
 *
 * Emotion suffix: append "_<name>" to the message (e.g. "你好_開心") to use an
 * emotion reference wav named emo_<name>.wav.  Priority on the server:
 *   emo_text  >  use_emo_text  >  emotion reference  >  none.
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
        'Chinese ZH': 'ZH',
        'English EN': 'EN',
        'Japanese JA': 'JA',
        'Spanish ES': 'ES',
        'Arabic AR': 'AR',
    };

    langKey2LangCode = {
        'zh': 'zh-CN',
        'en': 'en-US',
        'ja': 'ja-JP',
        'ko': 'ko-KR',
        'es': 'es-ES',
        'ar': 'ar-SA',
    };

    modelTypes = {
        IndexTTS: 'IndexTTS',
    };

    defaultSettings = {
        provider_endpoint: 'http://localhost:8080',
        format: 'wav',
        lang: 'auto',
        streaming: false,
        use_emo_text: false,
        emo_text: '',
        emo_alpha: 0.65,
        speed: 1.0,
    };

    get settingsHtml() {
        const s = this.settings || this.defaultSettings;
        let html = `
        <label for="tts_indextts_language">Language:</label>
        <select id="tts_indextts_language" class="text_pole">
        ${Object.entries(this.languageLabels).map(([label, code]) =>
            `<option value="${code}" ${code === s.lang ? 'selected' : ''}>${label}</option>`).join('\n')
        }
        </select>
        <span>Spoken language for the text-to-speech engine.</span><br/>
        <br/>

        <label for="tts_indextts_endpoint">IndexTTS (CosyVoice) Endpoint:</label>
        <input id="tts_indextts_endpoint" type="text" class="text_pole" maxlength="250" value="${s.provider_endpoint}"/>
        <span>Server exposing the CosyVoice API (GET /speakers, POST /).</span><br/>
        <br/>

        <label for="tts_indextts_emo_text">Emotion description (emo_text):</label>
        <input id="tts_indextts_emo_text" type="text" class="text_pole" maxlength="200" value="${s.emo_text || ''}"/>
        <span>Optional. Explicit emotion, e.g. 興奮地、帶著哭腔. Takes priority over the toggle below.</span><br/>
        <br/>

        <label style="display:inline-flex;align-items:center;gap:8px;margin-top:8px">
            <input type="checkbox" id="tts_indextts_use_emo_text" ${s.use_emo_text ? 'checked' : ''}/>
            Auto emotion from text (use_emo_text)
        </label>
        <span>Detects the emotion from the spoken text itself.</span><br/>
        <br/>

        <label for="tts_indextts_emo_alpha">Emotion strength (emo_alpha): <span id="tts_indextts_emo_alpha_val">${s.emo_alpha}</span></label>
        <input id="tts_indextts_emo_alpha" type="range" min="0" max="1" step="0.05" value="${s.emo_alpha}"/>
        <br/>

        <label for="tts_indextts_speed">Speech speed: <span id="tts_indextts_speed_val">${s.speed}</span>×</label>
        <input id="tts_indextts_speed" type="range" min="0.5" max="2" step="0.1" value="${s.speed}"/>
        <span>Higher = faster.</span><br/>
        <br/>
        `;
        return html;
    }

    onSettingsChange() {
        this.settings.lang = $('#tts_indextts_language').val();
        this.settings.provider_endpoint = $('#tts_indextts_endpoint').val();
        this.settings.emo_text = ($('#tts_indextts_emo_text').val() || '').trim();
        this.settings.use_emo_text = $('#tts_indextts_use_emo_text').is(':checked');
        this.settings.emo_alpha = parseFloat($('#tts_indextts_emo_alpha').val());
        this.settings.speed = parseFloat($('#tts_indextts_speed').val());
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

        // settingsHtml is already in the DOM (ST injects it before loadSettings),
        // but it was rendered with default values — re-apply the loaded/persisted ones.
        $('#tts_indextts_language')
            .val(this.settings.lang)
            .on('change', this.onSettingsChange.bind(this));
        $('#tts_indextts_endpoint')
            .val(this.settings.provider_endpoint)
            .on('change', this.onSettingsChange.bind(this));
        $('#tts_indextts_emo_text').val(this.settings.emo_text || '');
        $('#tts_indextts_use_emo_text').prop('checked', !!this.settings.use_emo_text);
        $('#tts_indextts_emo_alpha').val(this.settings.emo_alpha);
        $('#tts_indextts_emo_alpha_val').text(this.settings.emo_alpha);
        $('#tts_indextts_speed').val(this.settings.speed);
        $('#tts_indextts_speed_val').text(this.settings.speed);

        const bind = () => {
            if (!$('#tts_indextts_emo_alpha').length) { setTimeout(bind, 50); return; }
            $('#tts_indextts_emo_alpha').on('input change', () => {
                $('#tts_indextts_emo_alpha_val').text($('#tts_indextts_emo_alpha').val());
                this.onSettingsChange();
            });
            $('#tts_indextts_speed').on('input change', () => {
                $('#tts_indextts_speed_val').text($('#tts_indextts_speed').val());
                this.onSettingsChange();
            });
            $('#tts_indextts_language').on('change', this.onSettingsChange.bind(this));
            $('#tts_indextts_endpoint').on('change', this.onSettingsChange.bind(this));
            $('#tts_indextts_use_emo_text').on('change', this.onSettingsChange.bind(this));
            $('#tts_indextts_emo_text').on('change', this.onSettingsChange.bind(this));
        };
        bind();

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
            speed: this.settings.speed,
        };

        // Spoken language (server accepts ZH/EN/JA/ES/AR; 'auto' lets the server default).
        const serverLang = this.settings.lang;
        if (serverLang && serverLang !== 'auto') {
            params.lang = serverLang;
        }

        // Emotion options (server priority: emo_text > use_emo_text > emotion).
        const emoText = (this.settings.emo_text || '').trim();
        if (emoText) {
            params.emo_text = emoText;
        }
        if (this.settings.use_emo_text) {
            params.use_emo_text = true;
        }
        if (emotion) {
            params.emotion = emotion;
        }
        params.emo_alpha = this.settings.emo_alpha;

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
