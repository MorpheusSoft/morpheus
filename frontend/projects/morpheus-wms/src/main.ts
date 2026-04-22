import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { AppComponent } from './app/app.component';

console.log('MORPHEUS WMS: Bootstrapping application...');

bootstrapApplication(AppComponent, appConfig)
  .then(() => console.log('MORPHEUS WMS: Bootstrap successful!'))
  .catch((err) => console.error('MORPHEUS WMS BOOTSTRAP ERROR:', err));
