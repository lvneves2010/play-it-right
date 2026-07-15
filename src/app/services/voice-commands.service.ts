import { Injectable } from '@angular/core';
import voiceCommandsData from './voice-commands.json';

export interface VoiceCommandMatch {
  response: string;
  speak: boolean;
}

interface VoiceCommandEntry {
  id: string;
  patterns: string[];
  response: string;
  speak?: boolean;
  dynamic?: 'time' | 'date' | 'weekday';
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
    const entry = this.commands.find(command => command.patterns.some(pattern => normalized.includes(pattern)));

    if (!entry) {
      return FALLBACK_RESPONSE;
    }

    return { response: this.resolveResponse(entry), speak: entry.speak ?? true };
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
        return `Hoje é dia ${now.getDate()} de ${MONTHS[now.getMonth()]} de ${now.getFullYear()}.`;
      case 'weekday':
        return `Hoje é ${WEEKDAYS[now.getDay()]}.`;
      default:
        return entry.response;
    }
  }
}
