/*******************************************************************************
 * ARCHIVO: cuda.worker.ts                                                     *
 * AUTOR: Raúl Vázquez Rodríguez                                               *
 *                                                                             *
 * DESCRIPCIÓN:                                                                *
 * Worker principal de procesamiento CUDA basado en BullMQ.                    *
 * Se encarga de:                                                              *
 * - Consumir tareas desde Redis                                               *
 * - Ejecutar código CUDA de usuarios                                          *
 * - Gestionar cancelaciones y timeouts                                        *
 * - Actualizar estados en MySQL                                               *
 * - Notificar eventos en tiempo real mediante WebSockets                      *
 * - Cosechar archivos generados por el usuario                                *
 * - Limpiar workspaces temporales tras cada ejecución                         *
 *                                                                             *
 * Representa el núcleo operativo del sistema de ejecución distribuida y       *
 * segura de la plataforma.                                                    *
 *******************************************************************************/

import { Worker, type Job } from 'bullmq';                          // Worker de BullMQ encargado de consumir tareas desde Redis
import dotenv from 'dotenv';                                        // Librería para cargar variables de entorno desde .env
import { cudaService } from '../services/cuda.service.js';          // Servicio encargado de compilar y ejecutar código CUDA
import { workspaceUtil } from '../utils/workspace.util.js';         // Gestor de la creación y destrucción de los Sandboxes físicos
import pool from '../config/db.config.js';                          // Pool de conexiones reutilizable hacia la base de datos
import type { CudaJobData } from '../services/queue.service.js';    // Interfaz que define la estructura de los trabajos
import { activeExecutions } from '../utils/task-registry.util.js';  // Registro global de ejecuciones activas y cancelables
import type { ResultSetHeader, RowDataPacket } from 'mysql2';       // Tipos de mysql2 para tipar resultados y filas de consultas SQL
import { socketService } from '../services/socket.service.js';      // Servicio WebSocket para comunicación en tiempo real
import { logger } from '../utils/logger.util.js';                   // Registrar actividad del servidor en logs
import { redisOptions } from '../config/redis.config.js';           // Instancia configurada y validada de la conexión a Redis

// Carga automáticamente las variables de entorno definidas en .env
dotenv.config();

/*
 * Worker principal de ejecución CUDA
 * Consume tareas desde Redis mediante BullMQ y coordina la ejecución de CUDA, 
 * actualización de estados, notificaciones WebSocket, gestión de cancelaciones 
 * y limpieza de recursos temporales
 * Permite desacoplar la ejecución pesada del servidor Express
 */
