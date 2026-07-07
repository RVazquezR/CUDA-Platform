/*******************************************************************************
 * ARCHIVO: admin-dashboard.component.ts                                       *
 * AUTOR: Raúl Vázquez Rodríguez                                               *
 *                                                                             *
 * DESCRIPCIÓN:                                                                *
 * Componente controlador para el panel de control de administración.          *
 * Gestiona el control de emergencia de pausa y vaciado de la cola, el cierre  *
 * o apertura de registros, la configuración del sistema en tiempo real, la    *
 * visualización de métricas globales y el estado de la cola en tiempo real.    *
 *******************************************************************************/

import { Component, OnInit, inject, signal } from '@angular/core';                      // Decoradores, sistema de señales e inyección de dependencias de Angular
import { CommonModule } from '@angular/common';                                         // Módulo de directivas estructurales básicas
import { Observable } from 'rxjs';                                                      // Tipo Observable utilizado para operaciones reactivas
import { AdminService, DashboardMetrics } from '../../../core/services/admin.service';  // Servicio de administración y tipos de métricas
import { HeaderComponent } from '../../../shared/layouts/header/header.component';      // Componente visual de cabecera
import { SidenavComponent } from '../../../shared/layouts/sidenav/sidenav.component';   // Componente visual del menú lateral de navegación
import { AuthService } from '../../../core/services/auth.service';                      // Servicio de gestión de identidad
import { FormsModule } from '@angular/forms';                                           // Módulo necesario para formularios basados en ngModel

/*
 * Declaración del componente autónomo (Standalone)
 * Vincula la lógica de administración con su plantilla estructural,
 * importando explícitamente las dependencias visuales necesarias
 */
@Component({

  // Selector utilizado por Angular para instanciar el componente
  selector: 'app-admin-dashboard',

  // Define el componente como Standalone
  standalone: true,

  // Dependencias visuales utilizadas dentro de la plantilla HTML
  imports: [CommonModule, FormsModule, HeaderComponent, SidenavComponent],

  // Ruta de la plantilla asociada
  templateUrl: './admin-dashboard.component.html'
})

export class AdminDashboardComponent implements OnInit {

  // Servicio principal encargado de las operaciones administrativas
  private adminService = inject(AdminService);

  // Servicio de autenticación del sistema
  private authService = inject(AuthService);


  /*****************************************************************************
  * ESTADOS REACTIVOS GLOBALES Y DE EMERGENCIA
  *****************************************************************************/

  // Estado reactivo que almacena las métricas globales del sistema
  metrics = signal<DashboardMetrics | null>(null);

  // Indica si las métricas iniciales están siendo cargadas
  isLoading = signal<boolean>(true);
  

  // Bandera para bloqueo de interfaz durante acciones críticas
  isActionLoading = signal<boolean>(false);

  // Estado local sincronizado de la cola de procesamiento
  queueStatus = signal<'running' | 'paused'>('running'); 

  // Canal global de notificaciones para operaciones de emergencia del clúster
  actionMessage = signal<{ type: 'success' | 'error', text: string } | null>(null);

  // Indica si el registro de nuevos usuarios se encuentra habilitado
  isRegistrationEnabled = signal<boolean>(false);


  /*****************************************************************************
  * ESTADOS REACTIVOS DE AUDITORÍA DE CÓDIGO
  *****************************************************************************/

  // Bandera de control de visibilidad para la ventana flotante
  isCodeModalOpen = signal<boolean>(false);
  
  // Almacena temporalmente el código descargado del servidor
  selectedTaskCode = signal<string | null>(null);
  
  // Bloquea la interfaz gráfica mientras se descarga el código desde la API
  isCodeLoading = signal<boolean>(false);
  
  // Identificador de la tarea
  selectedTaskId = signal<number | null>(null);


  /*****************************************************************************
  * VARIABLES DE CONFIGURACIÓN DEL SISTEMA
  *****************************************************************************/

  // Tiempo máximo permitido para la ejecución
  executionTimeoutSeconds = signal<number>(30);
  isSavingTimeout = signal<boolean>(false);
  timeoutMessage = signal<{ type: 'success' | 'error', text: string } | null>(null);

