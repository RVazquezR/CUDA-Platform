/*******************************************************************************
 * ARCHIVO: queue.service.ts                                                   *
 * AUTOR: Raúl Vázquez Rodríguez                                               *
 *                                                                             *
 * DESCRIPCIÓN:                                                                *
 * Servicio de orquestación de colas de procesamiento asíncrono.               *
 * Implementa BullMQ sobre Redis para encolar, priorizar y despachar los       *
 * trabajos de compilación CUDA hacia los hilos de los Workers físicos.        *
 *******************************************************************************/

import { Queue } from 'bullmq';                             // Motor de colas de alto rendimiento basado en Redis
import { redisOptions } from '../config/redis.config.js';   // Instancia configurada y validada de la conexión a Redis

/*
 * Define la estructura de datos que el Worker necesita para ejecutar un 
 * trabajo CUDA
 * Cada tarea enviada a la cola debe cumplir este contrato tipado
 */
export interface CudaJobData {
    taskId: number;          // Identificador único de la task almacenada en MySQL
    workspacePath: string;   // Ruta absoluta de la carpeta temporal (Sandbox) del usuario
    sourceFileName: string;  // Nombre del archivo principal a compilar (main.cu)
    userId: number;          // Identificador del propietario para emitir eventos por WebSocket
    
    // Mapa de archivos inyectados en el Sandbox representados como tuplas [nombre, timestamp]
    // Importante para que el Worker identifique qué archivos fueron generados por la GPU
    injectedFiles: [string, number][];
}

/*
 * Instancia principal de la cola de ejecución CUDA
 * Conecta BullMQ con nuestra infraestructura Redis en memoria gestionando 
 * trabajos asíncronos. Al pasarle 'redisOptions', BullMQ crea internamente una 
 * conexión a medida
 * 1. CudaJobData: El tipo de los datos que enviamos
 * 2. any: El valor de retorno (no importa porque actualiza MySQL directamente)
 * 3. 'execute-cuda': Tipado estricto del nombre del trabajo. Previene errores tipográficos
 * 4. 'cuda-execution-queue': Se indica nombre único de la cola compartida
 */
export const cudaQueue = new Queue<CudaJobData, any, 'execute-cuda'>('cuda-execution-queue', {

    // Inyecta objeto de configuración. BullMQ crea su propia conexión
    connection: redisOptions,
    defaultJobOptions: {
        removeOnComplete: true, // Limpiar de Redis al terminar (historial en MySQL)
        removeOnFail: false,    // Retiene fallos críticos de infraestructura en memoria
        attempts: 1             // Cero reintentos si el código CUDA del alumno da error
    }
});

export const queueService = {
    
    /*
     * Encola un nuevo trabajo a la cola distribuida asignándole una prioridad
     * BullMQ procesa primero los números más bajos (1 = Máxima prioridad)
     */
    async addJob(jobData: CudaJobData, priority: number = 10): Promise<void> {

        // Inserta el trabajo en la cola de BullMQ
        // Se indica nombre lógico del tipo de trabajo
        // jobData: Datos serializados necesarios para el Worker
        await cudaQueue.add('execute-cuda', jobData, {

            // Identificador único de la tarea dentro de BullMQ
            jobId: `task-${jobData.taskId}`,

            // Prioridad interna de ejecución, cuanto menor es mayor prioridad
            priority: priority
        });
    }
};