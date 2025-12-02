import { bootstrapApplication } from '@angular/platform-browser';
import { App } from './app/app.component'; // Importeer de App class uit de nieuwe locatie

bootstrapApplication(App)
  .catch((err) => console.error(err));