  // Cuota máxima de almacenamiento permitida para cada alumno
  storageQuotaMB = signal<number>(200);
  isSavingStorage = signal<boolean>(false);
  storageMessage = signal<{ type: 'success' | 'error', text: string } | null>(null);

  // Número de ejecuciones simultáneas permitidas por el Worker
  workerConcurrency = signal<number>(1);
  isSavingConcurrency = signal<boolean>(false);
  concurrencyMessage = signal<{ type: 'success' | 'error', text: string } | null>(null);

  // Hora programada y cantidad para la recarga automática de tokens
  tokenResetTime = signal<string>('00:00');
  tokenResetAmount = signal<number>(10);
  isSavingTokenReset = signal<boolean>(false);
  tokenResetMessage = signal<{ type: 'success' | 'error', text: string } | null>(null);

  // Duración máxima de una sesión autenticada expresada en horas
  sessionExpirationHours = signal<number>(8);
  isSavingSession = signal<boolean>(false);
  sessionMessage = signal<{ type: 'success' | 'error', text: string } | null>(null);

  /*
   * Punto de entrada del ciclo de vida del componente
   * Ejecuta la carga inicial de métricas y configuración al montar la vista
   */
  ngOnInit(): void {

    // Solicita las métricas principales
    this.loadMetrics();
    
    // Recupera la configuración global almacenada
    this.loadSystemSettings();
  }

  /*
   * Recupera toda la configuración global del sistema desde el backend
   * y sincroniza las señales reactivas locales del componente
   */
  loadSystemSettings(): void {

    // Solicita la configuración global al backend
    this.adminService.getSystemSettings().subscribe({

      next: (res) => {

        // Extrae el bloque de configuración recibido
        const settings = res.data;
        
        // Recupera el estado del registro de usuarios
        if (settings.registration_enabled) {
          this.isRegistrationEnabled.set(settings.registration_enabled === 'true');
        }

        // Recupera el timeout de ejecución convirtiéndolo a segundos
        if (settings.execution_timeout) {
          this.executionTimeoutSeconds.set(parseInt(settings.execution_timeout, 10) / 1000);
        }

        // Recupera la cuota máxima de almacenamiento
        if (settings.storage_quota_mb) {
          this.storageQuotaMB.set(parseInt(settings.storage_quota_mb, 10));
        }
        
         // Recupera el estado de la cola de procesamiento
        if (settings.queue_status) {
          this.queueStatus.set(settings.queue_status as 'running' | 'paused');
        } else {
          this.queueStatus.set('running'); 
        }
        
        // Recupera la concurrencia configurada para el Worker
        if (settings.worker_concurrency) {
          this.workerConcurrency.set(parseInt(settings.worker_concurrency, 10));
        }
        
        // Recupera la hora programada para el reseteo de tokens
        if (settings.token_reset_time) {
          this.tokenResetTime.set(settings.token_reset_time);
        }

        // Recupera la cantidad de tokens configurados para devolver
        if (settings.token_reset_amount) {
          this.tokenResetAmount.set(parseInt(settings.token_reset_amount, 10));
        }
        
         // Recupera la duración configurada para las sesiones
        if (settings.token_expiration_hours) {
          this.sessionExpirationHours.set(parseInt(settings.token_expiration_hours, 10));
        }
      },

      // Registra el error de lectura de la configuración
      error: (err) => console.error("Error leyendo configuración global", err)
    });
  }

  /*
   * Guarda la nueva duración máxima de las sesiones autenticadas
   * dentro de la configuración global del sistema
   */
  saveSessionExpiration(): void {

    // Evita valores inválidos
    if (this.sessionExpirationHours() < 1) return;

    // Activa el estado visual de guardado
    this.isSavingSession.set(true);

    // Limpia mensajes anteriores
    this.sessionMessage.set(null);
    
    // Envía la nueva configuración al servidor
    this.adminService.updateSessionExpiration(this.sessionExpirationHours()).subscribe({

      next: (res) => {

        // Finaliza el estado de carga
        this.isSavingSession.set(false);

        // Muestra confirmación visual
        this.sessionMessage.set({ type: 'success', text: res.message });

        // Elimina automáticamente el mensaje de confirmación
        setTimeout(() => this.sessionMessage.set(null), 8000);
      },

      error: (err) => {

        // Finaliza el estado de carga
        this.isSavingSession.set(false);

        // Muestra el error recibido
        this.sessionMessage.set({ type: 'error', text: err.error?.message });
      }
    });
  }

