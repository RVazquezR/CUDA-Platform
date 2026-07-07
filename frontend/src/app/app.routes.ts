/*******************************************************************************
 * ARCHIVO: app.routes.ts                                                      *
 * AUTOR: Raúl Vázquez Rodríguez                                               *
 *                                                                             *
 * DESCRIPCIÓN:                                                                *
 * Archivo central de definición de rutas de la aplicación. Establece la       *
 * correspondencia entre las URLs accesibles por el usuario y los componentes  *
 * que Angular debe cargar dinámicamente. También define los mecanismos de     *
 * protección mediante Guards para controlar el acceso según el estado de      *
 * autenticación y el rol del usuario.                                         *
 *******************************************************************************/

import { Routes } from '@angular/router';                         // Tipo utilizado por Angular para definir la tabla de rutas
import { authGuard, adminGuard } from './core/guards/auth.guard'; // Guards para proteger rutas autenticadas y de administrador

/* 
 * Tabla principal de rutas de la aplicación
 * Cada entrada asocia una URL con un componente específico
 */
export const routes: Routes = [

  /*****************************************************************************
   * RUTAS PÚBLICAS
   * Accesibles sin token de sesión. Gestionan la entrada a la plataforma
   *****************************************************************************/

  /*
   * Ruta raíz
   * Redirige al formulario de inicio de sesión
   */
  { 
    path: '', 
    redirectTo: 'login', 
    pathMatch: 'full' 
  },

  /*
   * Pantalla de autenticación de usuarios
   */
  { 
    path: 'login', 
    // Lazy loading: El código del componente solo se descarga del servidor si el usuario navega a esta ruta
    loadComponent: () => import('./features/auth/login/login.component').then(m => m.LoginComponent) 
  },

  /*
   * Pantalla de registro de nuevos usuarios
   */
  { 
    path: 'register', 
    loadComponent: () => import('./features/auth/register/register.component').then(m => m.RegisterComponent) 
  },

  /*****************************************************************************
   * RUTAS DE ESTUDIANTE
   * Requieren la validación del authGuard (Token JWT válido)
   *****************************************************************************/

  /*
   * Pantalla para el cambio de contraseña temporal a una definitiva
   */
  { 
    path: 'auth/force-change', 
    loadComponent: () => import('./features/auth/force-change/force-change.component').then(m => m.ForceChangeComponent),
    // Protección mediante autenticación
    canActivate: [authGuard] 
  },
  
  /*
   * Espacio principal de trabajo de la plataforma
   */
  {
    path: 'workspace',
    loadComponent: () => import('./features/workspace/workspace-layout/workspace-layout.component').then(m => m.WorkspaceLayoutComponent),
    canActivate: [authGuard]
  },

  /*
   * Pantalla del perfil del usuario
   */
  { 
    path: 'profile', 
    loadComponent: () => import('./features/profile/profile-settings/profile-settings.component').then(m => m.ProfileSettingsComponent),
    canActivate: [authGuard] 
  },

  /*
   * Panel de métricas personales del usuario
   */
  { 
    path: 'metrics', 
    loadComponent: () => import('./features/profile/personal-metrics/personal-metrics.component').then(m => m.PersonalMetricsComponent),
    canActivate: [authGuard] 
  },

  /*****************************************************************************
   * RUTAS DE ADMINISTRACIÓN
   * Requieren estar autenticado (authGuard) y ser admin (adminGuard)
   *****************************************************************************/

  /*
   * Panel principal de administración del sistema
   */
  { 
    path: 'admin/dashboard', 
    loadComponent: () => import('./features/admin/admin-dashboard/admin-dashboard.component').then(m => m.AdminDashboardComponent),
    // Protección mediante autenticación y rol administrador
    canActivate: [authGuard, adminGuard] 
  },

  /*
   * Panel de gestión de usuarios
   */
  { 
    path: 'admin/users', 
    loadComponent: () => import('./features/admin/user-management/user-management.component').then(m => m.UserManagementComponent),
    canActivate: [authGuard, adminGuard]
  },

  /*
   * Panel de gestión de recursos globales
   */
  { 
    path: 'admin/resources', 
    loadComponent: () => import('./features/admin/global-resources/global-resources.component').then(m => m.GlobalResourcesComponent),
    canActivate: [authGuard, adminGuard] 
  },


  
  /*
   * Captura cualquier URL inexistente y redirige al login
   */
  { path: '**', redirectTo: 'login' }
];