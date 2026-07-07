/*******************************************************************************
 * ARCHIVO: header.component.ts                                                *
 * AUTOR: Raúl Vázquez Rodríguez                                               *
 *                                                                             *
 * DESCRIPCIÓN:                                                                *
 * Componente responsable de mostrar la cabecera principal de la aplicación.   *
 * Permite acceder a información de sesión del usuario autenticado y           *
 * gestionar el cierre de sesión.                                              *
 ******************************************************************************/

import { Component, inject } from '@angular/core';                  // Decoradores e inyección de dependencias de Angular
import { CommonModule } from '@angular/common';                     // Directivas estructurales básicas de Angular
import { AuthService } from '../../../core/services/auth.service';  // Servicio encargado de la autenticación y gestión de sesión
import { Router } from '@angular/router';                           // Servicio utilizado para la navegación entre vistas

/*
 * Declaración del componente autónomo (Standalone) encargado de mostrar 
 * la cabecera principal de la plataforma
 */
@Component({

  // Selector utilizado por Angular para instanciar el componente
  selector: 'app-header',

  // Define el componente como Standalone
  standalone: true,

  // Dependencias utilizadas dentro de la plantilla
  imports: [CommonModule],

  // Ruta de la plantilla HTML asociada
  templateUrl: './header.component.html'
})

export class HeaderComponent {

  // Servicio de autenticación utilizado para acceder al usuario actual
  authService = inject(AuthService);

  // Servicio encargado de la navegación entre rutas
  private router = inject(Router);

  /*
   * Finaliza la sesión activa del usuario y redirige automáticamente al login
   */
  logout() {

    // Elimina la sesión almacenada y limpia el estado de autenticación
    this.authService.logout();

    // Navega hacia el login
    this.router.navigate(['/login']);
  }
}