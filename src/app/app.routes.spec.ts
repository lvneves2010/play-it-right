import { Route } from '@angular/router';
import { routes } from './app.routes';

describe('app routes', () => {
  it('should redirect the empty path to home', () => {
    const emptyRoute = routes.find((r) => r.path === '');
    expect(emptyRoute).toBeDefined();
    expect(emptyRoute?.redirectTo).toBe('home');
    expect(emptyRoute?.pathMatch).toBe('full');
  });

  it('should lazily load the HomePage component for the home path', async () => {
    const homeRoute = routes.find((r) => r.path === 'home') as Route & {
      loadComponent: () => Promise<unknown>;
    };
    expect(homeRoute).toBeDefined();
    expect(typeof homeRoute.loadComponent).toBe('function');

    const loaded = await homeRoute.loadComponent();
    expect(loaded).toBeDefined();
  });
});
