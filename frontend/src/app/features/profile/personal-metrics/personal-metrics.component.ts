/*******************************************************************************
 * ARCHIVO: personal-metrics.component.ts                                      *
 * AUTOR: Raúl Vázquez Rodríguez                                               *
 *                                                                             *
 * DESCRIPCIÓN:                                                                *
 * Componente encargado de visualizar las métricas personales del usuario.     *
 * Permite consultar al usuario las estadísticas de sus ejecuciones y el       *
 * consumo de almacenamiento.                                                  *
 *******************************************************************************/

import { Component, OnInit, inject, signal, computed } from '@angular/core';          // Primitivas reactivas y del ciclo de vida de Angular
import { CommonModule } from '@angular/common';                                       // Directivas estructurales básicas de Angular
import { UserService, AdvancedMetrics } from '../../../core/services/user.service';   // Capa de servicios y tipados del usuario
import { HeaderComponent } from '../../../shared/layouts/header/header.component';    // Componente visual de cabecera
import { SidenavComponent } from '../../../shared/layouts/sidenav/sidenav.component'; // Componente visual del menú lateral de navegación

/*
 * Declaración del componente autónomo (Standalone) encargado
 * de mostrar las estadísticas personales del usuario.
 */
@Component({

  // Selector utilizado por Angular para instanciar el componente
  selector: 'app-personal-metrics',

  // Define el componente como Standalone
  standalone: true,

  // Dependencias visuales utilizadas por la plantilla
  imports: [CommonModule, HeaderComponent, SidenavComponent],

  // Ruta de la plantilla HTML asociada
  templateUrl: './personal-metrics.component.html'
})

export class PersonalMetricsComponent implements OnInit {

  // Servicio encargado de recuperar las métricas personales
  private userService = inject(UserService);

  

  // Almacena las métricas avanzadas recuperadas desde el backend
  metrics = signal<AdvancedMetrics | null>(null);

  // Indica si la información está siendo cargada
  isLoading = signal<boolean>(true);



  /*
   * Determina si el usuario ha superado la cuota máxima de almacenamiento
   * configurada por el sistema
   */
  isQuotaExceeded = computed(() => {

    // Recupera el espacio actualmente utilizado
    const used = this.metrics()?.storage.total_bytes || 0;

    // Recupera la cuota máxima configurada
    const quotaMB = this.metrics()?.quotaMB || 200;

    // Compara el espacio utilizado y el límite permitido
    return used > (quotaMB * 1024 * 1024);
  });

  /*
   * Punto de entrada del ciclo de vida del componente
   * Recupera las métricas personales del usuario autenticado
   */
  ngOnInit() {

    // Solicita las métricas al backend
    this.userService.getMetrics().subscribe({

      next: (res) => {

        // Actualiza el estado reactivo con los datos recibidos
        this.metrics.set(res.data);

        // Finaliza el estado de carga
        this.isLoading.set(false);
      },
      error: (err) => {

        // Registra el error
        console.error(err);

        // Finaliza el estado de carga
        this.isLoading.set(false);
      }
    });
  }

  /*
   * Calcula el porcentaje de ejecuciones completadas con éxito
   * respecto al total de ejecuciones realizadas
   */
  getSuccessRate(): number {

    // Recupera las estadísticas de ejecución
    const stats = this.metrics()?.executions;

    // Evita divisiones entre cero
    if (!stats || stats.total === 0) return 0;

    // Calcula el porcentaje de éxito
    return Math.round((stats.completed / stats.total) * 100);
  }

  /*
   * Convierte una cantidad expresada en bytes a megabytes
   * utilizando dos decimales de precisión
   */
  formatMB(bytes: number): string {

    // Devuelve el valor convertido a megabytes
    return (bytes / 1024 / 1024).toFixed(2);
  }
  
  /*
   * Calcula el porcentaje de almacenamiento usado respecto
   * a la cuota máxima configurada por el administrador
   */
  getStoragePercentage(): number {

    // Recupera el espacio utilizado actualmente
    const used = this.metrics()?.storage.total_bytes || 0;
    
    // Recupera la cuota máxima configurada 
    const quotaMB = this.metrics()?.quotaMB || 200; 

    // Convierte la cuota a bytes
    const totalBytes = quotaMB * 1024 * 1024;
    
    // Evita divisiones entre cero
    if (totalBytes === 0) return 0;

    // Devuelve el porcentaje limitado a un máximo del 100%
    return Math.min(Math.round((used / totalBytes) * 100), 100);
  }
}