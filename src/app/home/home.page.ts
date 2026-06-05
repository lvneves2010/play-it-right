import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  IonHeader,
  IonToolbar,
  IonTitle,
  IonContent,
  IonButton,
} from '@ionic/angular/standalone';

@Component({
  selector: 'app-home',
  templateUrl: 'home.page.html',
  styleUrls: ['home.page.scss'],
  imports: [CommonModule, IonHeader, IonToolbar, IonTitle, IonContent, IonButton],
})
export class HomePage {
  isProcessing = false;
  recognizedNote: string | null = null;
  statusText = 'Pronto para reconhecer uma nota';

  private audioContext?: AudioContext;
  private analyser?: AnalyserNode;
  private stream?: MediaStream;

  async recognizeNote() {
    if (this.isProcessing) {
      return;
    }

    this.recognizedNote = null;
    this.statusText = 'Aguardando som...';
    this.isProcessing = true;

    try {
      await this.initAudio();
      this.statusText = 'Escutando... toque a nota agora';
      await this.wait(1800);

      const frequency = this.getCurrentFrequency();
      if (frequency > 0) {
        this.recognizedNote = this.getNoteName(frequency);
        this.statusText = `Nota detectada: ${this.recognizedNote}`;
      } else {
        this.statusText = 'Não foi possível detectar uma nota clara. Tente novamente.';
      }
    } catch (error) {
      this.statusText = 'Erro ao acessar o microfone ou capturar o som.';
      console.error(error);
    } finally {
      this.stopAudio();
      this.isProcessing = false;
    }
  }

  private async initAudio() {
    if (this.audioContext && this.stream) {
      return;
    }

    this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    this.audioContext = new AudioContext();
    const source = this.audioContext.createMediaStreamSource(this.stream);
    this.analyser = this.audioContext.createAnalyser();
    this.analyser.fftSize = 2048;
    source.connect(this.analyser);
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
