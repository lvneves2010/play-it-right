import { Injectable } from '@angular/core';
import voiceCommandsData from './voice-commands.json';
import pkg from '../../../package.json';

export interface VoiceCommandMatch {
  response: string;
  speak: boolean;
  /** Set when the response requires async/native work the caller must handle (e.g. weather). */
  requiresAsyncHandling?: 'weather';
}

interface VoiceCommandEntry {
  id: string;
  patterns: string[];
  response: string;
  speak?: boolean;
  dynamic?: 'time' | 'date' | 'weekday' | 'tomorrow' | 'yesterday' | 'version' | 'weather';
}

const WEEKDAYS = [
  'domingo',
  'segunda-feira',
  'terça-feira',
  'quarta-feira',
  'quinta-feira',
  'sexta-feira',
  'sábado',
];

const MONTHS = [
  'janeiro',
  'fevereiro',
  'março',
  'abril',
  'maio',
  'junho',
  'julho',
  'agosto',
  'setembro',
  'outubro',
  'novembro',
  'dezembro',
];

const FALLBACK_RESPONSE: VoiceCommandMatch = { response: 'Desculpe, não entendi', speak: true };

@Injectable({ providedIn: 'root' })
export class VoiceCommandsService {
  private readonly commands = voiceCommandsData as VoiceCommandEntry[];

  match(normalized: string): VoiceCommandMatch {
    const words = normalized.split(' ').filter(Boolean);
    const entry = this.commands.find(command => command.patterns.some(pattern => this.containsPhrase(words, pattern)));

    if (!entry) {
      return FALLBACK_RESPONSE;
    }

    if (entry.dynamic === 'weather') {
      return { response: '', speak: entry.speak ?? true, requiresAsyncHandling: 'weather' };
    }

    return { response: this.resolveResponse(entry), speak: entry.speak ?? true };
  }

  // Casa por sequência de palavras inteiras, não por substring bruta:
  // "desliga a luz" não pode acidentalmente casar com o padrão "liga a luz".
  private containsPhrase(words: string[], pattern: string): boolean {
    const patternWords = pattern.split(' ').filter(Boolean);
    if (patternWords.length === 0 || patternWords.length > words.length) {
      return false;
    }

    for (let start = 0; start <= words.length - patternWords.length; start++) {
      const matches = patternWords.every((word, offset) => words[start + offset] === word);
      if (matches) {
        return true;
      }
    }

    return false;
  }

  private resolveResponse(entry: VoiceCommandEntry): string {
    const now = new Date();

    switch (entry.dynamic) {
      case 'time': {
        const hours = now.getHours().toString().padStart(2, '0');
        const minutes = now.getMinutes().toString().padStart(2, '0');
        return `Agora são ${hours} horas e ${minutes} minutos.`;
      }
      case 'date':
        return `Hoje é dia ${this.formatDate(now)}.`;
      case 'weekday':
        return `Hoje é ${WEEKDAYS[now.getDay()]}.`;
      case 'tomorrow': {
        const tomorrow = new Date(now);
        tomorrow.setDate(now.getDate() + 1);
        return `Amanhã será dia ${this.formatDate(tomorrow)}.`;
      }
      case 'yesterday': {
        const yesterday = new Date(now);
        yesterday.setDate(now.getDate() - 1);
        return `Ontem foi dia ${this.formatDate(yesterday)}.`;
      }
      case 'version':
        return `Estou na versão ${pkg.version} do aplicativo.`;
      default:
        return entry.response;
    }
  }

  private formatDate(date: Date): string {
    return `${date.getDate()} de ${MONTHS[date.getMonth()]} de ${date.getFullYear()}`;
  }
}
