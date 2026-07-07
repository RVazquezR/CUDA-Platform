/*******************************************************************************
 * ARCHIVO: code-editor.component.ts                                           *
 * AUTOR: Raúl Vázquez Rodríguez                                               *
 *                                                                             *
 * DESCRIPCIÓN:                                                                *
 * Componente encargado de la edición, ejecución y monitorización de código    *
 * CUDA. Gestiona la comunicación en tiempo real con el backend, la            *
 * recuperación de ejecuciones, el control de tokens y la visualización de     *
 * resultados en la consola interactiva.                                       *
 *******************************************************************************/

import { 
  Component, inject, signal, OnInit, OnDestroy, ViewChild, ElementRef, 
  AfterViewChecked, HostListener, effect, computed 
} from '@angular/core';                                                 // Decoradores, señales reactivas, efectos e interfaces del ciclo de vida
import { CommonModule } from '@angular/common';                         // Directivas estructurales básicas de Angular
import { FormsModule } from '@angular/forms';                           // Herramientas para formularios basados en ngModel
import { CudaService } from '../../../core/services/cuda.service';      // Servicio encargado de la ejecución CUDA
import { SocketService } from '../../../core/services/socket.service';  // Servicio de comunicación en tiempo real
import { AuthService } from '../../../core/services/auth.service';       // Servicio encargado de la autenticación

/*
 * Define la estructura de una línea mostrada dentro de la consola
 */
interface ConsoleLine {

  // Tipo visual asociado al mensaje
  type: 'info' | 'success' | 'error' | 'stdout' | 'stderr' | 'warning';

  // Contenido textual del mensaje
  text: string;

  // Fecha y hora de generación
  timestamp: Date;
}

/*
 * Declaración del componente autónomo (Standalone) encargado
 * de la edición y ejecución de código CUDA
 */
@Component({

  // Selector utilizado por Angular para instanciar el componente
  selector: 'app-code-editor',

  // Define el componente como Standalone
  standalone: true,

  // Dependencias utilizadas por la plantilla
  imports: [CommonModule, FormsModule],

   // Ruta de la plantilla HTML asociada
  templateUrl: './code-editor.component.html',

  // Hoja de estilos específica del componente
  styleUrls: ['./code-editor.component.scss']
})

export class CodeEditorComponent implements OnInit, OnDestroy, AfterViewChecked {

  // Servicio encargado de las operaciones CUDA
  private cudaService = inject(CudaService);

  // Servicio encargado de la comunicación mediante WebSockets
  private socketService = inject(SocketService);

  // Servicio encargado de la autenticación
  private authService = inject(AuthService);

  // Referencia al contenedor visual de la consola
  @ViewChild('consoleContainer') private consoleContainer!: ElementRef;

  /*****************************************************************************
   * ESTADOS REACTIVOS
   *****************************************************************************/

  // Código fuente introducido por el usuario
  code = signal<string>('');

  // Indica si existe una ejecución en curso
  isExecuting = signal<boolean>(false);

  // Indica si existe una recuperación histórica en curso
  isRecovering = signal<boolean>(false);

  // Tiempo restante para permitir una nueva recuperación
  recoveryCooldown = signal<number>(0);

  // Identificador de la tarea actualmente asociada
  currentTaskId = signal<string | null>(null);

  // Almacena la salida por consola
  consoleOutput = signal<ConsoleLine[]>([]);

  // Número de tokens disponibles para el usuario
  availableTokens = signal<number | null>(null);

  // Determina si el usuario autenticado posee privilegios administrativos
  isAdmin = computed(() => this.authService.currentUser()?.role === 'admin');


  /*****************************************************************************
   * CONFIGURACIÓN DEL EDITOR
   *****************************************************************************/

  // Altura del editor en píxeles
  editorHeight = signal<number>(450);

  // Indica si el usuario está redimensionando el editor
  private isResizing = false;

  constructor() {

    /*
     * Guarda automáticamente el contenido del editor cada vez que se produce 
     * una modificación
     */
    effect(() => {
      const currentCode = this.code();
      if (currentCode) {
        sessionStorage.setItem('cuda_editor_content', currentCode);
      }
    });
  }

