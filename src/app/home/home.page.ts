import { Component, NgZone } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  IonHeader,
  IonToolbar,
  IonTitle,
  IonContent,
  IonAlert,
  IonMenuButton,
  IonButtons,
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { mic, save } from 'ionicons/icons';
import { TextToSpeech } from '@capacitor-community/text-to-speech';
import { Directory, Encoding, Filesystem } from '@capacitor/filesystem';
import { environment } from '../../environments/environment';
import { BrandHeaderComponent } from './components/brand-header/brand-header.component';
import { StatusPanelComponent } from './components/status-panel/status-panel.component';
import { SaveBannerComponent } from './components/save-banner/save-banner.component';
import { VoiceActionComponent } from './components/voice-action/voice-action.component';
import { SettingsMenuComponent } from './components/settings-menu/settings-menu.component';
import { VoiceCommandsService } from '../services/voice-commands.service';

@Component({
  selector: 'app-home',
  templateUrl: 'home.page.html',
  styleUrls: ['home.page.scss'],
  imports: [
    CommonModule,
    IonHeader,
    IonToolbar,
    IonTitle,
    IonContent,
    IonAlert,
    IonMenuButton,
    IonButtons,
    BrandHeaderComponent,
    StatusPanelComponent,
    SaveBannerComponent,
    VoiceActionComponent,
    SettingsMenuComponent,
  ],
})
export class HomePage {
  isProcessing = false;
  recognizedNote: string | null = null;
  recognizedCommand: string | null = null;
  commandResponse: string | null = null;
  statusText = 'Pronto. Toque para falar com a Kira.';
  hasMicrophoneAccess = false;
  micTestStatus = '';
  isSpeaking = false;
  awaitingSaveCommand = false;
  isListeningForSave = false;

  private audioContext?: AudioContext;
  private analyser?: AnalyserNode;
  private stream?: MediaStream;
  errorAlertOpen = false;
  errorMessage = '';
  isListeningForCommand = false;
  private speechRecognition?: any;
  private followUpRecognition?: any;
  private speechAborted = false;
  private saveListenActive = false;
  private readonly saveListenWindowMs = 10000;
  lastResponseText: string | null = null;

  constructor(private ngZone: NgZone, private voiceCommands: VoiceCommandsService) {
    addIcons({ mic, save });
  }

  async recognizeNote() {
    if (this.isProcessing) {
      return;
    }

    this.recognizedNote = null;
    this.micTestStatus = 'Verificando acesso ao microfone...';
    this.isProcessing = true;
    this.hasMicrophoneAccess = false;

    try {
      console.log('diagnostic: navigator.mediaDevices present=', !!navigator.mediaDevices);
      await this.requestMicrophonePermission();
      await this.initAudio();
      this.hasMicrophoneAccess = true;
      this.micTestStatus = 'Microfone autorizado. Ouvindo som... fale ou faça barulho.';

      const detected = await this.listenForSound(3000);
      if (detected) {
        this.micTestStatus = 'Som detectado! O microfone está funcionando.';
      } else {
        this.micTestStatus = 'Nenhum som detectado. Fale ou faça barulho mais alto e tente novamente.';
      }
    } catch (error) {
      const e: any = error;
      let errInfo = '';
      try {
        if (e && (e.name || e.message)) {
          errInfo = `${e.name || ''}: ${e.message || ''}`.trim();
        } else {
          errInfo = JSON.stringify(e);
        }
      } catch (jsonErr) {
        errInfo = String(e);
      }
      if (e && e.stack) {
        errInfo += '\n\nStack:\n' + e.stack;
      }

      this.micTestStatus = `Erro: ${errInfo.split('\n')[0]}`;
      this.errorMessage = `Detalhes:\n${errInfo}\n\nVerifique permissões do app nas Configurações.`;
      this.errorAlertOpen = true;
      console.error('diagnostic: recognizeNote error ->', e);
    } finally {
      this.stopAudio();
      this.isProcessing = false;
    }
  }