  /*
   * Guarda la configuración encargada del reinicio automática de
   * tokens para todos los usuarios del sistema
   */
  saveTokenReset(): void {

    // Impide cantidades negativas de tokens
    if (this.tokenResetAmount() < 0) return;

    // Impide guardar una hora vacía
    if (!this.tokenResetTime()) return;
    
    // Activa el estado visual de guardado
    this.isSavingTokenReset.set(true);

    // Elimina mensajes anteriores
    this.tokenResetMessage.set(null);
    
    // Envía la nueva configuración al servidor
    this.adminService.updateTokenResetSettings(this.tokenResetTime(), this.tokenResetAmount()).subscribe({

      next: (res) => {

        // Finaliza el estado de carga
        this.isSavingTokenReset.set(false);

        // Muestra confirmación visual
        this.tokenResetMessage.set({ type: 'success', text: res.message });

        // Elimina automáticamente el mensaje de confirmación
        setTimeout(() => this.tokenResetMessage.set(null), 5000);
      },

      error: (err) => {

        // Finaliza el estado de carga
        this.isSavingTokenReset.set(false);

        // Muestra el error recibido
        this.tokenResetMessage.set({ type: 'error', text: err.error?.message });
      }
    });
  }

  /*
   * Actualiza el número máximo de tareas que el Worker CUDA puede
   * procesar simultáneamente
   */
  saveWorkerConcurrency(): void {

    // Impide configuraciones inválidas
    if (this.workerConcurrency() < 1) return;

    // Activa el estado visual de guardado
    this.isSavingConcurrency.set(true);

    // Elimina mensajes anteriores
    this.concurrencyMessage.set(null);
    
    // Envía la nueva concurrencia al servidor
    this.adminService.updateWorkerConcurrency(this.workerConcurrency()).subscribe({

      next: (res) => {

        // Finaliza el estado de carga
        this.isSavingConcurrency.set(false);

        // Muestra confirmación visual
        this.concurrencyMessage.set({ type: 'success', text: res.message });

        // Elimina automáticamente el mensaje
        setTimeout(() => this.concurrencyMessage.set(null), 5000);
      },

      error: (err) => {

        // Finaliza el estado de carga
        this.isSavingConcurrency.set(false);

        // Muestra el error recibido
        this.concurrencyMessage.set({ type: 'error', text: err.error?.message });
      }
    });
  }

  /*
   * Guarda la cuota máxima de almacenamiento permitida para los usuarios
   */
  saveStorageQuota(): void {

    // Impide cuotas inválidas
    if (this.storageQuotaMB() < 1) return;

    // Activa el estado visual de guardado
    this.isSavingStorage.set(true);

    // Elimina mensajes anteriores
    this.storageMessage.set(null);
    
    // Envía la nueva cuota al servidor
    this.adminService.updateStorageQuota(this.storageQuotaMB()).subscribe({

      next: (res) => {

        // Finaliza el estado de carga
        this.isSavingStorage.set(false);

        // Muestra confirmación visual
        this.storageMessage.set({ type: 'success', text: res.message });

        // Elimina automáticamente el mensaje
        setTimeout(() => this.storageMessage.set(null), 5000);
      },
      error: (err) => {

        // Finaliza el estado de carga
        this.isSavingStorage.set(false);

        // Muestra el error recibido
        this.storageMessage.set({ type: 'error', text: err.error?.message });
      }
    });
  }

