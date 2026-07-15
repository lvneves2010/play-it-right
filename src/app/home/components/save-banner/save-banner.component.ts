import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-save-banner',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './save-banner.component.html',
  styleUrls: ['./save-banner.component.scss'],
})
export class SaveBannerComponent {
  @Input() visible = false;
  @Input() listening = false;
}
