import { Component, NgZone } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  IonHeader,
  IonToolbar,
  IonTitle,
  IonContent,
  IonButton,
  IonAlert,
} from '@ionic/angular/standalone';
import { TextToSpeech } from '@capacitor-community/text-to-speech';
import { environment } from '../../environments/environment';

@Component({
  selector: 'app-home',
  templateUrl: 'home.page.html',
  styleUrls: ['home.page.scss'],
  imports: [CommonModule, IonHeader, IonToolbar, IonTitle, IonContent, IonButton, IonAlert],
})
export class HomePage {
  isProcessing = false;
  recognizedNote: string | null = null;
  recognizedCommand: string | null = null;
  commandResponse: string | null = null;
  statusText = 'Pronto para testar o microfone';
  hasMicrophoneAccess = false;

  private audioContext?: AudioContext;
  private analyser?: AnalyserNode;
  private stream?: MediaStream;
  // UI alert for showing errors directly to the user
  errorAlertOpen = false;
  errorMessage = '';
  soundDetectedAlertOpen = false;
  soundDetectedMessage = '';
  // Speech command recognition
  recognitionSupported = false;
  isListeningForCommand = false;
  commandAlertOpen = false;
  commandAlertMessage = '';
  private speechRecognition?: any;

  constructor(private ngZone: NgZone) {}
  async recognizeNote() {
    if (this.isProcessing) {
      return;
    }

    this.recognizedNote = null;
    this.statusText = 'Verificando acesso ao microfone...';
    this.isProcessing = true;
    this.hasMicrophoneAccess = false;

    try {
      console.log('diagnostic: navigator.mediaDevices present=', !!navigator.mediaDevices);
      await this.requestMicrophonePermission();
      await this.initAudio();
      this.hasMicrophoneAccess = true;
      this.statusText = 'Microfone autorizado. Ouvindo som... fale ou faça barulho.';

      const detected = await this.listenForSound(3000);
      if (detected) {
        this.soundDetectedMessage = 'Som detectado! O microfone está funcionando.';
      } else {
        this.soundDetectedMessage = 'Nenhum som detectado. Fale ou faça barulho mais alto e tente novamente.';
      }
      this.soundDetectedAlertOpen = true;
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

      this.statusText = `Erro ao acessar o microfone: ${errInfo.split('\n')[0]}`;
      this.errorMessage = `Detalhes:\n${errInfo}\n\nVerifique permissões do app nas Configurações.`;
      this.errorAlertOpen = true;
      console.error('diagnostic: recognizeNote error ->', e);
    } finally {
      this.stopAudio();
      this.isProcessing = false;
    }
  }

