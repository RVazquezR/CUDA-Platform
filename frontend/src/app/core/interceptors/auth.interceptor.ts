/*******************************************************************************
 * ARCHIVO: auth.interceptor.ts                                                *
 * AUTOR: Raúl Vázquez Rodríguez                                               *
 *                                                                             *
 * DESCRIPCIÓN:                                                                *
 * Interceptor HTTP funcional de Angular encargado de adjuntar el JSON Web     *
 * Token (JWT) a la cabecera de autorización de las peticiones salientes.      *
 * Garantiza que todas las llamadas hacia la API REST vayan correctamente      *
 * autenticadas y firmadas cuando existe una sesión activa en el sistema.      *
 *******************************************************************************/

import { HttpInterceptorFn } from '@angular/common/http'; // Tipo funcional para interceptores HTTP
import { inject } from '@angular/core';                   // Sistema de inyección funcional de Angular
import { AuthService } from '../services/auth.service';   // Servicio encargado de gestionar la sesión

/*
 * Interceptor global de autenticación
 * Captura todas las peticiones HTTP salientes y, si existe una sesión válida, 
 * incorpora automáticamente el JWT dentro de la cabecera Authorization
 */
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  
  // Obtiene acceso al servicio de autenticación
  const authService = inject(AuthService);

  // Recupera el token de sesión almacenado
  const token = authService.getToken();

  // Si existe una credencial válida
  if (token) {

    // Genera una copia de la petición incorporando la cabecera de autorización
    const clonedRequest = req.clone({

      setHeaders: {

        // Firma la petición utilizando el esquema Bearer
        Authorization: `Bearer ${token}`
      }
    });

    // Se cede el control enviando la petición autenticada
    return next(clonedRequest);
  }

  // Si no hay token, la petición continúa sin modificaciones
  return next(req);
};