  /*
   * Actualiza el tiempo máximo permitido para la ejecución de tareas CUDA.
   */
  saveExecutionTimeout(): void {

    // Impide valores inválidos
    if (this.executionTimeoutSeconds() < 1) return;

    // Activa el estado visual de guardado
    this.isSavingTimeout.set(true);

    // Elimina mensajes anteriores
    this.timeoutMessage.set(null);
    
    // Envía la nueva configuración al servidor
    this.adminService.updateExecutionTimeout(this.executionTimeoutSeconds()).subscribe({

      next: (res) => {

        // Finaliza el estado de carga
        this.isSavingTimeout.set(false);

        // Muestra confirmación visual
        this.timeoutMessage.set({ type: 'success', text: res.message });

        // Elimina automáticamente el mensaje
        setTimeout(() => this.timeoutMessage.set(null), 5000);
      },
      error: (err) => {

        // Finaliza el estado de carga
        this.isSavingTimeout.set(false);

        // Muestra el error recibido
        this.timeoutMessage.set({ type: 'error', text: err.error?.message });
      }
    });
  }

  /*
   * Alterna el estado global del registro de nuevos usuarios dentro
   * de la plataforma
   */
  toggleRegistration(): void {

    // Calcula el nuevo estado deseado
    const newState = !this.isRegistrationEnabled();

    // Construye el texto mostrado al administrador
    const action = newState ? 'ABRIR' : 'CERRAR';
    
    // Solicita confirmación antes de ejecutar la operación
    if (confirm(`¿Estás seguro de que quieres ${action} el registro de nuevos usuarios?`)) {

      // Activa el estado visual de carga
      this.isActionLoading.set(true);

      // Solicita el cambio al servidor
      this.adminService.toggleRegistrationStatus(newState).subscribe({

        next: (res) => {

          // Finaliza el estado de carga
          this.isActionLoading.set(false);

          // Actualiza el estado local
          this.isRegistrationEnabled.set(newState);

          // Muestra confirmación visual
          this.actionMessage.set({ type: 'success', text: res.message });

          // Elimina automáticamente el mensaje
          setTimeout(() => this.actionMessage.set(null), 5000);
        },
        error: (err) => {

          // Finaliza el estado de carga
          this.isActionLoading.set(false);

          // Muestra el error recibido
          this.actionMessage.set({ type: 'error', text: err.error?.message });
        }
      });
    }
  }


  /*
   * Recupera las métricas globales del sistema para rellenar el panel
   * principal de control del administrador
   */
  loadMetrics(): void {

    // Activa el indicador visual de carga
    this.isLoading.set(true);

    // Solicita las métricas al servidor
    this.adminService.getMetrics().subscribe({

      next: (data: DashboardMetrics) => {

        // Actualiza el estado reactivo
        this.metrics.set(data);

        // Finaliza el estado de carga
        this.isLoading.set(false);
      },
      error: (err: any) => {

        // Registra el error en consola
        console.error('Error cargando métricas:', err);

        // Finaliza el estado de carga
        this.isLoading.set(false);
      }
    });
  }

  /*****************************************************************************
  * CONTROLES DE EMERGENCIA DE LA COLA
  *****************************************************************************/

  /*
   * Solicita la pausa completa del motor de colas BullMQ
   */
  pauseQueue(): void {

    // Solicita confirmación al administrador
    if(confirm('¿Estás seguro de que quieres PAUSAR la cola? Las tareas en la cola quedan en espera.')) {

      // Ejecuta la acción
      this.executeEmergencyAction('pause', () => this.adminService.pauseQueue());
    }
  }

  /*
   * Reanuda el procesamiento de tareas previamente pausado
   */
  resumeQueue(): void {

    // Ejecuta la acción de reanudación
    this.executeEmergencyAction('resume', () => this.adminService.resumeQueue());
  }

  /*
   * Elimina todas las tareas pendientes almacenadas en la colas
   */
  clearQueue(): void {

    // Solicita confirmación
    if(confirm('¿Quieres VACIAR toda la cola? Se cancelarán todas las tareas pendientes y se devolverán los tokens. Esta acción es irreversible.')) {

      // Ejecuta la acción
      this.executeEmergencyAction('clear', () => this.adminService.clearQueue());
    }
  }

  /*
   * Elimina todos los archivos personales de los alumnos
   * Los archivos globales no son eliminados
   */
  cleanupFiles(): void {

    // Solicita confirmación al administrador
    if(confirm('¿Desea eliminar TODOS los archivos personales de los alumnos?\n\n- Liberará espacio en el disco duro.\n- Se mantendrán los archivos globales.\n')) {

      // Ejecuta la acción
      this.executeEmergencyAction('clear', () => this.adminService.cleanupSystemFiles());
    }
  }


