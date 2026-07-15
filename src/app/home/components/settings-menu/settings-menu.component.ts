import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  IonMenu,
  IonHeader,
  IonToolbar,
  IonTitle,
  IonContent,
  IonList,
  IonListHeader,
  IonItem,
  IonLabel,
  IonButton,
} from '@ionic/angular/standalone';

@Component({
  selector: 'app-settings-menu',
  standalone: true,
  imports: [
    CommonModule,
    IonMenu,
    IonHeader,
    IonToolbar,
    IonTitle,
    IonContent,
    IonList,
    IonListHeader,
    IonItem,
    IonLabel,
    IonButton,
  ],
  templateUrl: './settings-menu.component.html',
  styleUrls: ['./settings-menu.component.scss'],
})
export class SettingsMenuComponent {
  @Input() isProcessing = false;
  @Input() micTestStatus = '';

  @Output() testMicrophone = new EventEmitter<void>();
}
