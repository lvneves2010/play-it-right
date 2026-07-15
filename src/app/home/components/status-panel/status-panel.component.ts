import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonIcon } from '@ionic/angular/standalone';

@Component({
  selector: 'app-status-panel',
  standalone: true,
  imports: [CommonModule, IonIcon],
  templateUrl: './status-panel.component.html',
  styleUrls: ['./status-panel.component.scss'],
})
export class StatusPanelComponent {
  @Input() statusText = '';
  @Input() recognizedNote: string | null = null;
  @Input() recognizedCommand: string | null = null;
  @Input() commandResponse: string | null = null;
  @Input() canSave = false;

  @Output() save = new EventEmitter<void>();
}