  async startCommandRecognition() {
    if (this.isListeningForCommand) {
      return;
    }

    // Feature detection
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
    this.statusText = 'Escutando comando...';

    this.speechRecognition.onresult = async (event: any) => {
      try {
        const transcript = (event.results[0][0].transcript || '').toLowerCase().trim();
        console.log('diagnostic: speech transcript=', transcript);
        // remove diacritics and punctuation for simpler matching
        const normalized = transcript
          .normalize('NFD')
          .replace(/\p{Diacritic}/gu, '')
          .replace(/[.,!?]/g, '')
          .replace(/\s+/g, ' ')
          .trim();
        console.log('diagnostic: normalized transcript=', normalized);

        if (normalized.startsWith('pergunta')) {
          const question = this.extractQuestion(normalized);
          if (!question) {
            this.ngZone.run(() => {
              this.commandAlertMessage = 'Pergunta vazia. Por favor, fale algo após "pergunta".';
              this.commandAlertOpen = true;
              this.statusText = 'Pergunta inválida';
            });
            return;
          }

          this.ngZone.run(() => {
            this.recognizedCommand = normalized;
            this.commandResponse = 'Consultando LLM...';
            this.commandAlertMessage = 'Consultando LLM...';
            this.commandAlertOpen = true;
            this.statusText = 'Enviando pergunta para LLM...';
          });

          try {
            const answer = await this.queryLLM(question);
            this.ngZone.run(() => {
              this.commandResponse = answer;
              this.commandAlertMessage = answer;
              this.statusText = 'Resposta recebida';
            });
            await this.speak(answer);
          } catch (llmError) {
            console.error('diagnostic: queryLLM failed ->', llmError);
            this.ngZone.run(() => {
              this.commandAlertMessage = 'Não foi possível obter resposta da LLM.';
              this.commandResponse = String(llmError || 'Erro desconhecido');
              this.commandAlertOpen = true;
              this.statusText = 'Erro na LLM';
            });
          }

          return;
        }

        const commandResult = this.parseVoiceCommand(normalized);
        this.ngZone.run(() => {
          this.recognizedCommand = normalized;
          this.commandResponse = commandResult.response;
          this.commandAlertMessage = commandResult.response;
          this.commandAlertOpen = true;
          this.statusText = commandResult.speak ? 'Comando reconhecido' : 'Comando não reconhecido';
          if (commandResult.speak) {
            console.log('diagnostic: command recognized, calling native TTS speak()');
            this.speak(this.commandAlertMessage).catch((sPeakErr: any) => {
              console.warn('diagnostic: native speak failed with error', sPeakErr);
            });
          } else {
            console.log('diagnostic: command not spoken, response=', this.commandAlertMessage);
          }
        });
      } catch (e) {
        console.error('diagnostic: speech onresult error ->', e);
        this.ngZone.run(() => {
          this.errorMessage = 'Erro ao processar resultado de voz.';
          this.errorAlertOpen = true;
        });
      }
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
        this.statusText = 'Pronto para testar o microfone';
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
        this.statusText = 'Pronto para testar o microfone';
      });
    }
  }

  private async speak(text: string): Promise<void> {
    console.log('diagnostic: speak() entered with text=', text);
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
    }
  }

  private parseVoiceCommand(normalized: string): { response: string; speak: boolean } {
    if (normalized === 'alo' || normalized === 'alô' || normalized === 'ola' || normalized === 'olá') {
      return { response: 'Olá', speak: true };
    }

    if (normalized.includes('tudo bem') || normalized.includes('como voce esta') || normalized.includes('como voce vai')) {
      return { response: 'Estou bem, obrigado. E você?', speak: true };
    }

    if (normalized.includes('qual e o seu nome') || normalized.includes('como te chama') || normalized.includes('voce se chama')) {
      return { response: 'Meu nome é Novo Jarvis, seu assistente completo.', speak: true };
    }

    if (normalized.includes('que horas sao') || normalized.includes('que horas são') || normalized.includes('horas')) {
      const now = new Date();
      const hours = now.getHours().toString().padStart(2, '0');
      const minutes = now.getMinutes().toString().padStart(2, '0');
      return { response: `Agora são ${hours} horas e ${minutes} minutos.`, speak: true };
    }

    if (normalized.includes('acende a luz') || normalized.includes('liga a luz') || normalized.includes('liga luz')) {
      return { response: 'Ligando as luzes.', speak: true };
    }

    if (normalized.includes('desliga a luz') || normalized.includes('apaga a luz') || normalized.includes('desliga luz')) {
      return { response: 'Desligando as luzes.', speak: true };
    }

    if (normalized.includes('teste') || normalized.includes('teste de voz')) {
      return { response: 'Teste de comando realizado com sucesso.', speak: true };
    }

    return { response: 'Desculpe, não entendi', speak: true };
  }

  private extractQuestion(normalized: string): string {
    return normalized.replace(/^pergunta[:\s]*/i, '').trim();
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
  }

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

    if (
    (response.status === 429 || response.status === 503) &&
    tentativa < maxTentativas
    ) {
    console.log(
    `diagnostic: aguardando nova tentativa (${tentativa}/${maxTentativas})`
    );

    await new Promise(resolve => setTimeout(resolve, 2000));
    continue;
    }

    throw new Error(`Erro LLM: ${errorMessage}`);
    }

    const answer =
    data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ||
    'Não foi possível obter uma resposta da LLM.';

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
  

  // private async queryLLM(question: string): Promise<string> {
  //   const apiUrl = environment.llmApiUrl;
  //   const apiKey = environment.llmApiKey;

  //   if (!apiUrl || !apiKey) {
  //     throw new Error('LLM API não está configurada. Atualize src/environments/environment.ts.');
  //   }

  //   const requestBody = {
  //     contents: [
  //       {
  //         parts: [
  //           {
  //             text: `Responda em português de forma clara e objetiva. Pergunta: ${question}`,
  //           },
  //         ],
  //       },
  //     ],
  //     generationConfig: {
  //       maxOutputTokens: 250,
  //       temperature: 0.7,
  //     },
  //   };

  //   const urlWithKey = `${apiUrl}?key=${apiKey}`;
  //   console.log('diagnostic: queryLLM - enviando para Gemini:', apiUrl);
  //   console.log('diagnostic: queryLLM - pergunta:', question);

  //   try {
  //     const response = await fetch(urlWithKey, {
  //       method: 'POST',
  //       headers: {
  //         'Content-Type': 'application/json',
  //       },
  //       body: JSON.stringify(requestBody),
  //     });

  //     console.log('diagnostic: queryLLM - status:', response.status, response.statusText);

  //     const data = await response.json();
  //     console.log('diagnostic: queryLLM - resposta completa:', JSON.stringify(data));

  //     if (!response.ok) {
  //       const errorMessage = 
  //         data?.error?.message || 
  //         data?.error?.errors?.[0]?.message ||
  //         data?.message || 
  //         response.statusText;
  //       console.error('diagnostic: queryLLM - erro HTTP:', errorMessage);
  //       throw new Error(`Erro LLM: ${errorMessage}`);
  //     }

  //     const answer = 
  //       data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ||
  //       'Não foi possível obter uma resposta da LLM.';
      
  //     console.log('diagnostic: queryLLM - resposta final:', answer);
  //     return answer;
  //   } catch (error) {
  //     console.error('diagnostic: queryLLM - erro fetch:', error);
  //     throw error;
  //   }
  // }

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

      // Create AudioContext BEFORE getUserMedia for better compatibility
      if (!this.audioContext) {
        this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
        console.log('diagnostic: AudioContext created, state=', this.audioContext.state);
      }

      // Resume AudioContext if suspended (common on WebViews after permission request)
      if (this.audioContext.state === 'suspended') {
        console.log('diagnostic: resuming suspended AudioContext...');
        await this.audioContext.resume();
        console.log('diagnostic: AudioContext resumed, state=', this.audioContext.state);
      }

      // try to get devices first for diagnostics
      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        console.log('diagnostic: devices before getUserMedia ->', devices);
      } catch (e) {
        console.warn('diagnostic: enumerateDevices failed before getUserMedia', e);
      }

      // Use explicit audio constraints for better microphone access
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

  private getCurrentFrequency(): number {
    if (!this.analyser || !this.audioContext) {
      return 0;
    }

    const buffer = new Float32Array(this.analyser.fftSize);
    this.analyser.getFloatTimeDomainData(buffer);
    return this.autoCorrelate(buffer, this.audioContext.sampleRate);
  }

  private autoCorrelate(buf: Float32Array, sampleRate: number): number {
    const size = buf.length;
    let bestOffset = -1;
    let bestCorrelation = 0;
    let lastCorrelation = 1;
    let rms = 0;

    for (let i = 0; i < size; i++) {
      const val = buf[i];
      rms += val * val;
    }
    rms = Math.sqrt(rms / size);
    if (rms < 0.01) {
      return 0;
    }

    const maxSamples = Math.floor(size / 2);
    for (let offset = 1; offset < maxSamples; offset++) {
      let correlation = 0;
      for (let i = 0; i < maxSamples; i++) {
        correlation += Math.abs(buf[i] - buf[i + offset]);
      }
      correlation = 1 - correlation / maxSamples;

      if (correlation > 0.9 && correlation > lastCorrelation) {
        bestCorrelation = correlation;
        bestOffset = offset;
      }

      lastCorrelation = correlation;
    }

    if (bestOffset === -1 || bestCorrelation < 0.01) {
      return 0;
    }

    return sampleRate / bestOffset;
  }

  private getNoteName(frequency: number): string {
    const noteStrings = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
    const noteNumber = 12 * (Math.log2(frequency / 440)) + 69;
    const rounded = Math.round(noteNumber);
    const octave = Math.floor(rounded / 12) - 1;
    const note = noteStrings[(rounded + 120) % 12];
    return `${note}${octave}`;
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