  /*
   * Centraliza la ejecución de acciones administrativas críticas sobre la
   * infraestructura, unificando el tratamiento de estados visuales,
   * mensajes de respuesta y errores
   */
  private executeEmergencyAction(actionName: 'pause' | 'resume' | 'clear', actionObservable: () => Observable<any>): void {

    // Activa el indicador visual de procesamiento
    this.isActionLoading.set(true);

    // Elimina mensajes anteriores
    this.actionMessage.set(null);

    // Ejecuta la acción solicitada
    actionObservable().subscribe({

      next: (res: any) => {
      
        // Finaliza el estado de carga
        this.isActionLoading.set(false);

        // Muestra mensaje de confirmación
        this.actionMessage.set({ type: 'success', text: res?.message || 'Acción ejecutada correctamente.' });
        
        // Actualiza el estado visual de la cola si corresponde
        if (actionName === 'pause') this.queueStatus.set('paused');

        // Refleja que el sistema vuelve a procesar tareas
        if (actionName === 'resume') this.queueStatus.set('running');

        // Recarga las métricas tras eliminación de tareas
        if (actionName === 'clear') this.loadMetrics();
        
        // Elimina automáticamente el mensaje tras unos segundos
        setTimeout(() => this.actionMessage.set(null), 5000);
      },
      error: (err: any) => {

        // Finaliza el estado de carga
        this.isActionLoading.set(false);

        // Muestra información detallada del error
        this.actionMessage.set({ type: 'error', text: err?.error?.message || 'Error en el servidor al intentar ejecutar la acción.' });
      }
    });
  }

  /*
   * Relaciona la familia de clases CSS a un estado de ejecución, garantizando 
   * la coherencia visual de la tabla
   */
  getStatusColor(status: string): string {

    // Evalúa el estado ignorando diferencias entre mayúsculas y minúsculas
    switch (status.toLowerCase()) {

      // Estado de ejecución completada correctamente
      case 'completed': return 'text-cuda bg-cuda/10 border-cuda/20';

      // Estado de ejecución finalizada con error
      case 'failed': return 'text-danger bg-danger/10 border-danger/20';

      // Estado de ejecución cancelada
      case 'cancelled': return 'text-warning bg-warning/10 border-warning/20';

      // Estado de tarea en procesamiento
      case 'processing': return 'text-blue-400 bg-blue-400/10 border-blue-400/20';

      // Estado de tarea pendiente en cola
      case 'pending': return 'text-slate-300 bg-surface border-surfaceBorder'

      // Estado por defecto para valores desconocidos
      default: return 'text-slate-300 bg-surface border-surfaceBorder';
    }
  }

  /*
   * Orquesta la apertura de la ventana modal de auditoría
   * Ejecuta una petición HTTP en segundo plano para descargar el código
   * de forma diferida únicamente cuando es requerido
   */
  openCodeModal(taskId: number): void {
    
    // Configura el estado inicial de la ventana modal
    this.selectedTaskId.set(taskId);
    this.isCodeModalOpen.set(true);
    this.isCodeLoading.set(true);
    this.selectedTaskCode.set(null);

    // Solicita el código fuente a la API REST
    this.adminService.getTaskCode(taskId).subscribe({
      next: (code) => {
        
        // Inyecta el código en la vista y finaliza la carga
        this.selectedTaskCode.set(code);
        this.isCodeLoading.set(false);
      },
      error: (err) => {
        
        // Manejo de excepciones visual
        console.error('Error al recuperar el código:', err);
        this.selectedTaskCode.set('No se pudo cargar el código de esta ejecución.');
        this.isCodeLoading.set(false);
      }
    });
  }

  /*
   * Purga el código almacenado en memoria y clausura la ventana modal
   */
  closeCodeModal(): void {
    this.isCodeModalOpen.set(false);
    this.selectedTaskCode.set(null);
    this.selectedTaskId.set(null);
  }
}