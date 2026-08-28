import { Component } from '@angular/core';
import { Logo } from '../logo/logo';

@Component({
  selector: 'app-loader',
  imports: [Logo],
  templateUrl: './loader.html',
  styleUrl: './loader.scss',
})
export class Loader {}
