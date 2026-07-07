/*******************************************************************************
 * ARCHIVO: sidenav.component.ts                                               *
 * AUTOR: Raúl Vázquez Rodríguez                                               *
 *                                                                             *
 * DESCRIPCIÓN:                                                                *
 * Componente responsable de mostrar el menú lateral de navegación de la       *
 * plataforma. Proporciona acceso a las distintas secciones de la aplicación   *
 * y adapta las opciones disponibles en función del usuario autenticado.       *
 *******************************************************************************/

import { Component, inject } from '@angular/core';                  // Decoradores e inyección de dependencias de Angular
import { CommonModule } from '@angular/common';                     // Directivas estructurales básicas de Angular
import { RouterModule } from '@angular/router';                     // Directivas de enrutamiento y navegación visual
import { AuthService } from '../../../core/services/auth.service';  // Servicio encargado de la autenticación y gestión de sesión

/*
 * Declaración del componente autónomo (Standalone) encargado de mostrar
 * el menú lateral de navegación
 */
@Component({

  // Selector utilizado por Angular para instanciar el componente
  selector: 'app-sidenav',

  // Define el componente como Standalone
  standalone: true,

  // Dependencias utilizadas dentro de la plantilla
  imports: [CommonModule, RouterModule],

  // Ruta de la plantilla HTML asociada
  templateUrl: './sidenav.component.html'
})
export class SidenavComponent {

  // Servicio de autenticación utilizado para acceder al usuario y adaptar 
  // las opciones visibles del menú
  authService = inject(AuthService);
}