export const cudaWorker = new Worker<CudaJobData, void, string>(

    // Nombre exacto de la cola a la que el Worker queda suscrito
    // El Worker permanece escuchando indefinidamente esperando nuevas tareas
    'cuda-execution-queue',

    // Función principal que ejecuta automáticamente por cada tarea recibida
    async (job: Job<CudaJobData>) => {
        
        // ID único de la tarea almacenada en la base de datos
        const { taskId, 

            // Ruta física del workspace temporal donde se ejecutará el código
            workspacePath, 

            // Nombre del archivo principal
            sourceFileName, 

            // ID del usuario propietario de la tarea
            userId, 

            // Lista de archivos inyectados en el entorno
            injectedFiles

        } = job.data;
        
        // Indica inicio del procesamiento
        logger.info(`[Worker] Iniciando procesamiento de la Tarea #${taskId} para el usuario ${userId}`);

        // Crea un AbortController exclusivo para esta ejecución
        // Permite abortar el proceso en caliente
        const abortController = new AbortController();

        // Registra el AbortController en la memoria global
        // Permite localizar rápidamente tareas activas para cancelarlas
        activeExecutions.set(taskId, abortController);

        try {

            // Actualiza la tarea indicando que ya está ejecutándose
            await pool.query("UPDATE tasks SET status = 'processing' WHERE id = ?", [taskId]);

            // Informa al frontend de que la GPU ha comenzado a procesar
            socketService.notifyUser(userId, 'task_updated', {

                // ID de la tarea actual
                taskId,

                 // Nuevo estado
                status: 'processing',

                // Mensaje visual para el usuario
                message: 'Tu código está siendo ejecutado en la GPU...'
            });
            

            // Lanza el proceso dentro del workspace aislado
            const result = await cudaService.compileAndRun(

                // Directorio temporal de trabajo
                workspacePath, 

                // Archivo principal
                sourceFileName, 

                // Señal para abortar el proceso si fuese necesario
                abortController.signal
            );
            
            // Verifica si terminó de forma natural o fue cancelado
            // Si la tarea fue cancelada manualmente indica cancelled
            // Si existe stderr indica failed
            // Si no hay errores indica completed
            const finalStatus = result.isCancelled ? 'cancelled' : (result.stderr ? 'failed' : 'completed');

            // Solo se intenta recolectar archivos si ejecución no fue cancelada
            if (!result.isCancelled) {
                try {

                    // Indica inicio del escaneo del workspace
                    logger.info(`[Worker] Escaneando workspace en busca de nuevos archivos generados...`);
                    
                    // Convierte el array de archivos iniciales en un Map
                    // Esto permie comparaciones rápidas 
                    const injectedMap = new Map<string, number>(injectedFiles);

                    // Importación dinámica del servicio de archivos
                    const { fileService } = await import('../services/file.service.js');

                    // Calcula cuánto espacio libre tiene disponible el usuario
                    const availableQuota = await fileService.getAvailableQuota(userId);
                    
                    // Escanea el workspace y detecta archivos nuevos válidos
                    const { 
                        files: harvestedFiles, 
                        warnings 

                    } = await workspaceUtil.harvestWorkspace(

                        // Ruta física del entorno temporal
                        workspacePath, 

                        // Archivos originales inyectados inicialmente
                        injectedMap, 

                        // Usuario propietario
                        userId, 

                        // Cuota libre disponible
                        availableQuota
                    );
                    
                    // Si se detectan archivos válidos
                    if (harvestedFiles.length > 0) {

                        // Mensaje de éxito
                        logger.info(`[Worker] ¡Cosecha exitosa! Se encontraron ${harvestedFiles.length} archivos nuevos.`);
                        
                        // Recorre todos los archivos encontrados
                        for (const file of harvestedFiles) {

                            // Registramos cada archivo en la base de datos
                            await pool.query<ResultSetHeader>(

                                // Inserción física en la tabla files
                                'INSERT INTO files (user_id, original_name, stored_name, size_bytes, is_global) VALUES (?, ?, ?, ?, ?)',
                                [userId, file.original_name, file.stored_name, file.size_bytes, false]
                            );
                        }

                    } else {

                        // Caso en el que no se generan archivos nuevos
                        logger.info(`[Worker] No se generaron archivos nuevos (aprobados) durante esta ejecución.`);
                    }

                    // Si hubo advertencias
                    if (warnings.length > 0) {
                        
                        // Concatena todas las advertencias en un único texto
                        const combinedWarnings = warnings.join('\n');
                        
                        // Inyecta los warnings dentro del stderr final
                        result.stderr = result.stderr 
                            ? `${result.stderr}\n\n[SISTEMA DE ARCHIVOS]\n${combinedWarnings}`
                            : `[SISTEMA DE ARCHIVOS]\n${combinedWarnings}`;
                    }

                } catch (harvestError: any) {

                    // Error no crítico: la ejecución terminó correctamente
                    logger.error(`[Worker] Falló la cosecha de archivos para la tarea ${taskId}:`, harvestError);

                    // Añade el warning al stderr para informar al usuario
                    result.stderr += `\n[Warning del Sistema] Hubo un problema procesando los archivos generados: ${harvestError.message}`;
                }
            }
                     
            // Guarda estado final, stdout y stderr
            await pool.query(
                "UPDATE tasks SET status = ?, stdout = ?, stderr = ? WHERE id = ?",
                [finalStatus, result.stdout, result.stderr, taskId]
            );

            // Si la tarea fue cancelada en ejecución y gastó 
            // un token (prioridad 10), se le devuelve
            if (finalStatus === 'cancelled' && job.opts.priority === 10) {
                await pool.query('UPDATE users SET tokens = tokens + 1 WHERE id = ?', [userId]);
                logger.info(`[Worker] Token devuelto al usuario ${userId} por cancelación de la Tarea #${taskId}`);
            }

            // Notificación de finalización
            socketService.notifyUser(userId, 'task_completed', {

                // ID de la tarea
                taskId,

                // Estado final
                status: finalStatus,

                // Resultado estándar
                stdout: result.stdout,

                // Errores o warnings
                stderr: result.stderr
            });
            
            // Registro final de éxito
            logger.info(`[Worker] Tarea #${taskId} finalizada con estado: ${finalStatus}`);

        } catch (error: any) {

            // Registro completo del error
            logger.error(`[Worker] Error crítico en Tarea #${taskId}:`, error);

            // Marca la tarea como fallida
            await pool.query(
                "UPDATE tasks SET status = 'failed', stderr = ? WHERE id = ?",
                [
                    // Mensaje de error
                    error.message || 'Error interno del Worker', 

                    // ID de la tarea
                    taskId
                ]
            );
            
            // Avisa al usuario de que ocurrió un fallo crítico o timeout
            socketService.notifyUser(userId, 'task_failed', {

                // ID de la tarea
                taskId,

                // Estado final
                status: 'failed',

                // Error enviado al frontend
                error: error.message || 'Error interno'
            });
            
        } finally {
            
            // Elimina el AbortController de la memoria
            activeExecutions.delete(taskId);

            // Elimina el workspace temporal
            await workspaceUtil.cleanupWorkspace(workspacePath);
        }
    },
    {
        // Conexión Redis centralizada compartida por toda la aplicación
        connection: redisOptions,

        // Número máximo de tareas simultáneas (modificable en caliente)
        concurrency: 1 
    }
);


// Evento lanzado cuando el Worker queda conectado y listo
cudaWorker.on('ready', () => {

    // Log de arranque exitoso
    logger.info('[Worker] Worker de CUDA listo y esperando tareaas...');
});

/*
 * Rutina asíncrona que se ejecuta automaticamente y consulta el límite de 
 * concurrencia en la configuración del sistema
 * Modifica la concurrencia antes de que comience a procesar tareas
 */
(async () => {
    try {

        // Lee la configuración persistente de la base de daos
        const [settings] = await pool.query<RowDataPacket[]>(
            "SELECT setting_value FROM system_settings WHERE setting_key = 'worker_concurrency'"
        );

        // Si existe valor configurado
        if (settings.length > 0) {

            // Convierte el valor string a número entero
            const dbConcurrency = parseInt(settings[0].setting_value, 10);

            // Aplica la concurrencia dinámicamente en memoria
            cudaWorker.concurrency = dbConcurrency;

            // Mensaje exitoso
            logger.info(`[Worker] Concurrencia inicial ajustada a ${dbConcurrency} hilos desde BD.`);
        }

    } catch (error) {

        // Fallo en la lectura y sigue usando concurrencia 1
        logger.error('[Worker] No se pudo leer la concurrencia de la BD. Usando 1 hilo por defecto.');
    }
})();