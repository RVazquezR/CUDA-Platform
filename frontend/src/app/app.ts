/*******************************************************************************
 * ARCHIVO: app.ts                                                             *
 * AUTOR: Raúl Vázquez Rodríguez                                               *
 *                                                                             *
 * DESCRIPCIÓN:                                                                *
 * Componente raíz de la aplicación Angular. Actúa como el contenedor de más   *
 * alto nivel en el Document Object Model (DOM), sirviendo como punto de       *
 * anclaje para el motor de enrutamiento y el montaje dinámico del resto del   *
 * árbol de componentes.                                                       *
 *******************************************************************************/

import { Component, signal } from '@angular/core';  // Decoradores y utilidades reactivas del núcleo de Angular
import { RouterOutlet } from '@angular/router';     // Directiva estructural para la proyección dinámica de rutas

/*
 * Declaración del componente raiz de la plataforma
 * Gestiona el marco estructural inyectando directamente las dependencias
 * necesarias para la navegación (Standalone Architecture)
 */
@Component({

  // Selector principal utilizado por Angular para montar toda la aplicación 
  // dentro del index.html
  selector: 'app-root',

  // Dependencias utilizadas dentro de la plantilla
  imports: [RouterOutlet],

  // Ruta de la plantilla HTML asociada
  templateUrl: './app.html',

  // Hoja de estilos específica del componente raíz
  styleUrl: './app.scss'
})

export class App {

  /*
   * Señal reactiva utilizada para almacenar el nombre interno de la aplicación
   */
  protected readonly title = signal('frontend');
}