  /*
   * Punto de entrada del ciclo de vida del componente.
   * Inicializa la conexión, recupera los datos y registra los 
   * eventos de tiempo real
   */
  ngOnInit() {

    // Recupera el último código almacenado localmente
    const savedCode = sessionStorage.getItem('cuda_editor_content');
    
    if (savedCode) {

      // Restaura el contenido previamente guardado
      this.code.set(savedCode);

    } else {
      // Código por defecto
      this.code.set(`#include <iostream>

__global__ void helloCuda() {
    printf("¡Hola desde el Hilo %d de la GPU CUDA!\\n", threadIdx.x);
}

int main() {
    std::cout << "Iniciando motor CUDA..." << std::endl;
    
    // Lanzamos 1 bloque con 5 hilos
    helloCuda<<<1, 5>>>();
    
    // Esperamos a que la GPU termine
    cudaDeviceSynchronize();
    
    std::cout << "Ejecución completada." << std::endl;
    return 0;
}`
      );
    }


    // Establece la conexión WebSocket
    this.socketService.connect();

    // Actualiza los tokens disponibles
    this.refreshTokens();

    /*
     * Comprueba si existe alguna tarea activa pendiente
     */
    this.cudaService.getActiveTask().subscribe({
      next: (res) => {

        // Verifica que el backend ha devuelto una tarea
        if (res.data && res.data.taskId) {
          
          // Restaura el identificador de la tarea recuperada
          this.currentTaskId.set(res.data.taskId);

          // Reactiva el estado visual de ejecución
          this.isExecuting.set(true);
          
          // Avisa al usuario
          const statusText = res.data.status === 'processing' ? 'Procesando en GPU' : 'En Cola';
          this.printToConsole(`[SISTEMA] Sesión recuperada. Reconectando con la Tarea #${res.data.taskId} (${statusText})...`, 'info');
        }
      },

      // Errores producidos durante el proceso de recuperación
      error: (err) => console.error('Error en el Auto-Recovery:', err)
    });

    /*
     * Escucha el evento de pausar la cola de ejecución
     */
    this.socketService.listen<any>('queue_paused').subscribe(data => {
      this.printToConsole(`[SISTEMA] ${data.message}`, 'error');
    });

    /*
     * Escucha el evento de reanudar la cola de ejecución
     */
    this.socketService.listen<any>('queue_resumed').subscribe(data => {
      this.printToConsole(`[SISTEMA] ${data.message}`, 'success');
    });

    /*
     * Escucha el evento de cambio de estado de una tarea
     */
    this.socketService.listen<any>('task_updated').subscribe(data => {

      // Solo la tarea actualmente monitorizada
      if (data.taskId === this.currentTaskId()) {

        // Recupera el mensaje recibido
        const msg = data.message || `Estado: ${data.status.toUpperCase()}`;
        this.printToConsole(`[SISTEMA] ${msg}`, 'info');
      }
    });

    /*
     * Escucha el evento de finalización de una tarea
     */
    this.socketService.listen<any>('task_completed').subscribe(data => {

      // Solo la tarea actualmente monitorizada
      if (data.taskId === this.currentTaskId()) {

        // Muestra la salida estándar generada
        if (data.stdout) {
           this.printToConsole(`\n${data.stdout.trim()}`, 'stdout'); 
        }
        
        // Muestra la salida de errores generada
        if (data.stderr) {
           this.printToConsole(`\n${data.stderr.trim()}`, 'stderr');
        }

        // Determina el color visual asociado al resultado final
        const statusColor = data.status === 'completed' ? 'success' : 'error';

        // Almacena el mensaje final mostrado al usuario
        let finalMessage = '';

        // Determina el mensaje final en función del resultado de la ejecución
        if (data.status === 'completed') {

          // Ejecución finalizada correctamente
            finalMessage = '[FINALIZADO] Ejecución completada sin errores.';

        } else if (data.status === 'cancelled') {

          // Ejecución cancelada manualmente
            finalMessage = '[ABORTADO] La ejecución ha sido detenida forzosamente.';

        } else {

            // Diferencia errores de tiempo de ejecución y errores del código
            if (data.stderr && data.stderr.includes('Tiempo de ejecución')) {

                finalMessage = '[TIMEOUT] Proceso eliminado por superar el tiempo máximo de ejecución permitido.';

            } else {

                finalMessage = '[FINALIZADO] Ejecución fallida. Revisa la salida del compilador arriba.';
            }
        }
          
        // Muestra el estado final de la ejecución
        this.printToConsole(`\n${finalMessage}`, statusColor);
        
        // Finaliza el estado visual de ejecución
        this.isExecuting.set(false);

        // Elimina la referencia a la tarea activa
        this.currentTaskId.set(null);

        // Actualiza el saldo de tokens disponible
        this.refreshTokens();
      }
    });

    /*
     * Escucha el evento de finalización de una tarea por error
     */
    this.socketService.listen<any>('task_failed').subscribe(data => {

      // Solo la tarea actualmente monitorizada
      if (data.taskId === this.currentTaskId()) {

        // Muestra el error crítico recibido
        this.printToConsole(`[ERROR CRÍTICO] ${data.error}`, 'error');

        // Finaliza el estado visual de ejecución
        this.isExecuting.set(false);

        // Elimina la referencia a la tarea activa
        this.currentTaskId.set(null);
      }
    });
  }