  async startCommandRecognition() {
    if (this.isListeningForCommand || this.isSpeaking) {
      return;
    }

    this.stopFollowUpListening();
    this.awaitingSaveCommand = false;

    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      this.errorMessage = 'Reconhecimento de voz não suportado neste WebView.';
      this.errorAlertOpen = true;
      return;
    }

    this.speechRecognition = new SpeechRecognition();
    this.speechRecognition.lang = 'pt-BR';
    this.speechRecognition.interimResults = false;
    this.speechRecognition.maxAlternatives = 1;

    this.isListeningForCommand = true;
    this.statusText = 'Escutando... fale agora.';

    this.speechRecognition.onresult = async (event: any) => {
      const transcript = (event.results[0][0].transcript || '').toLowerCase().trim();
      console.log('diagnostic: speech transcript=', transcript);
      const normalized = this.normalizeTranscript(transcript);
      console.log('diagnostic: normalized transcript=', normalized);
      await this.processRecognizedCommand(normalized);
    };

    this.speechRecognition.onerror = (ev: any) => {
      console.warn('diagnostic: speech error', ev);
      this.ngZone.run(() => {
        this.errorMessage = `Reconhecimento de voz falhou: ${ev.error || ev.message || ev}`;
        this.errorAlertOpen = true;
      });
    };

    this.speechRecognition.onend = () => {
      this.ngZone.run(() => {
        this.isListeningForCommand = false;
        if (!this.isSpeaking && !this.awaitingSaveCommand) {
          this.statusText = 'Pronto. Toque para falar com a Kira.';
        }
      });
    };

