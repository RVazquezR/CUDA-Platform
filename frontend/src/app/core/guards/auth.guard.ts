/*******************************************************************************
 * ARCHIVO: auth.guard.ts                                                      *
 * AUTOR: Raúl Vázquez Rodríguez                                               *
 *                                                                             *
 * DESCRIPCIÓN:                                                                *
 * Guardianes de ruta funcionales de Angular para la protección de             *
 * la navegación en el cliente. Interceptan las transiciones de vista para     *
 * verificar la autenticación, los roles de administrador y los flujos de      *
 * cambio de contraseña obligatorio.                                           *
 *******************************************************************************/

import { inject } from '@angular/core';                   // Inyección funcional de dependencias de Angular
import { CanActivateFn, Router } from '@angular/router';  // Tipos y utilidades del sistema de navegación
import { AuthService } from '../services/auth.service';   // Servicio de autenticación

/*
 * Guardia principal de autenticación
 * Verifica que exista una sesión válida antes de permitir
 * el acceso a cualquier ruta protegida de la plataforma
 */
export const authGuard: CanActivateFn = (route, state) => {

  // Obtiene acceso al servicio de autenticación
  const authService = inject(AuthService);

  // Obtiene acceso al sistema de rutas de navegación
  const router = inject(Router);

  // Recupera el usuario actualmente autenticado
  const user = authService.currentUser();

  // Comprueba si existe un token de sesión almacenado
  if (authService.getToken()) {

    // Si tiene cambio forzado y no está en la vista de cambio
    if (user?.force_password_change && state.url !== '/auth/force-change') {

      // Interrumpe navegación y redirige al formulario de cambio de contraseña
      return router.createUrlTree(['/auth/force-change']);
    }

    // Evita el acceso manual si no se tiene la bandera activa
    if (!user?.force_password_change && state.url === '/auth/force-change') {

      // Lo devuelve automáticamente a su espacio de trabajo
      return router.createUrlTree(['/workspace']);
    }

    // La autenticación es válida y puede continuar
    return true; 
  }

  // Si no existe sesión activa redirige al login
  return router.createUrlTree(['/login']);
};

/*
 * Guardia de autorización de administración
 * Añade una segunda capa de protección verificando que el usuario tenga
 * privilegios de administrador
 */
export const adminGuard: CanActivateFn = (route, state) => {

  // Obtiene acceso al servicio de autenticación
  const authService = inject(AuthService);

   // Obtiene acceso al sistema de rutas de navegación
  const router = inject(Router);
  
  // Recupera la identidad del usuario actual
  const user = authService.currentUser();

  // Verifica que exista sesión y que el rol sea administrador
  if (user && user.role === 'admin') {

    // Autoriza el acceso
    return true;
  }

  // Si no es administrador se le devuelve a su entorno permitido
  router.navigate(['/workspace']);

  // Deniega la navegación
  return false;
};