  /*
   * Libera los recursos de comunicación en tiempo real cuando el componente 
   * es destruido
   */
  ngOnDestroy() {

    // Cierra la conexión WebSocket activa
    this.socketService.disconnect();
  }

  /*
   * Mantiene la consola sobre la última línea disponible
   */
  ngAfterViewChecked() {

    // Desplaza la vista al final de la consola
    this.scrollToBottom();
  }

  /*****************************************************************************
   * MODIFICAR DIMENSIONES DEL EDITOR
   *****************************************************************************/

  /*
   * Inicia el proceso de redimensionado manual del área de edición
   */
  startResizing(event: MouseEvent) {

    // Activa el modo de redimensionado
    this.isResizing = true;
    
    // Evita la selección accidental de texto
    event.preventDefault();
  }

  /*
   * Actualiza la altura del editor mientras el usuario arrastra 
   * la barra divisora
   */
  @HostListener('document:mousemove', ['$event'])
  onMouseMove(event: MouseEvent) {

    // Ignora movimientos si no existe redimensionado activo
    if (!this.isResizing) return;

    // Evita selecciones de texto no deseadas
    event.preventDefault();

     // Calcula la nueva altura solicitada
    const newHeight = event.clientY - 150; 
    
    // Calcula la altura máxima permitida para garantizar la visibilidad 
    // de la consola 
    // window.innerHeight es la altura total del navegador.
    const maxHeight = window.innerHeight - 250;

    // Aplica límites mínimo 150px y máximo dinámico
    if (newHeight > 150 && newHeight < maxHeight) {

      // Actualiza la altura del editor
      this.editorHeight.set(newHeight);
    }
  }

  /*
   * Finaliza el proceso de redimensionado cuando el usuario suelta el clic
   */
  @HostListener('document:mouseup')
  onMouseUp() {

    // Desactiva el modo de redimensionado
    this.isResizing = false;
  }

  /*****************************************************************************
   * EJECUCIÓN DE CÓDIGO
   *****************************************************************************/

  /*
   * Envía el código actual para su compilación y ejecución
   */
  executeCode() {

    // Evita ejecuciones cuando el editor está vacío
    if (!this.code().trim()) return;

    // Limpia la salida de ejecuciones anteriores
    this.consoleOutput.set([]);

    // Activa el estado visual de ejecución
    this.isExecuting.set(true);
    
    // Informa al usuario del inicio del proceso
    this.printToConsole('Conectando...', 'info');

    // Envía el código al backend para su procesamiento
    this.cudaService.executeCode(this.code()).subscribe({

      next: (res) => {

        // Recupera el identificador de la tarea
        const taskId = res.data?.taskId || res.taskId; 

        // Almacena el identificador de la tarea
        this.currentTaskId.set(taskId);
        
        // Actualiza el saldo de tokens disponible
        this.refreshTokens();
      },
      error: (err) => {

        // Finaliza el estado visual de ejecución
        this.isExecuting.set(false);

        // Muestra el error producido durante la conexión
        this.printToConsole(`[ERROR] No se pudo conectar: ${err.error?.message || 'Fallo de red'}`, 'error');
      }
    });
  }

  /*
   * Solicita la cancelación de la tarea en ejecución
   */
  cancelExecution() {

    // Recupera el identificador de la tarea activa
    const taskId = this.currentTaskId();

    if (taskId) {

      // Informa al usuario de la cancelación
      this.printToConsole('Abortando proceso por orden del usuario...', 'error');

      // Solicita la cancelación al backend
      this.cudaService.cancelTask(taskId).subscribe({

        next: () => {

          // Finaliza el estado visual de ejecución
          this.isExecuting.set(false);

          // Elimina la referencia a la tarea activa
          this.currentTaskId.set(null);

          // Informa de la cancelación completada
          this.printToConsole('[ABORTADO] La ejecución ha sido detenida.', 'error');

          // Actualiza el saldo de tokens tras la cancelación
          this.refreshTokens();
        },

        // Informa del error producido durante la cancelación
        error: (err) => this.printToConsole('No se pudo cancelar: ' + err.error?.message, 'error')
      });
    }
  }

  /*****************************************************************************
   * UTILIDADES DE CONSOLA
   *****************************************************************************/

