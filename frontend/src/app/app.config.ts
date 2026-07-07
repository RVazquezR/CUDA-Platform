/*******************************************************************************
 * ARCHIVO: app.config.ts                                                      *
 * AUTOR: Raúl Vázquez Rodríguez                                               *
 *                                                                             *
 * DESCRIPCIÓN:                                                                *
 * Archivo de configuración global para el arranque (bootstrap) de la          *
 * aplicación Angular bajo la arquitectura Standalone. Registra los            *
 * proveedores globales de la aplicación, incluyendo el sistema de rutas,      *
 * el cliente HTTP y los interceptores.                                        *
 *******************************************************************************/

import { ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';  // Primitivas de configuración global de Angular
import { provideRouter } from '@angular/router';                                        // Proveedor del motor de navegación
import { provideHttpClient, withInterceptors } from '@angular/common/http';             // Proveedor del cliente HTTP nativo y orquestador de interceptores
import { routes } from './app.routes';                                                  // Árbol estructural que define las rutas de la aplicación
import { authInterceptor } from './core/interceptors/auth.interceptor';                 // Interceptor encargado de inyectar el JWT

/*
 * Configuración global de la aplicación Angular.
 * Registra los servicios y configuraciones singleton que gobernarán el
 * comportamiento de la plataforma desde su inicialización en el navegador
 */
export const appConfig: ApplicationConfig = {

  // Registro centralizado de servicios globales
  providers: [

    // Habilita la captura global de errores no controlados producidos 
    // en tiempo de ejecución dentro del navegador
    provideBrowserGlobalErrorListeners(),

    // Registra el sistema de enrutamiento utilizando la tabla de rutas 
    // definida en app.routes.ts
    provideRouter(routes),
    
    // Registra el cliente HTTP e inyecta el interceptor de autenticación 
    // en todas las peticiones salientes
    provideHttpClient(withInterceptors([authInterceptor]))
  ]
};