    try {
      this.speechRecognition.start();
    } catch (startErr) {
      console.error('diagnostic: speech start failed ->', startErr);
      this.ngZone.run(() => {
        this.errorMessage = `Não foi possível iniciar reconhecimento de voz: ${startErr}`;
        this.errorAlertOpen = true;
        this.isListeningForCommand = false;
        this.statusText = 'Pronto. Toque para falar com a Kira.';
      });
    }
  }

  async stopSpeaking() {
    this.speechAborted = true;
    this.stopFollowUpListening();

    try {
      await TextToSpeech.stop();
    } catch (err) {
      console.warn('diagnostic: TextToSpeech.stop failed', err);
    }

    this.ngZone.run(() => {
      this.isSpeaking = false;
      this.awaitingSaveCommand = false;
      this.statusText = this.lastResponseText
        ? 'Leitura interrompida. Toque no ícone de salvar ou fale um novo comando.'
        : 'Pronto. Toque para falar com a Kira.';
    });
  }

  private async processRecognizedCommand(normalized: string): Promise<void> {
    try {
      if (this.lastResponseText && this.isSaveCommand(normalized)) {
        this.stopFollowUpListening();
        await this.saveResponseToFile();
        return;
      }

      if (normalized.startsWith('kira')) {
        const question = this.extractQuestion(normalized);
        if (!question) {
          this.ngZone.run(() => {
            this.commandResponse = 'Pergunta vazia. Fale algo após "Kira".';
            this.statusText = 'Pergunta inválida';
          });
          return;
        }

        this.ngZone.run(() => {
          this.recognizedCommand = normalized;
          this.commandResponse = 'Consultando...';
          this.statusText = 'Enviando pergunta...';
        });

        try {
          const answer = await this.queryLLM(question);
          const cleanAnswer = this.sanitizeForSpeech(answer).trim();
          this.ngZone.run(() => {
            this.commandResponse = cleanAnswer;
            this.statusText = 'Resposta recebida';
          });
          await this.speakResponse(cleanAnswer);
        } catch (llmError) {
          console.error('diagnostic: queryLLM failed ->', llmError);
          this.ngZone.run(() => {
            this.commandResponse = String(llmError || 'Erro desconhecido');
            this.errorMessage = 'Não foi possível obter resposta da IA.';
            this.errorAlertOpen = true;
            this.statusText = 'Erro na consulta';
          });
        }

        return;
      }

      const commandResult = this.voiceCommands.match(normalized);
      const responseText = this.sanitizeForSpeech(commandResult.response).trim();
      this.ngZone.run(() => {
        this.recognizedCommand = normalized;
        this.commandResponse = responseText;
        this.statusText = commandResult.speak ? 'Comando reconhecido' : 'Comando não reconhecido';
      });

      if (commandResult.speak) {
        console.log('diagnostic: command recognized, calling native TTS speak()');
        await this.speakResponse(responseText);
      } else {
        console.log('diagnostic: command not spoken, response=', responseText);
      }
    } catch (e) {
      console.error('diagnostic: processRecognizedCommand error ->', e);
      this.ngZone.run(() => {
        this.errorMessage = 'Erro ao processar resultado de voz.';
        this.errorAlertOpen = true;
      });
    }
  }

  private async speakResponse(text: string): Promise<void> {
    this.lastResponseText = text;
    await this.speak(text);

    if (this.speechAborted) {
      return;
    }

    this.ngZone.run(() => {
      this.awaitingSaveCommand = true;
      this.statusText = 'Pode falar outro comando, ou diga "salvar resposta" para guardar o texto.';
    });

    await this.listenForFollowUpCommand();
  }

  private async listenForFollowUpCommand(): Promise<void> {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition || this.speechAborted) {
      this.ngZone.run(() => {
        this.awaitingSaveCommand = false;
      });
      return;
    }

    this.saveListenActive = true;
    this.ngZone.run(() => {
      this.isListeningForSave = true;
    });

    // O reconhecimento de voz encerra sozinho após poucos segundos de silêncio,
    // então reiniciamos automaticamente até algo ser reconhecido ou a janela expirar.
    const deadline = Date.now() + this.saveListenWindowMs;
    let handled = false;

    while (this.saveListenActive && !this.speechAborted && Date.now() < deadline) {
      handled = await this.runFollowUpListenAttempt(SpeechRecognition);
      if (handled) {
        break;
      }
    }

    this.saveListenActive = false;
    this.ngZone.run(() => {
      this.isListeningForSave = false;
      if (!handled) {
        this.awaitingSaveCommand = false;
        if (!this.isSpeaking) {
          this.statusText = 'Pronto. Toque para falar com a Kira.';
        }
      }
    });
  }

  private runFollowUpListenAttempt(SpeechRecognition: any): Promise<boolean> {
    return new Promise(resolve => {
      this.followUpRecognition = new SpeechRecognition();
      this.followUpRecognition.lang = 'pt-BR';
      this.followUpRecognition.interimResults = false;
      this.followUpRecognition.maxAlternatives = 1;

      let settled = false;
      const finish = (result: boolean) => {
        if (settled) {
          return;
        }
        settled = true;
        this.followUpRecognition = undefined;
        resolve(result);
      };

      this.followUpRecognition.onresult = async (event: any) => {
        const transcript = (event.results[0][0].transcript || '').toLowerCase().trim();
        const normalized = this.normalizeTranscript(transcript);
        console.log('diagnostic: follow-up transcript=', normalized);

        finish(true);
        await this.processRecognizedCommand(normalized);
      };

      this.followUpRecognition.onerror = (ev: any) => {
        console.warn('diagnostic: follow-up speech error', ev);
        finish(false);
      };

      this.followUpRecognition.onend = () => {
        finish(false);
      };

      try {
        this.followUpRecognition.start();
      } catch (err) {
        console.error('diagnostic: follow-up speech start failed ->', err);
        finish(false);
      }
    });
  }

  async saveResponseToFile(): Promise<void> {
    if (!this.lastResponseText) {
      return;
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `kira-resposta-${timestamp}.txt`;

    try {
      await Filesystem.writeFile({
        path: filename,
        data: this.lastResponseText,
        directory: Directory.Documents,
        encoding: Encoding.UTF8,
      });

      this.ngZone.run(() => {
        this.commandResponse = `Resposta salva em: ${filename}`;
        this.statusText = 'Arquivo salvo com sucesso.';
        this.awaitingSaveCommand = false;
      });

      await this.speak('Resposta salva com sucesso.');
    } catch (err) {
      console.error('diagnostic: saveResponseToFile failed ->', err);
      this.ngZone.run(() => {
        this.errorMessage = 'Não foi possível salvar a resposta em arquivo.';
        this.errorAlertOpen = true;
        this.statusText = 'Erro ao salvar arquivo';
        this.awaitingSaveCommand = false;
      });
    }
  }

  private stopFollowUpListening() {
    this.saveListenActive = false;

    if (!this.followUpRecognition) {
      return;
    }

    try {
      this.followUpRecognition.abort();
    } catch (err) {
      console.warn('diagnostic: follow-up recognition abort failed', err);
    }

    this.followUpRecognition = undefined;
    this.awaitingSaveCommand = false;
  }

  private isSaveCommand(normalized: string): boolean {
    return normalized.includes('salvar resposta');
  }

  private normalizeTranscript(transcript: string): string {
    return transcript
      .normalize('NFD')
      .replace(/\p{Diacritic}/gu, '')
      .replace(/[.,!?]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private async speak(text: string): Promise<void> {
    console.log('diagnostic: speak() entered with text=', text);
    this.speechAborted = false;
    this.ngZone.run(() => {
      this.isSpeaking = true;
    });

    try {
      await TextToSpeech.speak({
        text,
        lang: 'pt-BR',
        rate: 1.0,
        pitch: 1.0,
        volume: 1.0,
        category: 'ambient',
        queueStrategy: 0,
      });
      console.log('diagnostic: TextToSpeech.speak completed');
    } catch (err) {
      console.error('diagnostic: TextToSpeech.speak failed', err);
      throw err;
    } finally {
      this.ngZone.run(() => {
        this.isSpeaking = false;
      });
    }
  }

  private sanitizeForSpeech(text: string): string {
    return text.replace(/[*#]/g, ' ');
  }

  private extractQuestion(normalized: string): string {
    return normalized.replace(/^kira[:\s]*/i, '').trim();
  }

  private async queryLLM(question: string): Promise<string> {
    const apiUrl = environment.llmApiUrl;
    const apiKey = environment.llmApiKey;

    if (!apiUrl || !apiKey) {
      throw new Error('LLM API não está configurada. Atualize src/environments/environment.ts.');
    }

    const requestBody = {
      contents: [
        {
          parts: [
            {
              text: `Responda em português de forma clara e objetiva. Pergunta: ${question}`,
            },
          ],
        },
      ],
    };

    const urlWithKey = `${apiUrl}?key=${apiKey}`;
    console.log('diagnostic: queryLLM - enviando para Gemini:', apiUrl);
    console.log('diagnostic: queryLLM - pergunta:', question);

    const maxTentativas = 5;

    for (let tentativa = 1; tentativa <= maxTentativas; tentativa++) {
      try {
        const response = await fetch(urlWithKey, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(requestBody),
        });

        console.log(
          `diagnostic: queryLLM - tentativa ${tentativa}/${maxTentativas} - status:`,
          response.status,
          response.statusText
        );

        const data = await response.json();
        console.log('diagnostic: queryLLM - resposta completa:', JSON.stringify(data));

        if (!response.ok) {
          const errorMessage =
            data?.error?.message ||
            data?.error?.errors?.[0]?.message ||
            data?.message ||
            response.statusText;

          console.error('diagnostic: queryLLM - erro HTTP:', errorMessage);

          if ((response.status === 429 || response.status === 503) && tentativa < maxTentativas) {
            console.log(`diagnostic: aguardando nova tentativa (${tentativa}/${maxTentativas})`);

            await new Promise(resolve => setTimeout(resolve, 2000));
            continue;
          }

          throw new Error(`Erro LLM: ${errorMessage}`);
        }

        const rawAnswer = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
        const answer = rawAnswer ? this.sanitizeForSpeech(rawAnswer) : 'Não foi possível obter uma resposta da LLM.';

        console.log('diagnostic: queryLLM - resposta final:', answer);
        return answer;
      } catch (error) {
        console.error('diagnostic: queryLLM - erro fetch:', error);

        if (tentativa >= maxTentativas) {
          throw error;
        }

        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }

    throw new Error('Falha ao consultar a LLM após 5 tentativas.');
  }

  private async listenForSound(duration = 3000): Promise<boolean> {
    if (!this.analyser) {
      return false;
    }

    const buffer = new Float32Array(this.analyser.fftSize);
    const threshold = 0.02;
    const interval = 150;
    const steps = Math.ceil(duration / interval);

    for (let i = 0; i < steps; i++) {
      await this.wait(interval);
      if (!this.analyser) {
        return false;
      }
      this.analyser.getFloatTimeDomainData(buffer);
      let sum = 0;
      for (let j = 0; j < buffer.length; j++) {
        sum += buffer[j] * buffer[j];
      }
      const rms = Math.sqrt(sum / buffer.length);
      console.log('diagnostic: listenForSound rms=', rms);
      if (rms > threshold) {
        return true;
      }
    }
    return false;
  }

  private async initAudio() {
    if (this.audioContext && this.stream) {
      return;
    }

    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('navigator.mediaDevices.getUserMedia not available');
      }

      if (!this.audioContext) {
        this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
        console.log('diagnostic: AudioContext created, state=', this.audioContext.state);
      }

      if (this.audioContext.state === 'suspended') {
        console.log('diagnostic: resuming suspended AudioContext...');
        await this.audioContext.resume();
        console.log('diagnostic: AudioContext resumed, state=', this.audioContext.state);
      }

      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        console.log('diagnostic: devices before getUserMedia ->', devices);
      } catch (e) {
        console.warn('diagnostic: enumerateDevices failed before getUserMedia', e);
      }

      const audioConstraints = {
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        },
      };

      console.log('diagnostic: calling getUserMedia with constraints ->', audioConstraints);
      this.stream = await navigator.mediaDevices.getUserMedia(audioConstraints);
      console.log('diagnostic: getUserMedia success, tracks=', this.stream.getTracks());

      if (!this.stream || this.stream.getTracks().length === 0) {
        throw new Error('MediaStream obtained but no audio tracks available');
      }

      try {
        const source = this.audioContext.createMediaStreamSource(this.stream);
        console.log('diagnostic: MediaStreamAudioSourceNode created successfully');

        this.analyser = this.audioContext.createAnalyser();
        this.analyser.fftSize = 2048;
        source.connect(this.analyser);
        console.log('diagnostic: analyser connected successfully');
      } catch (audioErr) {
        console.error('diagnostic: error creating/connecting audio nodes ->', audioErr);
        throw new Error(`Audio node error: ${audioErr}`);
      }
    } catch (err) {
      console.error('diagnostic: initAudio failed ->', err);
      this.stopAudio();
      throw err;
    }
  }

  private async requestMicrophonePermission(): Promise<void> {
    if (navigator.permissions && navigator.permissions.query) {
      try {
        // @ts-ignore
        const p = await navigator.permissions.query({ name: 'microphone' });
        if (p && p.state === 'denied') {
          throw new Error('Permissão de microfone negada');
        }
      } catch (e) {
        console.warn('navigator.permissions query failed', e);
      }
    }

    if (navigator.mediaDevices) {
      return;
    }

    throw new Error('API de microfone não suportada neste dispositivo');
  }

  private wait(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private stopAudio() {
    if (this.stream) {
      this.stream.getTracks().forEach(track => track.stop());
      this.stream = undefined;
    }

    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = undefined;
    }

    this.analyser = undefined;
  }
}