  /*
   * Añade una nueva línea a la consola del editor
   */
  private printToConsole(text: string, type: ConsoleLine['type']) {

    // Inserta una nueva entrada manteniendo el historial existente
    this.consoleOutput.update(lines => [...lines, { text, type, timestamp: new Date() }]);
  }

  /*
   * Desplaza la consola hasta la última línea disponible
   */
  private scrollToBottom(): void {
    try {

      // Sitúa el scroll en el final
      this.consoleContainer.nativeElement.scrollTop = this.consoleContainer.nativeElement.scrollHeight;
    } catch(err) { }
  }

  /*****************************************************************************
   * GESTIÓN DE TOKENS
   *****************************************************************************/

  /*
   * Actualiza el número de tokens disponibles del usuario
   */
  refreshTokens() {
    
    // Solicita el saldo de tokens al backend
    this.cudaService.getUserTokens().subscribe({

      // Actualiza el contador de tokens disponible
      next: (res) => this.availableTokens.set(res.data.tokens),

      // Registra errores producidos durante la consulta
      error: (err) => console.error('Error al cargar tokens', err)
    });
  }

  /*****************************************************************************
   * RECUPERACIÓN DE LA ÚLTIMA EJECUCIÓN
   *****************************************************************************/

  /*
   * Recupera manualmente la última ejecución registrada del usuario
   */
  recoverLastExecution(): void {

    // Impide recuperar historial mientras existe una ejecución activa
    if (this.isExecuting()) {
      this.printToConsole('[SISTEMA] No puedes recuperar el historial mientras hay una ejecución en curso.', 'warning' as any);
      return;
    }

    // Impide realizar nuevas recuperaciones durante el periodo de cooldown
    if (this.recoveryCooldown() > 0) {
      return;
    }

    // Inicia el temporizador de 5s
    this.startRecoveryCooldown(5); 

    // Limpia la consola actual
    this.consoleOutput.set([]);

    // Activa el estado visual de recuperación
    this.isRecovering.set(true);

    // Informa del inicio de la búsqueda
    this.printToConsole('[SISTEMA] Recuperando última ejecución en la base de datos...', 'info');

    // Solicita la última ejecución almacenada
    this.cudaService.getLastExecution().subscribe({

      next: (res) => {

        // Finaliza el estado visual de recuperación
        this.isRecovering.set(false);

        // Recupera la información recibida
        const task = res.data;

        // Muestra información general de la ejecución recuperada
        this.printToConsole(`[HISTORIAL] Restaurando Tarea #${task.id} (${new Date(task.created_at).toLocaleString()})`, 'info');

        // Detecta tareas que siguen activas en el servidor
        if (task.status === 'pending' || task.status === 'processing') {

            this.printToConsole(`[SISTEMA] Esta tarea sigue marcada como '${task.status}'. Reenganchando a la espera...`, 'warning' as any);

            // Restaura la tarea activa
            this.currentTaskId.set(task.id);

            // Reactiva el estado visual de ejecución
            this.isExecuting.set(true);
            return;
        }

        // Muestra la salida estándar
        if (task.stdout) this.printToConsole(`\n${task.stdout.trim()}`, 'stdout');

        // Muestra la salida de errores
        if (task.stderr) this.printToConsole(`\n${task.stderr.trim()}`, 'stderr');

        // Determina el color visual asociado al resultado
        const statusColor = task.status === 'completed' ? 'success' : 'error';

        // Obtiene el estado final
        const statusText = task.status.toUpperCase();

        // Muestra el resultado final
        this.printToConsole(`\n[ESTADO FINAL HISTÓRICO] ${statusText}`, statusColor);
      },
      error: (err) => {

        // Finaliza el estado visual de recuperación
        this.isRecovering.set(false);

        // Muestra el error
        this.printToConsole(`[ERROR] ${err.error?.message || 'No se pudo recuperar el historial'}`, 'error');
      }
    });
  }

  /*
   * Inicia un temporizador de enfriamiento utilizado para limitar muchas
   * recuperaciones consecutivas
   */
  private startRecoveryCooldown(seconds: number): void {

    // Inicializa el contador con el valor indicado
    this.recoveryCooldown.set(seconds);
    
    // Crea un temporizador con actualización cada segundo
    const interval = setInterval(() => {

      // Recupera el valor actual del contador
      const current = this.recoveryCooldown();

      // Finaliza cuando se alcanza el valor mínimo
      if (current <= 1) {

        // Reinicia el contador
        this.recoveryCooldown.set(0);

        // Libera el temporizador
        clearInterval(interval);

      } else {

        // Reduce el contador en una unidad
        this.recoveryCooldown.set(current - 1);
      }
    
    // Cada intervalo dura exactamente 1s
    }, 1000);
  }

}