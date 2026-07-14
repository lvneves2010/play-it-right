import { ComponentFixture, TestBed } from '@angular/core/testing';

import { HomePage } from './home.page';
import { environment } from '../../environments/environment';

describe('HomePage', () => {
  let component: HomePage;
  let fixture: ComponentFixture<HomePage>;

  beforeEach(async () => {
    fixture = TestBed.createComponent(HomePage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should start with the default idle state', () => {
    expect(component.isProcessing).toBeFalse();
    expect(component.recognizedNote).toBeNull();
    expect(component.recognizedCommand).toBeNull();
    expect(component.commandResponse).toBeNull();
    expect(component.hasMicrophoneAccess).toBeFalse();
    expect(component.isListeningForCommand).toBeFalse();
    expect(component.errorAlertOpen).toBeFalse();
    expect(component.commandAlertOpen).toBeFalse();
    expect(component.statusText).toBe('Pronto para testar o microfone');
  });

  describe('parseVoiceCommand', () => {
    const parse = (input: string): { response: string; speak: boolean } =>
      (component as unknown as { parseVoiceCommand(n: string): { response: string; speak: boolean } })
        .parseVoiceCommand(input);

    it('should greet back for greetings', () => {
      for (const greeting of ['alo', 'alô', 'ola', 'olá']) {
        const result = parse(greeting);
        expect(result).toEqual({ response: 'Olá', speak: true });
      }
    });

    it('should answer "how are you" style questions', () => {
      for (const phrase of ['tudo bem', 'como voce esta', 'como voce vai']) {
        expect(parse(phrase)).toEqual({ response: 'Estou bem, obrigado. E você?', speak: true });
      }
    });

    it('should answer name questions', () => {
      for (const phrase of ['qual e o seu nome', 'como te chama', 'voce se chama']) {
        expect(parse(phrase)).toEqual({
          response: 'Meu nome é Novo Jarvis, seu assistente completo.',
          speak: true,
        });
      }
    });

    it('should report the current time in HH horas e MM minutos format', () => {
      const result = parse('que horas sao');
      expect(result.speak).toBeTrue();
      expect(result.response).toMatch(/^Agora são \d{2} horas e \d{2} minutos\.$/);
    });

    it('should turn the lights on', () => {
      for (const phrase of ['acende a luz', 'liga a luz', 'liga luz']) {
        expect(parse(phrase)).toEqual({ response: 'Ligando as luzes.', speak: true });
      }
    });

    it('should turn the lights off', () => {
      for (const phrase of ['desliga a luz', 'apaga a luz', 'desliga luz']) {
        expect(parse(phrase)).toEqual({ response: 'Desligando as luzes.', speak: true });
      }
    });

    it('should acknowledge the test command', () => {
      expect(parse('teste')).toEqual({
        response: 'Teste de comando realizado com sucesso.',
        speak: true,
      });
      expect(parse('teste de voz')).toEqual({
        response: 'Teste de comando realizado com sucesso.',
        speak: true,
      });
    });

    it('should fall back to a not-understood response for unknown input', () => {
      expect(parse('qualquer coisa aleatoria')).toEqual({
        response: 'Desculpe, não entendi',
        speak: true,
      });
    });
  });

  describe('extractQuestion', () => {
    const extract = (input: string): string =>
      (component as unknown as { extractQuestion(n: string): string }).extractQuestion(input);

    it('should strip a leading "pergunta" keyword', () => {
      expect(extract('pergunta qual e a capital do brasil')).toBe('qual e a capital do brasil');
    });

    it('should strip a "pergunta:" prefix with punctuation', () => {
      expect(extract('pergunta: quanto e dois mais dois')).toBe('quanto e dois mais dois');
    });

    it('should return an empty string when only the keyword is present', () => {
      expect(extract('pergunta')).toBe('');
    });
  });

  describe('getNoteName', () => {
    const noteName = (freq: number): string =>
      (component as unknown as { getNoteName(f: number): string }).getNoteName(freq);

    it('should map A440 to A4', () => {
      expect(noteName(440)).toBe('A4');
    });

    it('should map middle C to C4', () => {
      expect(noteName(261.63)).toBe('C4');
    });

    it('should map 880Hz to A5', () => {
      expect(noteName(880)).toBe('A5');
    });
  });

  describe('autoCorrelate', () => {
    const autoCorrelate = (buf: Float32Array, sampleRate: number): number =>
      (component as unknown as { autoCorrelate(b: Float32Array, s: number): number })
        .autoCorrelate(buf, sampleRate);

    it('should return 0 for a silent buffer', () => {
      const buf = new Float32Array(2048);
      expect(autoCorrelate(buf, 44100)).toBe(0);
    });

    it('should return 0 for a very quiet buffer below the RMS threshold', () => {
      const buf = new Float32Array(2048);
      for (let i = 0; i < buf.length; i++) {
        buf[i] = 0.001 * Math.sin((2 * Math.PI * 440 * i) / 44100);
      }
      expect(autoCorrelate(buf, 44100)).toBe(0);
    });

    it('should return a positive frequency estimate for a loud periodic signal', () => {
      const buf = new Float32Array(2048);
      for (let i = 0; i < buf.length; i++) {
        buf[i] = Math.sin((2 * Math.PI * 440 * i) / 44100);
      }
      expect(autoCorrelate(buf, 44100)).toBeGreaterThan(0);
    });
  });

  describe('queryLLM', () => {
    const queryLLM = (question: string): Promise<string> =>
      (component as unknown as { queryLLM(q: string): Promise<string> }).queryLLM(question);

    let originalUrl: string;
    let originalKey: string;

    beforeEach(() => {
      originalUrl = environment.llmApiUrl;
      originalKey = environment.llmApiKey;
    });

    afterEach(() => {
      environment.llmApiUrl = originalUrl;
      environment.llmApiKey = originalKey;
    });

    it('should reject when the API is not configured', async () => {
      environment.llmApiUrl = '';
      environment.llmApiKey = '';
      await expectAsync(queryLLM('oi')).toBeRejectedWithError(/LLM API não está configurada/);
    });

    it('should return the trimmed answer text on a successful response', async () => {
      const fetchSpy = spyOn(window, 'fetch').and.resolveTo({
        ok: true,
        status: 200,
        statusText: 'OK',
        json: async () => ({
          candidates: [{ content: { parts: [{ text: '  Resposta da IA  ' }] } }],
        }),
      } as Response);

      await expectAsync(queryLLM('qual e a capital?')).toBeResolvedTo('Resposta da IA');
      expect(fetchSpy).toHaveBeenCalledTimes(1);
    });

    it('should return the fallback message when no candidate text is present', async () => {
      spyOn(window, 'fetch').and.resolveTo({
        ok: true,
        status: 200,
        statusText: 'OK',
        json: async () => ({}),
      } as Response);

      await expectAsync(queryLLM('vazio')).toBeResolvedTo(
        'Não foi possível obter uma resposta da LLM.'
      );
    });

    it('should retry then reject with the API error message after exhausting attempts', async () => {
      // The implementation waits 2s between retries; run those timers instantly.
      spyOn(window, 'setTimeout').and.callFake(((fn: TimerHandler) => {
        if (typeof fn === 'function') {
          fn();
        }
        return 0;
      }) as typeof window.setTimeout);

      const fetchSpy = spyOn(window, 'fetch').and.resolveTo({
        ok: false,
        status: 400,
        statusText: 'Bad Request',
        json: async () => ({ error: { message: 'chave invalida' } }),
      } as Response);

      await expectAsync(queryLLM('erro')).toBeRejectedWithError('Erro LLM: chave invalida');
      expect(fetchSpy).toHaveBeenCalledTimes(5);
    });
  });

  describe('recognizeNote', () => {
    it('should not start a second run while already processing', async () => {
      component.isProcessing = true;
      component.statusText = 'unchanged';
      await component.recognizeNote();
      expect(component.statusText).toBe('unchanged');
    });

    it('should surface an error alert when microphone access fails', async () => {
      spyOn(
        component as unknown as { requestMicrophonePermission(): Promise<void> },
        'requestMicrophonePermission'
      ).and.rejectWith(new Error('Permissão de microfone negada'));

      await component.recognizeNote();

      expect(component.errorAlertOpen).toBeTrue();
      expect(component.errorMessage).toContain('Permissão de microfone negada');
      expect(component.statusText).toContain('Erro ao acessar o microfone');
      expect(component.isProcessing).toBeFalse();
      expect(component.hasMicrophoneAccess).toBeFalse();
    });

    it('should open the sound-detected alert with a positive message when sound is detected', async () => {
      const priv = component as unknown as {
        requestMicrophonePermission(): Promise<void>;
        initAudio(): Promise<void>;
        listenForSound(duration?: number): Promise<boolean>;
        stopAudio(): void;
      };
      spyOn(priv, 'requestMicrophonePermission').and.resolveTo();
      spyOn(priv, 'initAudio').and.resolveTo();
      spyOn(priv, 'listenForSound').and.resolveTo(true);
      spyOn(priv, 'stopAudio');

      await component.recognizeNote();

      expect(component.hasMicrophoneAccess).toBeTrue();
      expect(component.soundDetectedAlertOpen).toBeTrue();
      expect(component.soundDetectedMessage).toContain('Som detectado');
      expect(component.isProcessing).toBeFalse();
    });

    it('should report when no sound is detected', async () => {
      const priv = component as unknown as {
        requestMicrophonePermission(): Promise<void>;
        initAudio(): Promise<void>;
        listenForSound(duration?: number): Promise<boolean>;
        stopAudio(): void;
      };
      spyOn(priv, 'requestMicrophonePermission').and.resolveTo();
      spyOn(priv, 'initAudio').and.resolveTo();
      spyOn(priv, 'listenForSound').and.resolveTo(false);
      spyOn(priv, 'stopAudio');

      await component.recognizeNote();

      expect(component.soundDetectedAlertOpen).toBeTrue();
      expect(component.soundDetectedMessage).toContain('Nenhum som detectado');
    });
  });

  describe('startCommandRecognition', () => {
    let originalSpeech: unknown;
    let originalWebkitSpeech: unknown;
    const win = window as unknown as {
      SpeechRecognition?: unknown;
      webkitSpeechRecognition?: unknown;
    };

    beforeEach(() => {
      originalSpeech = win.SpeechRecognition;
      originalWebkitSpeech = win.webkitSpeechRecognition;
    });

    afterEach(() => {
      win.SpeechRecognition = originalSpeech;
      win.webkitSpeechRecognition = originalWebkitSpeech;
    });

    it('should show an error alert when speech recognition is unsupported', async () => {
      win.SpeechRecognition = undefined;
      win.webkitSpeechRecognition = undefined;

      await component.startCommandRecognition();

      expect(component.errorAlertOpen).toBeTrue();
      expect(component.errorMessage).toContain('não suportado');
      expect(component.isListeningForCommand).toBeFalse();
    });

    it('should configure and start recognition when supported', async () => {
      const instances: FakeSpeechRecognition[] = [];
      class FakeSpeechRecognition {
        lang = '';
        interimResults = true;
        maxAlternatives = 0;
        onresult: ((e: unknown) => void) | null = null;
        onerror: ((e: unknown) => void) | null = null;
        onend: (() => void) | null = null;
        started = false;
        constructor() {
          instances.push(this);
        }
        start() {
          this.started = true;
        }
      }
      win.SpeechRecognition = FakeSpeechRecognition;
      win.webkitSpeechRecognition = undefined;

      await component.startCommandRecognition();

      expect(instances.length).toBe(1);
      const rec = instances[0];
      expect(rec.lang).toBe('pt-BR');
      expect(rec.interimResults).toBeFalse();
      expect(rec.maxAlternatives).toBe(1);
      expect(rec.started).toBeTrue();
      expect(component.isListeningForCommand).toBeTrue();
      expect(component.statusText).toBe('Escutando comando...');
    });

    it('should ignore a second start while already listening', async () => {
      component.isListeningForCommand = true;
      win.SpeechRecognition = undefined;
      win.webkitSpeechRecognition = undefined;

      await component.startCommandRecognition();

      expect(component.errorAlertOpen).toBeFalse();
    });
  });
});
