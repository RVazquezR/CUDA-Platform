/*******************************************************************************
 * ARCHIVO: main.ts                                                            *
 * AUTOR: Raúl Vázquez Rodríguez                                               *
 *                                                                             *
 * DESCRIPCIÓN:                                                                *
 * Script principal de inicialización (Bootstrap) de Angular.                  *
 * Orquesta el arranque de la aplicación compilando el componente raíz e       *
 * inyectando la configuración global definida para la arquitectura Standalone.*
 *******************************************************************************/

import { bootstrapApplication } from '@angular/platform-browser'; // Función encargada de inicializar aplicaciones Angular Standalone
import { appConfig } from './app/app.config';                     // Configuración global de la aplicación
import { App } from './app/app';                                  // Componente raíz de la aplicación

/*
 * Inicializa la aplicación Angular utilizando el componente raíz y la 
 * configuración global definida en app.config.ts
 */
bootstrapApplication(App, appConfig)

  // Captura errores producidos durante el proceso de arranque
  .catch((err) => console.error(err));
